/**
 * backend/src/services/pricingService.js
 *
 * Deterministic EV Charging Pricing Engine for VahanGrid (Phase 3E.1).
 *
 * Responsibilities:
 *  1. Pure, deterministic monetary calculation for EV charging sessions.
 *  2. Evaluates pricing components:
 *     - Energy charge: energy_kwh * price_per_kwh
 *     - Session/Start fee: flat activation charge
 *     - Time charge: duration_minutes * price_per_minute
 *     - Idle/Overstay fee: (idle_minutes - grace_period) * idle_fee_per_minute
 *     - Subtotal before taxes
 *     - Goods & Services Tax (GST): subtotal * tax_rate (standard 18% in India)
 *     - Total price payable
 *  3. Precision & Rounding rules:
 *     - Calculations use exact 2-decimal rounded half-up precision per component
 *       to prevent cumulative floating-point drift.
 *     - Currency defaults to 'INR'.
 *  4. Builds self-contained, immutable Tariff Snapshots locked into charging sessions.
 */

/**
 * Rounds a numeric value to 2 decimal places using standard half-up rounding.
 *
 * @param {number} value
 * @returns {number}
 */
export function roundToPaisa(value) {
  if (!Number.isFinite(value)) return 0.00;
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

/**
 * Creates an immutable, self-contained JSON snapshot of a tariff for session locking.
 *
 * @param {object} tariff
 * @returns {object}
 */
export function buildTariffSnapshot(tariff) {
  if (!tariff) return null;

  return {
    tariff_id: tariff.id || null,
    name: tariff.name || 'Default Tariff',
    currency: tariff.currency || 'INR',
    price_per_kwh: Number(tariff.price_per_kwh || 0),
    session_fee: Number(tariff.session_fee || 0),
    price_per_minute: Number(tariff.price_per_minute || 0),
    idle_fee_per_minute: Number(tariff.idle_fee_per_minute || 0),
    grace_period_minutes: Math.max(0, parseInt(tariff.grace_period_minutes, 10) || 0),
    tax_rate: Number(tariff.tax_rate ?? 0.1800),
    snapshotted_at: new Date().toISOString(),
  };
}

/**
 * Calculates deterministic pricing breakdown given a tariff/snapshot and session metrics.
 *
 * @param {object} tariff - Tariff row or tariff_snapshot object
 * @param {object} [metrics={}] - Consumption and duration metrics
 * @param {number} [metrics.energy_kwh=0] - Energy delivered in kWh
 * @param {number} [metrics.duration_seconds=0] - Charging duration in seconds
 * @param {number} [metrics.idle_seconds=0] - Post-charging idle/plugged-in duration in seconds
 * @returns {object} Complete standardized pricing breakdown
 */
export function calculatePrice(tariff, metrics = {}) {
  const safeTariff = tariff || {
    currency: 'INR',
    price_per_kwh: 0,
    session_fee: 0,
    price_per_minute: 0,
    idle_fee_per_minute: 0,
    grace_period_minutes: 0,
    tax_rate: 0.1800,
  };

  const energyKwh = Math.max(0, Number(metrics.energy_kwh || 0));
  const durationSeconds = Math.max(0, Math.round(Number(metrics.duration_seconds || 0)));
  const durationMinutes = Math.ceil(durationSeconds / 60);

  const idleSeconds = Math.max(0, Math.round(Number(metrics.idle_seconds || 0)));
  const idleMinutesRaw = Math.ceil(idleSeconds / 60);
  const graceMinutes = Math.max(0, parseInt(safeTariff.grace_period_minutes, 10) || 0);
  const billableIdleMinutes = Math.max(0, idleMinutesRaw - graceMinutes);

  const pricePerKwh = Number(safeTariff.price_per_kwh || 0);
  const sessionFee = Number(safeTariff.session_fee || 0);
  const pricePerMinute = Number(safeTariff.price_per_minute || 0);
  const idleFeePerMinute = Number(safeTariff.idle_fee_per_minute || 0);
  const taxRate = Number(safeTariff.tax_rate ?? 0.1800);

  // Calculate individual line items with deterministic 2-decimal half-up rounding
  const energyCost = roundToPaisa(energyKwh * pricePerKwh);
  const sessionCost = roundToPaisa(sessionFee);
  const timeCost = roundToPaisa(durationMinutes * pricePerMinute);
  const idleCost = roundToPaisa(billableIdleMinutes * idleFeePerMinute);

  const subtotal = roundToPaisa(energyCost + sessionCost + timeCost + idleCost);
  const taxAmount = roundToPaisa(subtotal * taxRate);
  const totalCost = roundToPaisa(subtotal + taxAmount);

  return {
    currency: safeTariff.currency || 'INR',
    energy_kwh: energyKwh,
    price_per_kwh: pricePerKwh,
    energy_cost: energyCost,
    duration_seconds: durationSeconds,
    duration_minutes: durationMinutes,
    price_per_minute: pricePerMinute,
    time_cost: timeCost,
    session_fee: sessionCost,
    idle_seconds: idleSeconds,
    idle_minutes: idleMinutesRaw,
    grace_period_minutes: graceMinutes,
    billable_idle_minutes: billableIdleMinutes,
    idle_fee_per_minute: idleFeePerMinute,
    idle_cost: idleCost,
    subtotal: subtotal,
    tax_rate: taxRate,
    tax_amount: taxAmount,
    total_cost: totalCost,
  };
}
