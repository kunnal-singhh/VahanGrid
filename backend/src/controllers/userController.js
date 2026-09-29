/**
 * src/controllers/userController.js
 *
 * HTTP handlers for VahanGrid user profile endpoints.
 *
 * All routes require the authenticate middleware, so req.user is always set.
 * The user identity is read exclusively from req.user.id — never from the request body.
 */

import * as userService from '../services/userService.js';

/** Indian mobile number: optional +91 or 0 prefix, then 10 digits starting 6-9 */
const PHONE_REGEX = /^(\+91|0)?[6-9]\d{9}$/;

/**
 * GET /api/v1/users/me
 * Return the authenticated user's safe profile.
 */
export async function getMe(req, res, next) {
  try {
    const user = await userService.getUserProfile(req.user.id);
    if (!user) {
      return res.status(404).json({
        success: false,
        error: { code: 'USER_NOT_FOUND', message: 'User profile not found.' },
      });
    }
    return res.status(200).json({ success: true, data: { user } });
  } catch (err) {
    next(err);
  }
}

/**
 * PATCH /api/v1/users/me
 * Update allowed profile fields for the authenticated user.
 * Accepted: name, phone
 * Rejected: id, email, password_hash, created_at, updated_at
 */
export async function updateMe(req, res, next) {
  try {
    const { name, phone } = req.body;
    const updates = {};
    const errors = [];

    // Build the updates object with only provided, validated fields.
    if (name !== undefined) {
      if (typeof name !== 'string' || name.trim().length < 2) {
        errors.push('name must be at least 2 characters.');
      } else {
        updates.name = name.trim();
      }
    }

    if (phone !== undefined) {
      // Allow explicitly setting phone to null to remove it.
      if (phone === null || phone === '') {
        updates.phone = null;
      } else if (typeof phone !== 'string' || !PHONE_REGEX.test(phone.trim())) {
        errors.push('phone must be a valid Indian mobile number (e.g. 9876543210 or +919876543210).');
      } else {
        updates.phone = phone.trim();
      }
    }

    if (errors.length > 0) {
      return res.status(400).json({
        success: false,
        error: { code: 'VALIDATION_ERROR', message: 'Invalid input.', details: errors },
      });
    }

    if (Object.keys(updates).length === 0) {
      return res.status(400).json({
        success: false,
        error: {
          code: 'NO_UPDATES',
          message: 'No updatable fields were provided. Accepted fields: name, phone.',
        },
      });
    }

    const user = await userService.updateUserProfile(req.user.id, updates);
    if (!user) {
      return res.status(404).json({
        success: false,
        error: { code: 'USER_NOT_FOUND', message: 'User not found.' },
      });
    }

    return res.status(200).json({ success: true, data: { user } });
  } catch (err) {
    if (err.statusCode === 409) {
      return res.status(409).json({
        success: false,
        error: { code: err.code, message: err.message },
      });
    }
    if (err.statusCode === 400) {
      return res.status(400).json({
        success: false,
        error: { code: err.code, message: err.message },
      });
    }
    next(err);
  }
}
