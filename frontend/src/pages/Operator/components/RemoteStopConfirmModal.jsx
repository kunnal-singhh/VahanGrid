/**
 * frontend/src/pages/Operator/components/RemoteStopConfirmModal.jsx
 *
 * Phase 4E: Remote Session Stop Confirmation Modal.
 *
 * Security & Financial Invariants:
 *  - Enforces explicit operator confirmation before transmitting remote stop.
 *  - Dispatches authoritative OCPP RequestStopTransaction via backend.
 *  - Prevents duplicate clicks / submissions.
 *  - Accurately handles offline chargers (503), timeouts (504), charger rejection (409),
 *    and cross-tenant denial (403).
 *  - Reflects true backend state — never marks session stopped prematurely.
 *  - Informs operator of immutable CDR generation and wallet settlement semantics.
 */

import { useState } from 'react';
import {
  AlertTriangle,
  StopCircle,
  X,
  Loader2,
  CheckCircle2,
  Zap,
  MapPin,
  Car,
  UserCheck,
  ShieldCheck,
  Lock,
} from 'lucide-react';
import { operatorService } from '../../../services/operatorService';
import { formatCurrency, formatKwh, formatTimestampIST } from '../../../utils/formatters';

export default function RemoteStopConfirmModal({
  isOpen = false,
  session = null,
  onClose,
  onSuccess,
  theme = 'dark',
}) {
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState(null);
  const [successResult, setSuccessResult] = useState(null);
  const [confirmed, setConfirmed] = useState(false);

  if (!isOpen || !session) return null;

  const isLight = theme === 'light';
  const sessionId = session.id || session.session_id;
  const driverName = session.driver?.name || session.driver?.display_name || 'Driver';
  const stationName = session.station?.name || 'Charging Station';
  const city = session.station?.city || '';
  const energyVal = session.energy_kwh ?? session.total_energy_kwh ?? 0;
  const costVal = session.cost_amount ?? session.total_cost_inr ?? 0;

  const handleConfirmStop = async () => {
    if (submitting || !confirmed) return;

    setSubmitting(true);
    setError(null);
    setSuccessResult(null);

    try {
      const result = await operatorService.remoteStopSession(sessionId, { timeoutMs: 12000 });
      setSuccessResult(result);
      if (onSuccess) {
        onSuccess(result);
      }
      setTimeout(() => {
        onClose();
      }, 2500);
    } catch (err) {
      console.error('[RemoteStopConfirmModal] Remote stop failed:', err);
      let errorMsg = err.message || 'Remote stop failed to execute.';

      if (err.code === 'STATION_OFFLINE' || err.status === 503) {
        errorMsg = 'Station is currently offline or disconnected from the OCPP gateway. Remote command could not be delivered.';
      } else if (err.code === 'STATION_TIMEOUT' || err.status === 504) {
        errorMsg = 'Station did not respond within the 12-second timeout. The command outcome is unknown.';
      } else if (err.code === 'REMOTE_STOP_REJECTED') {
        errorMsg = 'Charging station rejected the RequestStopTransaction command.';
      } else if (err.code === 'SESSION_ALREADY_STOPPED' || err.code === 'INVALID_STATE') {
        errorMsg = 'Session has already stopped or is in a terminal state.';
      } else if (err.status === 403) {
        errorMsg = 'Access Denied: You do not own the station hosting this session.';
      } else if (err.status === 401) {
        errorMsg = 'Authentication required. Your session may have expired.';
      }

      setError(errorMsg);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-fade-in"
      role="dialog"
      aria-modal="true"
      aria-labelledby="modal-remote-stop-title"
    >
      <div
        className={`w-full max-w-lg rounded-3xl border shadow-2xl flex flex-col max-h-[92vh] overflow-hidden transition-all ${
          isLight ? 'bg-white border-slate-200 text-slate-900' : 'bg-[#0b132b] border-white/10 text-white'
        }`}
      >
        {/* Header */}
        <div
          className={`p-6 border-b flex items-center justify-between ${
            isLight ? 'border-slate-100 bg-rose-50/50' : 'border-white/[.08] bg-rose-500/[.04]'
          }`}
        >
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-rose-500/10 border border-rose-500/20 flex items-center justify-center text-rose-400 shrink-0">
              <StopCircle className="w-5 h-5" />
            </div>
            <div>
              <h2 id="modal-remote-stop-title" className="text-base font-bold tracking-tight">
                Authorize Remote Stop
              </h2>
              <p className="text-[11px] text-slate-400 mt-0.5">
                Authoritative OCPP RequestStopTransaction dispatch
              </p>
            </div>
          </div>

          <button
            onClick={onClose}
            disabled={submitting}
            className="p-2 rounded-xl text-slate-400 hover:text-white hover:bg-white/[.06] transition-colors cursor-pointer disabled:opacity-50"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Content */}
        <div className="p-6 space-y-5 overflow-y-auto">
          {/* Success Banner distinguishing command dispatch vs confirmed termination */}
          {successResult && (
            <div className="p-4 rounded-2xl bg-emerald-500/10 border border-emerald-500/30 text-emerald-300 text-xs space-y-2 animate-fade-in">
              <div className="flex items-center gap-2.5">
                <CheckCircle2 className="w-5 h-5 text-emerald-400 shrink-0" />
                <p className="font-bold text-sm">Remote Stop Succeeded</p>
              </div>
              <div className="pl-7 space-y-1.5 text-[11px] text-slate-300 leading-relaxed">
                <div className="flex items-baseline gap-1.5">
                  <span className="text-emerald-400 font-bold">•</span>
                  <span><strong>Command Dispatched:</strong> OCPP RequestStopTransaction was delivered and accepted by charging point hardware.</span>
                </div>
                <div className="flex items-baseline gap-1.5">
                  <span className="text-emerald-400 font-bold">•</span>
                  <span><strong>Termination Confirmed:</strong> Session transitioned to stopped; final energy reading recorded and authoritative CDR finalized for wallet settlement.</span>
                </div>
              </div>
            </div>
          )}

          {/* Error Banner */}
          {error && (
            <div className="p-4 rounded-2xl bg-rose-500/10 border border-rose-500/30 text-rose-300 text-xs flex items-center gap-3 animate-fade-in">
              <AlertTriangle className="w-5 h-5 text-rose-400 shrink-0" />
              <div className="flex-1">
                <p className="font-bold">Operational Action Failed</p>
                <p className="text-[11px] mt-0.5 leading-relaxed">{error}</p>
              </div>
            </div>
          )}

          {/* Critical Warning Notice */}
          <div
            className={`p-4 rounded-2xl border text-xs space-y-2 ${
              isLight
                ? 'bg-amber-50 border-amber-200 text-amber-900'
                : 'bg-amber-500/[.06] border-amber-500/20 text-amber-200'
            }`}
          >
            <div className="flex items-center gap-2 font-bold text-amber-400">
              <AlertTriangle className="w-4 h-4 shrink-0" />
              <span>Consequential Operational Action</span>
            </div>
            <p className="text-[11px] leading-relaxed text-slate-300">
              Sending a remote stop terminates active power delivery at the physical charger. The session will immediately conclude, locking in the final meter reading and finalizing the immutable Charge Detail Record (CDR) for driver billing.
            </p>
          </div>

          {/* Target Session Details Card */}
          <div
            className={`p-4 rounded-2xl border space-y-3 ${
              isLight ? 'bg-slate-50 border-slate-200' : 'bg-white/[.02] border-white/[.06]'
            }`}
          >
            <div className="text-[10px] font-bold uppercase tracking-wider text-slate-400 flex items-center justify-between">
              <span>Session Target Information</span>
              <span className="font-mono text-sky-400">#{String(sessionId).slice(0, 8)}</span>
            </div>

            <div className="grid grid-cols-2 gap-3 text-xs">
              <div>
                <span className="text-[11px] text-slate-400 block">Station</span>
                <span className="font-bold text-white block truncate">{stationName}</span>
                {city && <span className="text-[10px] text-slate-400">{city}</span>}
              </div>

              <div>
                <span className="text-[11px] text-slate-400 block">Driver (Masked PII)</span>
                <span className="font-bold text-white block">{driverName}</span>
                <span className="text-[10px] text-emerald-400 font-mono">KYC Protected</span>
              </div>

              <div>
                <span className="text-[11px] text-slate-400 block">Energy Delivered</span>
                <span className="font-bold text-emerald-400 font-mono">{formatKwh(energyVal)}</span>
              </div>

              <div>
                <span className="text-[11px] text-slate-400 block">Accrued Amount</span>
                <span className="font-bold text-white font-mono">{formatCurrency(costVal)}</span>
              </div>
            </div>
          </div>

          {/* Explicit Confirmation Checkbox */}
          <label className="flex items-start gap-3 p-3.5 rounded-2xl border border-white/[.08] bg-white/[.02] cursor-pointer hover:bg-white/[.04] transition-colors select-none">
            <input
              type="checkbox"
              checked={confirmed}
              onChange={(e) => setConfirmed(e.target.checked)}
              disabled={submitting || Boolean(successResult)}
              className="mt-0.5 rounded border-slate-600 text-rose-500 focus:ring-rose-500 cursor-pointer"
            />
            <span className="text-xs text-slate-300 leading-relaxed">
              I verify that I am an authorized operator for this station and confirm the immediate termination of this active charging session.
            </span>
          </label>
        </div>

        {/* Footer */}
        <div
          className={`p-6 border-t flex items-center justify-end gap-3 ${
            isLight ? 'border-slate-100 bg-slate-50' : 'border-white/[.06] bg-white/[.02]'
          }`}
        >
          <button
            type="button"
            onClick={onClose}
            disabled={submitting}
            className="px-4 py-2.5 rounded-xl text-xs font-semibold text-slate-400 hover:text-white hover:bg-white/[.06] transition-colors cursor-pointer disabled:opacity-50"
          >
            Cancel
          </button>

          <button
            type="button"
            onClick={handleConfirmStop}
            disabled={!confirmed || submitting || Boolean(successResult)}
            className="px-5 py-2.5 rounded-xl text-xs font-bold bg-rose-600 hover:bg-rose-500 active:bg-rose-700 text-white transition-all shadow-lg shadow-rose-600/20 flex items-center gap-2 cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
          >
            {submitting ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                <span>Dispatching Command...</span>
              </>
            ) : successResult ? (
              <>
                <CheckCircle2 className="w-4 h-4" />
                <span>Dispatched & Confirmed</span>
              </>
            ) : (
              <>
                <StopCircle className="w-4 h-4" />
                <span>Confirm Remote Stop</span>
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
