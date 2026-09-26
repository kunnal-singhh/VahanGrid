/**
 * ============================================================================
 * VAHANGRID WALLET & PAYMENTS SERVICE
 * ============================================================================
 * 
 * ARCHITECTURAL NOTICE:
 * Handles VahanPass unified roaming balance, top-up requests, and transaction logs.
 * 
 * In production phases:
 * - Direct integration with Unified Payments Interface (UPI 2.0 AutoPay / Bharat BillPay)
 * - OCPI CDR (Charge Detail Record) clearing house reconciliation
 * - GST compliant automated invoicing
 * ============================================================================
 */

import { INITIAL_TRANSACTIONS } from '../data/mockData';
import { formatTimestampIST } from '../utils/formatters';

let currentBalance = 1450.00;
let transactionHistory = [...INITIAL_TRANSACTIONS];

export const walletService = {
  /**
   * Retrieves the current unified wallet balance.
   */
  async getBalance() {
    await new Promise((resolve) => setTimeout(resolve, 30));
    return currentBalance;
  },

  /**
   * Tops up the VahanPass wallet.
   */
  async topUp(amount) {
    await new Promise((resolve) => setTimeout(resolve, 200));
    currentBalance += Number(amount);
    
    // Create audit record for the top-up
    const topUpRecord = {
      id: `topup-${Date.now()}`,
      op: 'VahanPass UPI Inflow',
      station: 'Instant Auto-Credit',
      kwh: 0,
      cost: -Number(amount), // Negative cost indicates credit
      time: formatTimestampIST(),
      type: 'Wallet Top-Up',
      status: 'Completed',
      isOffline: false,
    };
    transactionHistory = [topUpRecord, ...transactionHistory];

    return { success: true, newBalance: currentBalance, transaction: topUpRecord };
  },

  /**
   * Fetches past transactions across all networks.
   */
  async getTransactions() {
    await new Promise((resolve) => setTimeout(resolve, 50));
    return [...transactionHistory];
  },

  /**
   * Deducts funds for a completed charging session.
   */
  async recordChargingSessionPayment({ stationName, operatorName, kwh, cost, isOffline = false }) {
    await new Promise((resolve) => setTimeout(resolve, 100));
    currentBalance = Math.max(0, Math.round((currentBalance - cost) * 100) / 100);

    const tx = {
      id: `chg-${Date.now()}`,
      op: operatorName || 'CPO Roaming',
      station: stationName ? stationName.split('—')[1]?.trim() || stationName : 'Hub Charger',
      kwh: Number(kwh) || 0,
      cost: Number(cost) || 0,
      time: formatTimestampIST(),
      type: isOffline ? 'Direct (Edge Sync)' : 'Roaming (OCPI)',
      status: 'Completed',
      isOffline,
    };

    transactionHistory = [tx, ...transactionHistory];
    return { success: true, newBalance: currentBalance, transaction: tx };
  }
};
