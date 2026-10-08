/**
 * backend/src/services/cdrService.js
 *
 * Charge Detail Record (CDR) Service for VahanGrid (Phase 3E.2).
 *
 * Responsibilities:
 *  1. finalizeCdr(sessionId) — creates a CDR for a terminated billable session.
 *     Idempotent: DB UNIQUE constraint on session_id prevents duplicates.
 *  2. getCdrBySessionId(sessionId, userId) — fetch CDR by session, user-scoped.
 *  3. getCdrById(cdrId, userId) — fetch CDR by UUID, user-scoped.
 *  4. listCdrsByUser(userId) — list all CDRs for a user.
 *
 * Architecture:
 *  - CDR is NEVER created before session reaches terminal state (completed | stopped).
 *  - CDR re-uses pricing_breakdown from charging_sessions if already computed,
 *    otherwise computes it from tariff_snapshot + final energy/duration.
 *  - All monetary fields stored as NUMERIC (no float).
 *  - OCPP meter_start_wh / meter_stop_wh pulled from ocpp_transactions if linked.
 *  - Failed and cancelled sessions produce no CDR.
 */

import { query } from '../config/database.js';
import { calculatePrice } from './pricingService.js';

const BILLABLE_STATUSES = new Set(['completed', 'stopped']);
const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

/**
 * Resolve the full session context needed for CDR finalization.
 * Joins connectors → evses → locations → cpos and also pulls the
 * linked OCPP transaction meter readings (if any).
 *
 * @param {string} sessionId
 * @returns {Promise<object|null>}
 */
async function resolveSessionContext(sessionId) {
  const result = await query(
    `SELECT
       cs.id                AS session_id,
       cs.user_id,
       cs.vehicle_id,
       cs.connector_id,
       cs.status            AS session_status,
       cs.started_at,
       cs.ended_at,
       cs.duration_seconds,
       cs.energy_kwh::float AS energy_kwh,
       cs.cost_amount::float AS cost_amount,
       cs.currency,
       cs.tariff_id,
       cs.tariff_snapshot,
       cs.pricing_breakdown,
       -- EVSE
       e.id                 AS evse_id,
       -- Location
       l.id                 AS location_id,
       l.name               AS location_name,
       l.city               AS location_city,
       l.address_line1      AS location_address,
       -- CPO
       c.id                 AS cpo_id,
       c.name               AS cpo_name,
       -- Connector
       cn.standard          AS connector_standard,
       -- OCPP transaction meters (from linked session)
       ot.transaction_id    AS ocpp_transaction_id,
       ot.meter_start_wh::float AS meter_start_wh,
       ot.meter_stop_wh::float  AS meter_stop_wh
     FROM charging_sessions cs
     JOIN connectors  cn ON cs.connector_id = cn.id
     JOIN evses       e  ON cn.evse_id      = e.id
     JOIN locations   l  ON e.location_id   = l.id
     JOIN cpos        c  ON l.cpo_id        = c.id
     LEFT JOIN ocpp_transactions ot ON ot.session_id = cs.id
       AND ot.status = 'completed'
     WHERE cs.id = $1
     LIMIT 1`,
    [sessionId]
  );
  return result.rows[0] || null;
}

// ---------------------------------------------------------------------------
// Exported service functions
// ---------------------------------------------------------------------------

/**
 * Finalize (create) a CDR for a completed or stopped charging session.
 *
 * Idempotency:
 *  - The cdrs table has UNIQUE (session_id). If a CDR already exists for
 *    this session, the INSERT will fail with a unique-violation (23505) which
 *    we catch and silently return the existing CDR instead.
 *
 * Failure cases:
 *  - Session not found → returns null.
 *  - Session not in terminal billable state (failed, cancelled, active, pending) → returns null.
 *  - No ended_at → returns null (session not properly closed).
 *  - No tariff snapshot → CDR created with zero-cost breakdown (energy still recorded).
 *
 * @param {string} sessionId
 * @returns {Promise<object|null>} Created or existing CDR row, or null if session ineligible.
 */
export async function finalizeCdr(sessionId) {
  if (!sessionId || !UUID_REGEX.test(sessionId)) return null;

  const ctx = await resolveSessionContext(sessionId);

  // Guard: session must exist
  if (!ctx) return null;

  // Guard: only finalize billable terminal states
  if (!BILLABLE_STATUSES.has(ctx.session_status)) return null;

  // Guard: session must have an authoritative end timestamp
  if (!ctx.ended_at) return null;

  // Compute pricing from snapshot if breakdown not yet stored
  let breakdown = ctx.pricing_breakdown;
  if (!breakdown && ctx.tariff_snapshot) {
    const durationSeconds = ctx.duration_seconds || 0;
    breakdown = calculatePrice(ctx.tariff_snapshot, {
      energy_kwh: Number(ctx.energy_kwh || 0),
      duration_seconds: durationSeconds,
      idle_seconds: 0,
    });
  }

  // Extract individual pricing line items (default to 0 if no tariff/breakdown)
  const currency    = ctx.currency || (ctx.tariff_snapshot && ctx.tariff_snapshot.currency) || 'INR';
  const energyCost  = breakdown ? Number(breakdown.energy_cost  || 0) : 0;
  const sessionFee  = breakdown ? Number(breakdown.session_fee  || 0) : 0;
  const timeCost    = breakdown ? Number(breakdown.time_cost    || 0) : 0;
  const idleCost    = breakdown ? Number(breakdown.idle_cost    || 0) : 0;
  const subtotal    = breakdown ? Number(breakdown.subtotal     || 0) : 0;
  const taxRate     = breakdown ? Number(breakdown.tax_rate  ?? 0.18) : 0.18;
  const taxAmount   = breakdown ? Number(breakdown.tax_amount   || 0) : 0;
  const totalAmount = breakdown ? Number(breakdown.total_cost   || 0) : 0;

  try {
    const result = await query(
      `INSERT INTO cdrs (
         session_id, ocpp_transaction_id,
         user_id, vehicle_id,
         connector_id, evse_id, location_id, cpo_id,
         cpo_name, location_name, location_city, location_address, connector_standard,
         started_at, ended_at, duration_seconds,
         energy_kwh, meter_start_wh, meter_stop_wh,
         tariff_id, tariff_snapshot,
         pricing_breakdown, currency,
         energy_cost, session_fee, time_cost, idle_cost,
         subtotal, tax_rate, tax_amount, total_amount,
         status, session_status
       ) VALUES (
         $1, $2,
         $3, $4,
         $5, $6, $7, $8,
         $9, $10, $11, $12, $13,
         $14, $15, $16,
         $17, $18, $19,
         $20, $21,
         $22, $23,
         $24, $25, $26, $27,
         $28, $29, $30, $31,
         'finalized', $32
       )
       ON CONFLICT (session_id) DO NOTHING
       RETURNING *`,
      [
        ctx.session_id,
        ctx.ocpp_transaction_id || null,
        ctx.user_id,
        ctx.vehicle_id || null,
        ctx.connector_id,
        ctx.evse_id,
        ctx.location_id,
        ctx.cpo_id,
        ctx.cpo_name,
        ctx.location_name,
        ctx.location_city,
        ctx.location_address || null,
        ctx.connector_standard || null,
        ctx.started_at,
        ctx.ended_at,
        ctx.duration_seconds || 0,
        Number(ctx.energy_kwh || 0),
        ctx.meter_start_wh !== undefined ? ctx.meter_start_wh : null,
        ctx.meter_stop_wh  !== undefined ? ctx.meter_stop_wh  : null,
        ctx.tariff_id || null,
        ctx.tariff_snapshot ? JSON.stringify(ctx.tariff_snapshot) : null,
        breakdown ? JSON.stringify(breakdown) : null,
        currency,
        energyCost,
        sessionFee,
        timeCost,
        idleCost,
        subtotal,
        taxRate,
        taxAmount,
        totalAmount,
        ctx.session_status,
      ]
    );

    // ON CONFLICT DO NOTHING returns 0 rows — fetch the existing CDR
    if (result.rows.length === 0) {
      return await getCdrBySessionId(ctx.session_id);
    }

    return result.rows[0];
  } catch (err) {
    // 23505 = unique_violation (race condition — CDR already created by concurrent path)
    if (err.code === '23505') {
      return await getCdrBySessionId(ctx.session_id);
    }
    throw err;
  }
}

/**
 * Retrieves a CDR by its session_id, enforcing user ownership.
 *
 * @param {string} sessionId
 * @param {string} [userId] - If provided, ownership is enforced (403 if mismatched).
 * @returns {Promise<object|null>}
 */
export async function getCdrBySessionId(sessionId, userId = null) {
  if (!sessionId) return null;

  const result = await query(
    `SELECT * FROM cdrs WHERE session_id = $1`,
    [sessionId]
  );

  const cdr = result.rows[0] || null;
  if (!cdr) return null;

  // If userId provided, enforce ownership
  if (userId && cdr.user_id !== userId) {
    const err = new Error('Access denied: CDR belongs to another user.');
    err.statusCode = 403;
    err.code = 'CDR_ACCESS_DENIED';
    throw err;
  }

  return cdr;
}

/**
 * Retrieves a CDR by its UUID, enforcing user ownership.
 *
 * @param {string} cdrId
 * @param {string} [userId]
 * @returns {Promise<object|null>}
 */
export async function getCdrById(cdrId, userId = null) {
  if (!cdrId || !UUID_REGEX.test(cdrId)) {
    const err = new Error('CDR ID must be a valid UUID.');
    err.statusCode = 400;
    err.code = 'INVALID_CDR_ID';
    throw err;
  }

  const result = await query(
    `SELECT * FROM cdrs WHERE id = $1`,
    [cdrId]
  );

  const cdr = result.rows[0] || null;
  if (!cdr) return null;

  if (userId && cdr.user_id !== userId) {
    const err = new Error('Access denied: CDR belongs to another user.');
    err.statusCode = 403;
    err.code = 'CDR_ACCESS_DENIED';
    throw err;
  }

  return cdr;
}

/**
 * Lists all CDRs for the authenticated user, newest first.
 *
 * @param {string} userId
 * @returns {Promise<Array<object>>}
 */
export async function listCdrsByUser(userId) {
  if (!userId) return [];

  const result = await query(
    `SELECT
       c.id,
       c.session_id,
       c.ocpp_transaction_id,
       c.user_id,
       c.vehicle_id,
       c.location_id,
       c.location_name,
       c.location_city,
       c.connector_standard,
       c.started_at,
       c.ended_at,
       c.duration_seconds,
       c.energy_kwh::float       AS energy_kwh,
       c.currency,
       c.total_amount::float      AS total_amount,
       c.status,
       c.session_status,
       c.created_at
     FROM cdrs c
     WHERE c.user_id = $1
     ORDER BY c.started_at DESC`,
    [userId]
  );

  return result.rows;
}

/**
 * Fetches full CDR detail by UUID.
 *
 * @param {string} cdrId
 * @param {string} userId
 * @returns {Promise<object|null>}
 */
export async function getCdrDetail(cdrId, userId) {
  const cdr = await getCdrById(cdrId, userId);
  return cdr;
}
