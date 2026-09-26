/**
 * ============================================================================
 * VAHANGRID VEHICLE SERVICE
 * ============================================================================
 * 
 * ARCHITECTURAL NOTICE:
 * Manages user's electric vehicle specifications and battery profiles.
 * 
 * In production phases:
 * - Telematics API integration with OEM clouds (Tata Motors ZConnect, MG iSMART, etc.)
 * - Direct SoC telemetry and battery state-of-health (SoH) metrics
 * ============================================================================
 */

import { VEHICLES } from '../data/mockData';

let selectedVehicleState = VEHICLES[0];

export const vehicleService = {
  /**
   * Returns list of supported Indian EV models.
   */
  async getVehicles() {
    return [...VEHICLES];
  },

  /**
   * Retrieves the currently selected active vehicle.
   */
  async getActiveVehicle() {
    return { ...selectedVehicleState };
  },

  /**
   * Sets the driver's active vehicle.
   */
  setActiveVehicle(vehicleId) {
    const found = VEHICLES.find((v) => v.id === vehicleId);
    if (found) {
      selectedVehicleState = found;
    }
    return { ...selectedVehicleState };
  },

  /**
   * Finds vehicle by id.
   */
  getVehicleById(id) {
    return VEHICLES.find((v) => v.id === id) || VEHICLES[0];
  }
};
