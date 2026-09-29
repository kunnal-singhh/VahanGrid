/**
 * src/services/authService.js
 *
 * Authentication business logic for VahanGrid.
 *
 * Responsibilities:
 * - Register a new user (with wallet) inside a single DB transaction.
 * - Validate credentials and return a safe user object on login.
 * - Look up a user by ID (for /auth/me).
 *
 * Rules followed here:
 * - Parameterized SQL only — never string-concatenate user input.
 * - Passwords are hashed with bcryptjs before storage; the raw value is never logged.
 * - password_hash is never returned to callers.
 * - Wallet creation is atomic with user creation (single transaction).
 */

import bcrypt from 'bcryptjs';
import pool, { query } from '../config/database.js';

// bcrypt cost factor. 12 is a good balance of security and speed.
const BCRYPT_ROUNDS = 12;

/**
 * Strip fields that must never leave the server.
 */
function safeUser(row) {
  const { password_hash: _, ...safe } = row;
  return safe;
}

/**
 * Register a new user with an atomic wallet creation.
 */
export async function registerUser({ name, email, phone, password }) {
  const passwordHash = await bcrypt.hash(password, BCRYPT_ROUNDS);

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const insertUserSQL = `
      INSERT INTO users (name, email, phone, password_hash)
      VALUES ($1, $2, $3, $4)
      RETURNING id, name, email, phone, created_at, updated_at
    `;
    const userResult = await client.query(insertUserSQL, [
      name,
      email.toLowerCase().trim(),
      phone || null,
      passwordHash,
    ]);
    const user = userResult.rows[0];

    const insertWalletSQL = `
      INSERT INTO wallets (user_id, currency, status)
      VALUES ($1, 'INR', 'active')
      RETURNING id
    `;
    await client.query(insertWalletSQL, [user.id]);

    await client.query('COMMIT');
    return user;
  } catch (err) {
    await client.query('ROLLBACK');

    if (err.code === '23505') {
      const constraint = err.constraint || '';
      if (constraint.includes('email')) {
        const error = new Error('An account with this email address already exists.');
        error.statusCode = 409;
        error.code = 'DUPLICATE_EMAIL';
        throw error;
      }
      if (constraint.includes('phone')) {
        const error = new Error('An account with this phone number already exists.');
        error.statusCode = 409;
        error.code = 'DUPLICATE_PHONE';
        throw error;
      }
      const error = new Error('A conflict occurred. Please check your details and try again.');
      error.statusCode = 409;
      error.code = 'DUPLICATE_FIELD';
      throw error;
    }

    if (err.code === '23514') {
      const error = new Error('The email address format is invalid.');
      error.statusCode = 400;
      error.code = 'INVALID_EMAIL_FORMAT';
      throw error;
    }

    throw err;
  } finally {
    client.release();
  }
}

/**
 * Validate credentials. Returns null for both not-found and wrong-password
 * to prevent email enumeration.
 */
export async function verifyCredentials(email, password) {
  const result = await query(
    `SELECT id, name, email, phone, password_hash, created_at, updated_at
     FROM users
     WHERE email = $1`,
    [email.toLowerCase().trim()]
  );

  const user = result.rows[0];
  if (!user) {
    await bcrypt.compare(password, '$2b$12$invalidhashpadding000000000000000000000000000000000000');
    return null;
  }

  const passwordMatch = await bcrypt.compare(password, user.password_hash);
  if (!passwordMatch) return null;

  return safeUser(user);
}

/**
 * Fetch a user by UUID (used by /auth/me).
 */
export async function getUserById(userId) {
  const result = await query(
    `SELECT id, name, email, phone, created_at, updated_at
     FROM users
     WHERE id = $1`,
    [userId]
  );

  return result.rows[0] || null;
}
