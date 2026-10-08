/**
 * backend/src/controllers/stationController.js
 *
 * Controller handling HTTP requests for VahanGrid charging stations.
 *
 * Responsibilities:
 * - Validates query/path parameters (lat, lng, radius_km, UUID).
 * - Delegates business and database logic to the stationService.
 * - Formats standardized JSON responses.
 * - Forwards unexpected exceptions to the centralized error handler via next(err).
 */

import * as stationService from '../services/stationService.js';
import * as availabilityService from '../services/availabilityService.js';
import * as remoteOperationService from '../services/remoteOperationService.js';
import * as chargingProfileService from '../services/chargingProfileService.js';
import * as tariffService from '../services/tariffService.js';

// Regex to validate 8-4-4-4-12 hex UUID format
const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * GET /api/v1/stations
 * Retrieve all charging stations.
 */
export async function getAllStations(_req, res, next) {
  try {
    const stations = await stationService.getAllStations();
    return res.status(200).json({
      success: true,
      data: stations,
      meta: {
        count: stations.length,
      },
    });
  } catch (err) {
    next(err);
  }
}

/**
 * GET /api/v1/stations/:id
 * Retrieve station by UUID.
 */
export async function getStationById(req, res, next) {
  try {
    const { id } = req.params;

    if (!id || !UUID_REGEX.test(id)) {
      return res.status(400).json({
        success: false,
        error: {
          code: 'INVALID_ID',
          message: 'The requested station ID must be a valid UUID.',
        },
      });
    }

    const station = await stationService.getStationById(id);

    if (!station) {
      return res.status(404).json({
        success: false,
        error: {
          code: 'STATION_NOT_FOUND',
          message: `Station with ID '${id}' was not found.`,
        },
      });
    }

    return res.status(200).json({
      success: true,
      data: station,
    });
  } catch (err) {
    next(err);
  }
}

/**
 * GET /api/v1/stations/nearby
 * Find stations within a given radius using PostGIS.
 *
 * Query params:
 *   - lat: number (-90 to 90) [required]
 *   - lng: number (-180 to 180) [required]
 *   - radius_km: number (> 0 and <= 100) [optional, default 5]
 */
export async function getNearbyStations(req, res, next) {
  try {
    const { lat, lng, radius_km } = req.query;

    // 1. Validate latitude
    if (lat === undefined || lat === null || lat.trim() === '') {
      return res.status(400).json({
        success: false,
        error: {
          code: 'INVALID_QUERY',
          message: "Query parameter 'lat' is required.",
        },
      });
    }

    const latNum = parseFloat(lat);
    if (isNaN(latNum) || latNum < -90 || latNum > 90) {
      return res.status(400).json({
        success: false,
        error: {
          code: 'INVALID_QUERY',
          message: "'lat' must be a valid number between -90 and 90.",
        },
      });
    }

    // 2. Validate longitude
    if (lng === undefined || lng === null || lng.trim() === '') {
      return res.status(400).json({
        success: false,
        error: {
          code: 'INVALID_QUERY',
          message: "Query parameter 'lng' is required.",
        },
      });
    }

    const lngNum = parseFloat(lng);
    if (isNaN(lngNum) || lngNum < -180 || lngNum > 180) {
      return res.status(400).json({
        success: false,
        error: {
          code: 'INVALID_QUERY',
          message: "'lng' must be a valid number between -180 and 180.",
        },
      });
    }

    // 3. Validate radius_km
    let radiusNum = 5; // default 5 km
    if (radius_km !== undefined && radius_km !== null && radius_km.trim() !== '') {
      radiusNum = parseFloat(radius_km);
      if (isNaN(radiusNum) || radiusNum <= 0 || radiusNum > 100) {
        return res.status(400).json({
          success: false,
          error: {
            code: 'INVALID_QUERY',
            message: "'radius_km' must be a positive number greater than 0 and at most 100.",
          },
        });
      }
    }

    const stations = await stationService.getNearbyStations(latNum, lngNum, radiusNum);

    return res.status(200).json({
      success: true,
      data: stations,
      meta: {
        count: stations.length,
        center: {
          latitude: latNum,
          longitude: lngNum,
        },
        radius_km: radiusNum,
      },
    });
  } catch (err) {
    next(err);
  }
}

/**
 * POST /api/v1/stations/:id/availability
 * Change operational availability of a charging station, EVSE, or connector.
 */
export async function changeAvailabilityHandler(req, res, next) {
  try {
    const { id } = req.params;

    if (!id || !UUID_REGEX.test(id)) {
      return res.status(400).json({
        success: false,
        error: {
          code: 'INVALID_ID',
          message: 'The requested station ID must be a valid UUID.',
        },
      });
    }

    const result = await availabilityService.changeAvailability(id, req.body || {});

    return res.status(200).json({
      success: true,
      data: result,
    });
  } catch (err) {
    if (err.statusCode) {
      return res.status(err.statusCode).json({
        success: false,
        error: {
          code: err.code || 'AVAILABILITY_ERROR',
          message: err.message,
        },
      });
    }
    next(err);
  }
}

/**
 * POST /api/v1/stations/:id/reset
 * Trigger a soft (OnIdle) or hard (Immediate) reboot of a charging station or EVSE.
 */
export async function resetStationHandler(req, res, next) {
  try {
    const { id } = req.params;

    if (!id || !UUID_REGEX.test(id)) {
      return res.status(400).json({
        success: false,
        error: {
          code: 'INVALID_ID',
          message: 'The requested station ID must be a valid UUID.',
        },
      });
    }

    const result = await remoteOperationService.reset(id, req.body || {});

    return res.status(200).json({
      success: true,
      data: result,
    });
  } catch (err) {
    if (err.statusCode) {
      return res.status(err.statusCode).json({
        success: false,
        error: {
          code: err.code || 'RESET_ERROR',
          message: err.message,
        },
      });
    }
    next(err);
  }
}

/**
 * POST /api/v1/stations/:id/unlock-connector
 * Remotely unlock a specific connector cable lock.
 */
export async function unlockConnectorHandler(req, res, next) {
  try {
    const { id } = req.params;

    if (!id || !UUID_REGEX.test(id)) {
      return res.status(400).json({
        success: false,
        error: {
          code: 'INVALID_ID',
          message: 'The requested station ID must be a valid UUID.',
        },
      });
    }

    const result = await remoteOperationService.unlockConnector(id, req.body || {});

    return res.status(200).json({
      success: true,
      data: result,
    });
  } catch (err) {
    if (err.statusCode) {
      return res.status(err.statusCode).json({
        success: false,
        error: {
          code: err.code || 'UNLOCK_ERROR',
          message: err.message,
        },
      });
    }
    next(err);
  }
}

/**
 * POST /api/v1/stations/:id/trigger-message
 * Remotely trigger diagnostic/state message transmission from a charging station.
 */
export async function triggerMessageHandler(req, res, next) {
  try {
    const { id } = req.params;

    if (!id || !UUID_REGEX.test(id)) {
      return res.status(400).json({
        success: false,
        error: {
          code: 'INVALID_ID',
          message: 'The requested station ID must be a valid UUID.',
        },
      });
    }

    const result = await remoteOperationService.triggerMessage(id, req.body || {});

    return res.status(200).json({
      success: true,
      data: result,
    });
  } catch (err) {
    if (err.statusCode) {
      return res.status(err.statusCode).json({
        success: false,
        error: {
          code: err.code || 'TRIGGER_MESSAGE_ERROR',
          message: err.message,
        },
      });
    }
    next(err);
  }
}

/**
 * POST /api/v1/stations/:id/charging-profiles
 * Configure an OCPP 2.0.1 smart charging profile for a station, EVSE, connector, or active session.
 */
export async function setChargingProfileHandler(req, res, next) {
  try {
    const { id } = req.params;

    if (!id || !UUID_REGEX.test(id)) {
      return res.status(400).json({
        success: false,
        error: {
          code: 'INVALID_ID',
          message: 'The requested station ID must be a valid UUID.',
        },
      });
    }

    const result = await chargingProfileService.setChargingProfile(
      id,
      req.body || {},
      { user: req.user }
    );

    return res.status(200).json({
      success: true,
      data: result,
    });
  } catch (err) {
    if (err.statusCode) {
      return res.status(err.statusCode).json({
        success: false,
        error: {
          code: err.code || 'CHARGING_PROFILE_ERROR',
          message: err.message,
        },
      });
    }
    next(err);
  }
}

/**
 * POST /api/v1/stations/:id/clear-charging-profile
 * DELETE /api/v1/stations/:id/charging-profiles
 * Clear an OCPP 2.0.1 smart charging profile by ID, criteria, or targeted EVSE/connector.
 */
export async function clearChargingProfileHandler(req, res, next) {
  try {
    const { id } = req.params;

    if (!id || !UUID_REGEX.test(id)) {
      return res.status(400).json({
        success: false,
        error: {
          code: 'INVALID_ID',
          message: 'The requested station ID must be a valid UUID.',
        },
      });
    }

    // Accept parameters from body, or fallback to query params for DELETE requests
    const params = {
      ...(req.query || {}),
      ...(req.body || {}),
    };

    const result = await chargingProfileService.clearChargingProfile(id, params);

    return res.status(200).json({
      success: true,
      data: result,
    });
  } catch (err) {
    if (err.statusCode) {
      return res.status(err.statusCode).json({
        success: false,
        error: {
          code: err.code || 'CLEAR_CHARGING_PROFILE_ERROR',
          message: err.message,
        },
      });
    }
    next(err);
  }
}

/**
 * GET /api/v1/stations/:id/tariff
 * Retrieve the active applicable tariff for a station.
 */
export async function getStationTariffHandler(req, res, next) {
  try {
    const { id } = req.params;

    if (!id || !UUID_REGEX.test(id)) {
      return res.status(400).json({
        success: false,
        error: {
          code: 'INVALID_ID',
          message: 'The requested station ID must be a valid UUID.',
        },
      });
    }

    const station = await stationService.getStationById(id);
    if (!station) {
      return res.status(404).json({
        success: false,
        error: {
          code: 'STATION_NOT_FOUND',
          message: `Station with ID '${id}' was not found.`,
        },
      });
    }

    const tariff = await tariffService.resolveApplicableTariff({
      location_id: id,
      cpo_id: station.cpo_id || (station.cpo ? station.cpo.id : null),
    });

    if (!tariff) {
      return res.status(404).json({
        success: false,
        error: {
          code: 'NO_APPLICABLE_TARIFF',
          message: 'No active tariff configured for this station.',
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



