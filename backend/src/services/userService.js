/**
 * src/services/userService.js
 *
 * Database access layer for VahanGrid user profile operations.
 *
 * - Reads and updates the users table.
 * - Never returns password_hash to callers.
 * - All SQL is parameterized.
 */

import { query } from '../config/database.js';

/** Fields returned by every user query — password_hash is deliberately excluded. */
const USER_FIELDS = `id, name, email, phone, role, cpo_id, created_at, updated_at`;

/**
 * Fetch a user's safe profile by UUID.
 *
 * @param {string} userId
 * @returns {Promise<object|null>}
 */
export async function getUserProfile(userId) {
  const result = await query(
    `SELECT ${USER_FIELDS} FROM users WHERE id = $1`,
    [userId]
  );
  return result.rows[0] || null;
}

/**
 * Update allowed profile fields for a user.
 *
 * Only the fields explicitly provided in `updates` are changed.
 * Builds a dynamic UPDATE safely using a parameterised approach —
 * field names come only from a hard-coded allowlist (never from user input).
 *
 * @param {string} userId
 * @param {{ name?: string, phone?: string|null }} updates
 * @returns {Promise<object|null>} Updated safe user object
 */
export async function updateUserProfile(userId, updates) {
  // Only these fields may be changed via PATCH /users/me.
  const ALLOWED = ['name', 'phone'];

  const setClauses = [];
  const values = [];
  let idx = 1;

  for (const field of ALLOWED) {
    if (Object.prototype.hasOwnProperty.call(updates, field)) {
      setClauses.push(`${field} = $${idx}`);
      values.push(updates[field]);
      idx++;
    }
  }

  if (setClauses.length === 0) return null; // caller should handle this

  // Always bump updated_at.
  setClauses.push(`updated_at = CURRENT_TIMESTAMP`);

  values.push(userId); // WHERE clause param

  try {
    const result = await query(
      `UPDATE users
       SET ${setClauses.join(', ')}
       WHERE id = $${idx}
       RETURNING ${USER_FIELDS}`,
      values
    );
    return result.rows[0] || null;
  } catch (err) {
    // Map unique constraint violation on phone to a typed error.
    if (err.code === '23505' && (err.constraint || '').includes('phone')) {
      const error = new Error('This phone number is already associated with another account.');
      error.statusCode = 409;
      error.code = 'DUPLICATE_PHONE';
      throw error;
    }
    // DB check constraint: phone length
    if (err.code === '23514') {
      const error = new Error('Phone number must be at least 10 characters.');
      error.statusCode = 400;
      error.code = 'INVALID_PHONE';
      throw error;
    }
    throw err;
  }
}
