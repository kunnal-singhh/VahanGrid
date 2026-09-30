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

export {
  handleOcppMessage,
  sendCallResult,
  sendCallError,
  MESSAGE_TYPE_CALL,
  MESSAGE_TYPE_CALLRESULT,
  MESSAGE_TYPE_CALLERROR,
} from './messageHandler.js';

export {
  handleBootNotification,
} from './handlers/bootNotificationHandler.js';

export {
  handleStatusNotification,
  VALID_CONNECTOR_STATUSES,
} from './handlers/statusNotificationHandler.js';

export {
  OcppError,
  ERROR_CODES,
} from './ocppErrors.js';
