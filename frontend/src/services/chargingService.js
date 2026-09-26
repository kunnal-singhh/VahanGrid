/**
 * ============================================================================
 * VAHANGRID CHARGING SESSION SERVICE
 * ============================================================================
 * 
 * ARCHITECTURAL NOTICE:
 * Coordinates session start, real-time SoC progression, and session termination.
 * 
 * In production phases:
 * - Direct OCPP 2.0.1 RemoteStartTransaction / StopTransaction messages
 * - MeterValues streamed via WebSocket / MQTT
 * ============================================================================
 */

import { stationService } from './stationService';
import { walletService } from './walletService';

export const chargingService = {
  /**
   * Initializes a charging session on a selected station.
   */
  async startSession({ station, startSoc = 50, isOffline = false }) {
    await new Promise((resolve) => setTimeout(resolve, 80));

    // Update station status to occupied
    stationService.updateStationStatus(
      station.id,
      'occupied',
      Math.round(((station.power || 60) * 1000) / (station.voltage || 415))
    );

    const session = {
      sessionId: `VG-SES-${Date.now()}`,
      stationId: station.id,
      stationName: station.name,
      operator: station.operator,
      power: station.power || 60,
      price: station.price || 18.5,
      startSoc,
      currentSoc: startSoc,
      startTime: Date.now(),
      isOffline,
    };

    return session;
  },

  /**
   * Ends an active charging session and records transaction payment.
   */
  async stopSession({ session, finalSoc, kwh, cost }) {
    await new Promise((resolve) => setTimeout(resolve, 100));

    // Reset station status back to available
    stationService.updateStationStatus(session.stationId, 'available', 0);

    // Record wallet payment
    const payment = await walletService.recordChargingSessionPayment({
      stationName: session.stationName,
      operatorName: session.operator,
      kwh,
      cost,
      isOffline: session.isOffline,
    });

    return {
      success: true,
      summary: {
        sessionId: session.sessionId,
        stationName: session.stationName,
        kwhDelivered: kwh,
        totalCost: cost,
        finalSoc,
        durationSeconds: Math.round((Date.now() - session.startTime) / 1000),
        transaction: payment.transaction,
      },
    };
  }
};
