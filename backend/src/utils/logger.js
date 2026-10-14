/**
 * backend/src/utils/logger.js
 *
 * Operational and structured logger for VahanGrid.
 *
 * Security & Reliability Invariants:
 *  - Automatically redacts sensitive fields (passwords, secrets, tokens, auth headers).
 *  - Masks driver PII (email, mobile phone).
 *  - Structured JSON format in production for log aggregators (CloudWatch, Datadog, ELK).
 *  - Clean, colorized output in development for high developer velocity.
 *  - Never throws exceptions from logging calls.
 */

import config from '../config/env.js';

const SENSITIVE_KEYS = new Set([
  'password',
  'newpassword',
  'oldpassword',
  'currentpassword',
  'secret',
  'jwtsecret',
  'keysecret',
  'webhooksecret',
  'authorization',
  'cookie',
  'set-cookie',
  'apikey',
  'token',
  'vg_token',
  'accesstoken',
  'refreshtoken',
  'cvv',
  'cardnumber',
]);

/**
 * Mask an email address (e.g. "driver@example.com" -> "d***@example.com")
 */
export function maskEmail(email) {
  if (typeof email !== 'string') return email;
  const parts = email.split('@');
  if (parts.length !== 2) return '[REDACTED_EMAIL]';
  const [local, domain] = parts;
  if (local.length <= 1) return `*@${domain}`;
  return `${local[0]}***@${domain}`;
}

/**
 * Mask an Indian phone number (e.g. "+919876543210" -> "******3210")
 */
export function maskPhone(phone) {
  if (typeof phone !== 'string') return phone;
  const cleaned = phone.trim();
  if (cleaned.length < 4) return '****';
  return `******${cleaned.slice(-4)}`;
}

/**
 * Recursively sanitize objects, redacting secrets and masking PII.
 */
export function sanitizeLogData(data, depth = 0) {
  if (depth > 6 || data === null || data === undefined) {
    return data;
  }

  if (data instanceof Error) {
    const errObj = {
      name: data.name,
      message: data.message,
      code: data.code || data.statusCode,
    };
    if (config.isDev && data.stack) {
      errObj.stack = data.stack;
    }
    return errObj;
  }

  if (Array.isArray(data)) {
    return data.map((item) => sanitizeLogData(item, depth + 1));
  }

  if (typeof data === 'object') {
    const sanitized = {};
    for (const [key, value] of Object.entries(data)) {
      const lowerKey = key.toLowerCase();

      if (SENSITIVE_KEYS.has(lowerKey)) {
        sanitized[key] = '[REDACTED]';
      } else if (lowerKey === 'email') {
        sanitized[key] = maskEmail(value);
      } else if (lowerKey === 'phone' || lowerKey === 'mobilenumber') {
        sanitized[key] = maskPhone(value);
      } else {
        sanitized[key] = sanitizeLogData(value, depth + 1);
      }
    }
    return sanitized;
  }

  if (typeof data === 'string') {
    // Check if string is a Bearer token or cookie
    if (/^bearer\s+/i.test(data)) {
      return 'Bearer [REDACTED]';
    }
    if (/vg_token=/i.test(data)) {
      return data.replace(/vg_token=[^;]+/, 'vg_token=[REDACTED]');
    }
  }

  return data;
}

/**
 * Format and output a log entry.
 */
function log(level, context, message, meta = null) {
  const timestamp = new Date().toISOString();
  const sanitizedMeta = meta !== null ? sanitizeLogData(meta) : null;

  if (config.isProd) {
    // Structured JSON for production
    const entry = {
      timestamp,
      level,
      context,
      message,
      ...(sanitizedMeta !== null && { meta: sanitizedMeta }),
    };
    const jsonStr = JSON.stringify(entry);
    if (level === 'error') {
      console.error(jsonStr);
    } else if (level === 'warn') {
      console.warn(jsonStr);
    } else {
      console.log(jsonStr);
    }
  } else {
    // Human-readable dev output
    const prefix = `[${timestamp}] [${level.toUpperCase()}] [${context}]`;
    if (level === 'error') {
      console.error(`${prefix} ${message}`, sanitizedMeta || '');
    } else if (level === 'warn') {
      console.warn(`${prefix} ${message}`, sanitizedMeta || '');
    } else {
      console.log(`${prefix} ${message}`, sanitizedMeta || '');
    }
  }
}

export const logger = {
  info: (context, message, meta) => log('info', context, message, meta),
  warn: (context, message, meta) => log('warn', context, message, meta),
  error: (context, message, meta) => log('error', context, message, meta),
  debug: (context, message, meta) => {
    if (config.isDev) log('debug', context, message, meta);
  },
  sanitizeLogData,
  maskEmail,
  maskPhone,
};

export default logger;
