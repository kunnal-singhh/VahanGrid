/**
 * backend/src/controllers/tariffController.js
 *
 * REST API controller for VahanGrid tariff management and pricing calculations (Phase 3E.1).
 */

import * as tariffService from '../services/tariffService.js';
import * as pricingService from '../services/pricingService.js';

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * POST /api/v1/tariffs
 * Create a new tariff.
 */
export async function createTariffHandler(req, res, next) {
  try {
    const tariff = await tariffService.createTariff(req.body || {});
    return res.status(201).json({
      success: true,
      data: tariff,
    });
  } catch (err) {
    if (err.statusCode) {
      return res.status(err.statusCode).json({
        success: false,
        error: {
          code: err.code || 'TARIFF_ERROR',
          message: err.message,
        },
      });
    }
    next(err);
  }
}

/**
 * GET /api/v1/tariffs
 * List tariffs with optional filters (location_id, cpo_id, is_active).
 */
export async function listTariffsHandler(req, res, next) {
  try {
    const filters = { ...(req.query || {}) };
    if (req.user?.role === 'operator') {
      filters.cpo_id = req.user.cpo_id;
    }
    const tariffs = await tariffService.listTariffs(filters);
    return res.status(200).json({
      success: true,
      data: tariffs,
      meta: {
        count: tariffs.length,
      },
    });
  } catch (err) {
    if (err.statusCode) {
      return res.status(err.statusCode).json({
        success: false,
        error: {
          code: err.code || 'TARIFF_ERROR',
          message: err.message,
        },
      });
    }
    next(err);
  }
}

/**
 * GET /api/v1/tariffs/resolve
 * Resolve the applicable active tariff for a target connector, EVSE, location, or CPO.
 */
export async function resolveTariffHandler(req, res, next) {
  try {
    const { connector_id, evse_id, location_id, cpo_id, timestamp } = req.query;

    if (location_id && !UUID_REGEX.test(location_id)) {
      return res.status(400).json({
        success: false,
        error: { code: 'INVALID_ID', message: "Invalid 'location_id' UUID." },
      });
    }
    if (connector_id && !UUID_REGEX.test(connector_id)) {
      return res.status(400).json({
        success: false,
        error: { code: 'INVALID_ID', message: "Invalid 'connector_id' UUID." },
      });
    }
    if (evse_id && !UUID_REGEX.test(evse_id)) {
      return res.status(400).json({
        success: false,
        error: { code: 'INVALID_ID', message: "Invalid 'evse_id' UUID." },
      });
    }
    if (cpo_id && !UUID_REGEX.test(cpo_id)) {
      return res.status(400).json({
        success: false,
        error: { code: 'INVALID_ID', message: "Invalid 'cpo_id' UUID." },
      });
    }

    const tariff = await tariffService.resolveApplicableTariff({
      connector_id,
      evse_id,
      location_id,
      cpo_id,
      timestamp,
    });

    if (!tariff) {
      return res.status(404).json({
        success: false,
        error: {
          code: 'NO_APPLICABLE_TARIFF',
          message: 'No active tariff configured for the specified target.',
        },
      });
    }

    return res.status(200).json({
      success: true,
      data: tariff,
    });
  } catch (err) {
    if (err.statusCode) {
      return res.status(err.statusCode).json({
        success: false,
        error: {
          code: err.code || 'TARIFF_ERROR',
          message: err.message,
        },
      });
    }
    next(err);
  }
}

/**
 * POST /api/v1/tariffs/calculate
 * Calculate deterministic pricing breakdown given a tariff and metrics.
 */
export async function calculatePricingHandler(req, res, next) {
  try {
    const { tariff_id, tariff, metrics } = req.body || {};

    let targetTariff = tariff;
    if (tariff_id) {
      if (!UUID_REGEX.test(tariff_id)) {
        return res.status(400).json({
          success: false,
          error: { code: 'INVALID_ID', message: "Invalid 'tariff_id' UUID." },
        });
      }
      targetTariff = await tariffService.getTariffById(tariff_id);
      if (!targetTariff) {
        return res.status(404).json({
          success: false,
          error: { code: 'TARIFF_NOT_FOUND', message: `Tariff '${tariff_id}' was not found.` },
        });
      }
    }

    if (!targetTariff) {
      return res.status(400).json({
        success: false,
        error: {
          code: 'MISSING_TARIFF',
          message: "Either 'tariff_id' or 'tariff' object is required for pricing calculation.",
        },
      });
    }

    const calculation = pricingService.calculatePrice(targetTariff, metrics || {});

    return res.status(200).json({
      success: true,
      data: calculation,
    });
  } catch (err) {
    if (err.statusCode) {
      return res.status(err.statusCode).json({
        success: false,
        error: {
          code: err.code || 'PRICING_ERROR',
          message: err.message,
        },
      });
    }
    next(err);
  }
}

/**
 * GET /api/v1/tariffs/:id
 * Retrieve tariff details by UUID.
 */
export async function getTariffByIdHandler(req, res, next) {
  try {
    const { id } = req.params;
    const tariff = await tariffService.getTariffById(id);

    if (!tariff) {
      return res.status(404).json({
        success: false,
        error: {
          code: 'TARIFF_NOT_FOUND',
          message: `Tariff with ID '${id}' was not found.`,
        },
      });
    }

    return res.status(200).json({
      success: true,
      data: tariff,
    });
  } catch (err) {
    if (err.statusCode) {
      return res.status(err.statusCode).json({
        success: false,
        error: {
          code: err.code || 'TARIFF_ERROR',
          message: err.message,
        },
      });
    }
    next(err);
  }
}

/**
 * PATCH /api/v1/tariffs/:id
 * Update an existing tariff.
 */
export async function updateTariffHandler(req, res, next) {
  try {
    const { id } = req.params;
    const updated = await tariffService.updateTariff(id, req.body || {});

    return res.status(200).json({
      success: true,
      data: updated,
    });
  } catch (err) {
    if (err.statusCode) {
      return res.status(err.statusCode).json({
        success: false,
        error: {
          code: err.code || 'TARIFF_ERROR',
          message: err.message,
        },
      });
    }
    next(err);
  }
}

/**
 * DELETE /api/v1/tariffs/:id
 * Delete or deactivate a tariff.
 */
export async function deleteTariffHandler(req, res, next) {
  try {
    const { id } = req.params;
    const result = await tariffService.deleteTariff(id);

    return res.status(200).json({
      success: true,
      data: result,
    });
  } catch (err) {
    if (err.statusCode) {
      return res.status(err.statusCode).json({
        success: false,
        error: {
          code: err.code || 'TARIFF_ERROR',
          message: err.message,
        },
      });
    }
    next(err);
  }
}
