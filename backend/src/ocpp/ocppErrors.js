/**
 * src/ocpp/ocppErrors.js
 *
 * Standard OCPP 2.0.1 Error Definitions and Classes.
 *
 * Standard Error Codes (OCPP 2.0.1 Part 4 - JSON specification):
 *  - FormatViolation: Payload is syntactically incorrect or does not conform to message schema
 *  - GenericError: Any other error not covered by more specific error codes
 *  - InternalError: An internal error occurred and the receiver could not process the request
 *  - MessageTypeNotSupported: A message with an unsupported MessageTypeId was received
 *  - NotImplemented: Requested Action is not known/implemented by receiver
 *  - NotSupported: Requested Action is recognized but not supported by receiver
 *  - OccurrenceConstraintViolation: Payload contains too few or too many elements
 *  - PropertyConstraintViolation: Payload contains an element with an invalid value
 *  - ProtocolError: Payload is not conforming to the protocol specification
 *  - RpcFrameworkError: Content does not conform to the JSON-RPC-like frame
 *  - SecurityError: During processing, a security issue occurred
 *  - TypeConstraintViolation: Payload contains an element of invalid type
 */

export class OcppError extends Error {
  /**
   * @param {string} code - Standard OCPP 2.0.1 error code
   * @param {string} message - Descriptive error explanation
   * @param {object} [details={}] - Optional diagnostic details
   */
  constructor(code, message, details = {}) {
    super(message);
    this.name = 'OcppError';
    this.code = code;
    this.details = details;
  }
}

export const ERROR_CODES = {
  FORMAT_VIOLATION: 'FormatViolation',
  GENERIC_ERROR: 'GenericError',
  INTERNAL_ERROR: 'InternalError',
  MESSAGE_TYPE_NOT_SUPPORTED: 'MessageTypeNotSupported',
  NOT_IMPLEMENTED: 'NotImplemented',
  NOT_SUPPORTED: 'NotSupported',
  OCCURRENCE_CONSTRAINT_VIOLATION: 'OccurrenceConstraintViolation',
  PROPERTY_CONSTRAINT_VIOLATION: 'PropertyConstraintViolation',
  PROTOCOL_ERROR: 'ProtocolError',
  RPC_FRAMEWORK_ERROR: 'RpcFrameworkError',
  SECURITY_ERROR: 'SecurityError',
  TYPE_CONSTRAINT_VIOLATION: 'TypeConstraintViolation',
};
