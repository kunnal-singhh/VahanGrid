/**
 * frontend/src/components/charging/CdrReceiptModal.jsx
 *
 * Charge Detail Record (CDR) Receipt & Settlement Recovery Modal (Phase 3G).
 *
 * Capabilities:
 *  - Authoritative breakdown from PostgreSQL immutable CDR.
 *  - Displays energy delivered, line items (energy, session, time, GST), and total amount.
 *  - Settlement Status handling:
 *     * Settled: Displays confirmation & timestamp.
 *     * Pending: Displays awaiting settlement indicator.
 *     * Failed (e.g. INSUFFICIENT_FUNDS): Displays clear explanation, available vs required
 *       balance, "Top Up Wallet" navigation shortcut, and "Retry Settlement" action.
 *  - Idempotent settlement retry via POST /api/v1/cdrs/:id/settle.
 *  - Prevents duplicate clicks during retry.
 */

import { useState } from 'react';
import {
  Receipt,
  X,
  Loader2,
  AlertCircle,
  AlertTriangle,
  CheckCircle2,
  PlusCircle,
  RefreshCw,
  Wallet,
} from 'lucide-react';
import { walletService } from '../../services/walletService';

function formatSessionTimestamp(dateStr) {
  if (!dateStr) return 'N/A';
  try {
    const d = new Date(dateStr);
    return d.toLocaleDateString('en-IN', {
      day: 'numeric',
      month: 'short',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  } catch {
    return dateStr;
  }
}

function formatSessionDuration(seconds) {
  if (!seconds || seconds <= 0) return '< 1 min';
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  if (m === 0) return `${s}s`;
  if (s === 0) return `${m}m`;
  return `${m}m ${s}s`;
}

function formatInr(amount) {
  if (amount == null || isNaN(amount)) return '—';
  return `\u20B9${Number(amount).toFixed(2)}`;
}

export default function CdrReceiptModal({
  session,
  cdr: initialCdr,
  loading,
  error,
  userBalance = null,
  onClose,
  onOpenTopUp,
  onSettlementUpdated,
}) {
  const [cdr, setCdr] = useState(initialCdr);
  const [isRetrying, setIsRetrying] = useState(false);
  const [retryError, setRetryError] = useState(null);
  const [retrySuccess, setRetrySuccess] = useState(null);

  if (!session) return null;

  const stationName = session.location?.name || session.stationName || 'Charging Station';
  const cpoName = session.cpo?.name || session.cpoName || 'Network CPO';
  const vehicleName = session.vehicle
    ? `${session.vehicle.manufacturer} ${session.vehicle.model}`
    : session.vehicleName || 'Registered EV';
  const sessionId = session.id ? session.id.slice(0, 8) : 'N/A';

  const activeCdr = cdr || initialCdr;
  const settlementStatus = activeCdr?.settlement_status || (activeCdr?.wallet_settled ? 'settled' : 'unsettled');
  const failureReason = activeCdr?.settlement_failure_reason || null;
  const totalAmount = Number(activeCdr?.total_amount ?? activeCdr?.total_cost ?? session.cost_amount ?? 0);

  const handleRetrySettlement = async () => {
    if (!activeCdr?.id || isRetrying) return;
    setIsRetrying(true);
    setRetryError(null);
    setRetrySuccess(null);

    try {
      const result = await walletService.settleCdr(activeCdr.id);
      setRetrySuccess('Settlement completed successfully! Wallet has been debited.');
      const updated = {
        ...activeCdr,
        settlement_status: 'settled',
        settlement_failure_reason: null,
        wallet_settled: true,
        settled_at: result.settled_at || new Date().toISOString(),
        wallet_transaction_id: result.transaction_id,
      };
      setCdr(updated);
      if (onSettlementUpdated) {
        onSettlementUpdated(updated);
      }
    } catch (err) {
      console.error('[CdrReceiptModal] Retry settlement failed:', err);
      if (err.code === 'INSUFFICIENT_FUNDS' || err.message?.includes('Insufficient')) {
        setRetryError(
          `Insufficient wallet balance. You need at least ${formatInr(totalAmount)} to settle this session.`
        );
      } else {
        setRetryError(err.message || 'Settlement retry failed. Please try again later.');
      }
    } finally {
      setIsRetrying(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-fade-in"
      role="dialog"
      aria-modal="true"
      aria-label="Session CDR Receipt"
    >
      <div className="w-full max-w-md glass border border-white/[.12] rounded-3xl overflow-hidden shadow-2xl flex flex-col max-h-[90vh]">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-white/[.08]">
          <div className="flex items-center gap-2">
            <div className="w-7 h-7 rounded-xl bg-emerald-500/20 border border-emerald-500/30 flex items-center justify-center">
              <Receipt className="w-4 h-4 text-emerald-400" />
            </div>
            <div>
              <h2 className="text-sm font-bold text-white">Session CDR Receipt</h2>
              <p className="text-[10px] text-slate-400">Session #{sessionId}…</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-2 rounded-xl hover:bg-white/[.08] text-slate-400 hover:text-white transition-colors cursor-pointer"
            aria-label="Close receipt"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Scrollable Body */}
        <div className="px-5 py-4 space-y-4 overflow-y-auto">
          {/* Session Meta */}
          <div className="space-y-1.5 text-xs text-slate-400 bg-white/[.02] p-3 rounded-2xl border border-white/[.05]">
            <div className="flex justify-between">
              <span>Station</span>
              <span className="text-slate-200 font-medium">{cpoName} — {stationName}</span>
            </div>
            <div className="flex justify-between">
              <span>Vehicle</span>
              <span className="text-slate-200 font-medium">{vehicleName}</span>
            </div>
            <div className="flex justify-between">
              <span>Started</span>
              <span className="text-slate-200">{formatSessionTimestamp(session.started_at)}</span>
            </div>
            <div className="flex justify-between">
              <span>Duration</span>
              <span className="text-slate-200">{formatSessionDuration(session.duration_seconds || session.durationSeconds)}</span>
            </div>
          </div>

          {loading ? (
            <div className="text-center py-6 space-y-2">
              <Loader2 className="w-6 h-6 text-sky-400 animate-spin mx-auto" />
              <p className="text-xs text-slate-400">Loading verified CDR record…</p>
            </div>
          ) : error ? (
            <div className="text-center py-6 space-y-2">
              <AlertCircle className="w-6 h-6 text-rose-400 mx-auto" />
              <p className="text-xs text-slate-300">CDR could not be retrieved.</p>
              <p className="text-[10px] text-slate-500">{error}</p>
            </div>
          ) : activeCdr ? (
            <>
              {/* CDR Line Items */}
              <div className="space-y-2 text-xs bg-white/[.02] p-3.5 rounded-2xl border border-white/[.05]">
                <div className="flex justify-between text-slate-400">
                  <span>Energy Delivered</span>
                  <span className="text-slate-200 font-medium">
                    {Number(activeCdr.energy_kwh ?? activeCdr.total_energy_kwh ?? session.energy_kwh ?? 0).toFixed(3)} kWh
                  </span>
                </div>

                {activeCdr.energy_cost != null && (
                  <div className="flex justify-between text-slate-400">
                    <span>Energy Cost</span>
                    <span className="text-slate-200">{formatInr(activeCdr.energy_cost)}</span>
                  </div>
                )}
                {activeCdr.session_fee != null && Number(activeCdr.session_fee) > 0 && (
                  <div className="flex justify-between text-slate-400">
                    <span>Session Fee</span>
                    <span className="text-slate-200">{formatInr(activeCdr.session_fee)}</span>
                  </div>
                )}
                {activeCdr.time_cost != null && Number(activeCdr.time_cost) > 0 && (
                  <div className="flex justify-between text-slate-400">
                    <span>Time Cost</span>
                    <span className="text-slate-200">{formatInr(activeCdr.time_cost)}</span>
                  </div>
                )}
                {activeCdr.subtotal != null && (
                  <div className="flex justify-between text-slate-400">
                    <span>Subtotal</span>
                    <span className="text-slate-200">{formatInr(activeCdr.subtotal)}</span>
                  </div>
                )}
                {activeCdr.tax_amount != null && (
                  <div className="flex justify-between text-slate-400">
                    <span>GST (18%)</span>
                    <span className="text-slate-200">{formatInr(activeCdr.tax_amount)}</span>
                  </div>
                )}

                <div className="border-t border-white/[.08] pt-2 flex justify-between font-bold">
                  <span className="text-white">Total Amount</span>
                  <span className="text-emerald-400 text-sm font-display">
                    {formatInr(totalAmount)}
                  </span>
                </div>
              </div>

              {/* Settlement Status Banner */}
              <div
                className={`rounded-2xl p-3.5 border space-y-2.5 ${
                  settlementStatus === 'settled'
                    ? 'bg-emerald-500/10 border-emerald-500/25'
                    : settlementStatus === 'failed'
                    ? 'bg-rose-500/10 border-rose-500/25'
                    : 'bg-amber-500/10 border-amber-500/25'
                }`}
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2 text-xs font-bold">
                    {settlementStatus === 'settled' ? (
                      <>
                        <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                        <span className="text-emerald-300">Wallet Settled</span>
                      </>
                    ) : settlementStatus === 'failed' ? (
                      <>
                        <AlertTriangle className="w-4 h-4 text-rose-400" />
                        <span className="text-rose-300">Settlement Failed</span>
                      </>
                    ) : (
                      <>
                        <Loader2 className="w-4 h-4 text-amber-400 animate-spin" />
                        <span className="text-amber-300">Settlement Pending</span>
                      </>
                    )}
                  </div>

                  {activeCdr.settled_at && (
                    <span className="text-[10px] text-slate-400">
                      {new Date(activeCdr.settled_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                    </span>
                  )}
                </div>

                {/* Explanation for Failed Settlement */}
                {settlementStatus === 'failed' && (
                  <div className="space-y-2 pt-1 border-t border-white/[.06] text-xs">
                    <p className="text-slate-300 text-[11px] leading-relaxed">
                      {failureReason === 'INSUFFICIENT_FUNDS'
                        ? 'Charging cost could not be debited because your VahanPass wallet balance was insufficient.'
                        : 'Settlement could not be finalized automatically.'}
                    </p>

                    {userBalance !== null && (
                      <div className="flex justify-between text-[11px] bg-black/20 p-2 rounded-xl">
                        <span className="text-slate-400">Available Wallet Balance:</span>
                        <span className={`font-bold ${userBalance >= totalAmount ? 'text-emerald-400' : 'text-rose-400'}`}>
                          {formatInr(userBalance)}
                        </span>
                      </div>
                    )}

                    {retryError && (
                      <p className="text-[11px] text-rose-300 bg-rose-500/20 p-2 rounded-xl">
                        {retryError}
                      </p>
                    )}

                    {retrySuccess && (
                      <p className="text-[11px] text-emerald-300 bg-emerald-500/20 p-2 rounded-xl">
                        {retrySuccess}
                      </p>
                    )}

                    <div className="flex gap-2 pt-1">
                      {onOpenTopUp && (
                        <button
                          onClick={() => {
                            onClose();
                            onOpenTopUp();
                          }}
                          className="flex-1 py-2 px-3 rounded-xl text-xs font-bold bg-sky-500/20 hover:bg-sky-500/30 text-sky-300 border border-sky-500/30 flex items-center justify-center gap-1.5 transition-colors cursor-pointer"
                        >
                          <PlusCircle className="w-3.5 h-3.5" />
                          <span>Top Up Wallet</span>
                        </button>
                      )}

                      <button
                        onClick={handleRetrySettlement}
                        disabled={isRetrying}
                        className="flex-1 py-2 px-3 rounded-xl text-xs font-bold bg-emerald-600 hover:bg-emerald-500 text-white flex items-center justify-center gap-1.5 transition-all shadow-md cursor-pointer disabled:opacity-50"
                      >
                        {isRetrying ? (
                          <>
                            <Loader2 className="w-3.5 h-3.5 animate-spin" />
                            <span>Retrying...</span>
                          </>
                        ) : (
                          <>
                            <RefreshCw className="w-3.5 h-3.5" />
                            <span>Retry Settlement</span>
                          </>
                        )}
                      </button>
                    </div>
                  </div>
                )}

                {activeCdr.id && (
                  <p className="text-[9px] text-slate-500 break-all font-mono">
                    CDR ID: {activeCdr.id}
                  </p>
                )}
              </div>
            </>
          ) : (
            <div className="text-center py-6 space-y-2">
              <Receipt className="w-6 h-6 text-slate-500 mx-auto" />
              <p className="text-xs text-slate-300">
                {session.energy_kwh > 0
                  ? 'CDR is being finalized — check back shortly.'
                  : 'No billing record available for this session.'}
              </p>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-5 py-3 border-t border-white/[.06] bg-black/20">
          <button
            onClick={onClose}
            className="w-full py-2.5 rounded-xl text-xs font-bold text-slate-200 bg-white/[.06] hover:bg-white/[.1] border border-white/[.1] transition-colors cursor-pointer"
          >
            Close Receipt
          </button>
        </div>
      </div>
    </div>
  );
}
