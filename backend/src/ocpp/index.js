/**
 * src/ocpp/index.js
 *
 * Public module exports for the VahanGrid OCPP subsystem.
 */

export {
  initOcppServer,
  getOcppServer,
  closeOcppServer,
  extractChargePointId,
} from './ocppServer.js';

export {
  connectionRegistry,
  ConnectionRegistry,
} from './connectionRegistry.js';
