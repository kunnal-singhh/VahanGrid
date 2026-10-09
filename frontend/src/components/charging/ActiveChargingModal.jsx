/**
 * frontend/src/components/charging/ActiveChargingModal.jsx
 *
 * Real-Time Active Charging Telemetry Dashboard & Live Session Experience (Phase 3F).
 *
 * Responsibilities:
 *  - Consumes live OCPP 2.0.1 telemetry via useChargingTelemetry hook.
 *  - Displays genuine live power (kW), SoC (%), delivered energy (kWh), and elapsed time.
 *  - Calculates deterministic estimated cost from session tariff snapshot.
 *  - Renders responsive PowerCurveChart visualization.
 *  - Displays connection and telemetry freshness status.
 *  - Handles session termination with immediate post-session CDR settlement receipt.
 */

import { useState } from 'react';
import {
  Zap,
  StopCircle,
  ShieldCheck,
  Clock,
  Gauge,
  AlertCircle,
  Loader2,
  X,
  BatteryCharging,
  BatteryMedium,
  Receipt,
  CheckCircle2,
  HelpCircle,
} from 'lucide-react';
import { useChargingTelemetry } from '../../hooks/useChargingTelemetry';
import PowerCurveChart from './PowerCurveChart';
import { formatCurrency, formatDuration } from '../../utils/formatters';

const CIRCUMFERENCE = 2 * Math.PI * 68;

function formatClock(seconds) {
  if (!seconds || seconds <= 0) return '00:00';
  const hrs = Math.floor(seconds / 3600);
  const mins = Math.floor((seconds % 3600) / 60);
  const secs = seconds % 60;
  if (hrs > 0) {
    return `${hrs}h ${mins.toString().padStart(2, '0')}m ${secs.toString().padStart(2, '0')}s`;
  }
  return `${mins}m ${secs.toString().padStart(2, '0')}s`;
}

export default function ActiveChargingModal({ session: initialSession, onStop, onClose }) {
  const [showSummaryView, setShowSummaryView] = useState(false);

  // Hook managing 5s polling, document visibility pause, and live metrics
  const {
    session,
    telemetry,
    powerKw,
    currentSoc,
    energyKwh,
    elapsedSeconds,
    freshness,
    lastRefreshedAt,
    estimatedCost,
    finalCdr,
    isStopping,
    stopError,
    stopCharging,
  } = useChargingTelemetry({
    initialSession,
    onSessionStopped: (stoppedSession, cdr) => {
      // Trigger parent callback if provided
      if (onStop) {
        onStop(stoppedSession?.id, true);
      }
      setShowSummaryView(true);
    },
    isActive: true,
  });

  if (!session) return null;

  const currentStatus = session.status || 'active';
  const isTerminal =
    currentStatus === 'completed' || currentStatus === 'stopped' || currentStatus === 'failed';

  // Target metadata
  const stationName = session.location?.name || session.stationName || 'VahanGrid Charging Hub';
  const cpoName = session.cpo?.name || session.cpoName || 'VahanGrid Network';
  const connectorStandard = session.connector?.standard || session.connectorStandard || 'CCS2';
  const ratedPower = session.connector?.max_power_kw || session.power || 60;
  const vehicleName = session.vehicle
    ? `${session.vehicle.manufacturer} ${session.vehicle.model}`
    : session.vehicleName || 'Registered EV';

  // Stop button handler
  const handleStopClick = async () => {
    try {
      await stopCharging();
      setShowSummaryView(true);
    } catch {
      // Handled in hook
    }
  };

  // Freshness Pill Presentation
  const renderFreshnessPill = () => {
    if (freshness === 'live') {
      return (
        <div className="flex items-center gap-1.5 bg-emerald-500/10 border border-emerald-500/30 rounded-full px-3 py-1 text-[11px] font-semibold text-emerald-400">
          <span className="w-2 h-2 rounded-full bg-emerald-400 animate-blink" />
          <span>Live Telemetry</span>
          {lastRefreshedAt && (
            <span className="text-[10px] text-emerald-300/80 font-mono">
              • {new Date(lastRefreshedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
            </span>
          )}
        </div>
      );
    }
    if (freshness === 'idle') {
      return (
        <div className="flex items-center gap-1.5 bg-amber-500/10 border border-amber-500/30 rounded-full px-3 py-1 text-[11px] font-semibold text-amber-300">
          <span className="w-2 h-2 rounded-full bg-amber-400" />
          <span>Connected • Standby</span>
        </div>
      );
    }
    if (freshness === 'stale') {
      return (
        <div className="flex items-center gap-1.5 bg-orange-500/10 border border-orange-500/30 rounded-full px-3 py-1 text-[11px] font-semibold text-orange-300">
          <span className="w-2 h-2 rounded-full bg-orange-400" />
          <span>Telemetry Stale</span>
        </div>
      );
    }
    return (
      <div className="flex items-center gap-1.5 bg-slate-500/10 border border-slate-500/30 rounded-full px-3 py-1 text-[11px] font-medium text-slate-400">
        <span className="w-1.5 h-1.5 rounded-full bg-slate-400 animate-pulse" />
        <span>Waiting for MeterValues</span>
      </div>
    );
  };

  // ─────────────────────────────────────────────────────────────────────────────
  // RENDER: Post-Session Finalized CDR Summary
  // ─────────────────────────────────────────────────────────────────────────────
  if (showSummaryView || (isTerminal && finalCdr)) {
    const cdrTotal = finalCdr?.total_amount ?? session.cost_amount ?? 0;
    const cdrEnergy = finalCdr?.energy_kwh ?? energyKwh ?? 0;
    const cdrDuration = finalCdr?.duration_seconds ?? elapsedSeconds ?? 0;
    const breakdown = finalCdr?.pricing_breakdown || {};
    const settlementStatus = finalCdr?.settlement_status || 'settled';

    return (
      <div className="fixed inset-0 z-[1700] backdrop-blur-md bg-black/80 flex items-center justify-center p-4 animate-fade-in">
        <div className="panel-surface border border-white/[.15] rounded-3xl p-6 md:p-8 w-full max-w-lg shadow-2xl relative animate-slide-up flex flex-col space-y-5">
          <div className="text-center space-y-2">
            <div className="w-12 h-12 rounded-2xl bg-emerald-500/15 border border-emerald-500/30 flex items-center justify-center text-emerald-400 mx-auto">
              <CheckCircle2 className="w-6 h-6" />
            </div>
            <h2 className="text-xl font-black text-white">Charging Session Completed</h2>
            <p className="text-xs text-slate-400">
              {stationName} • {vehicleName}
            </p>
          </div>

          {/* Final Metrics Banner */}
          <div className="bg-white/[.02] border border-white/[.08] rounded-2xl p-4 grid grid-cols-3 gap-2 text-center">
            <div>
              <div className="text-[10px] uppercase font-semibold text-slate-400">Total Energy</div>
              <div className="text-base font-black text-white mt-0.5">{Number(cdrEnergy).toFixed(2)} kWh</div>
            </div>
            <div>
              <div className="text-[10px] uppercase font-semibold text-slate-400">Duration</div>
              <div className="text-base font-black text-emerald-400 mt-0.5">{formatClock(cdrDuration)}</div>
            </div>
            <div>
              <div className="text-[10px] uppercase font-semibold text-slate-400">Final Cost</div>
              <div className="text-base font-black text-sky-400 mt-0.5">{formatCurrency(cdrTotal)}</div>
            </div>
          </div>

          {/* Itemized Pricing Breakdown */}
          {breakdown.energy_cost !== undefined && (
            <div className="bg-white/[.02] border border-white/[.06] rounded-2xl p-3.5 space-y-2 text-xs">
              <div className="text-[11px] font-bold text-slate-300 uppercase tracking-wider flex items-center gap-1.5">
                <Receipt className="w-3.5 h-3.5 text-sky-400" /> Itemized Bill Breakdown
              </div>
              <div className="flex justify-between text-slate-400">
                <span>Energy Charge</span>
                <span className="text-slate-200">{formatCurrency(breakdown.energy_cost)}</span>
              </div>
              {breakdown.session_fee > 0 && (
                <div className="flex justify-between text-slate-400">
                  <span>Session / Activation Fee</span>
                  <span className="text-slate-200">{formatCurrency(breakdown.session_fee)}</span>
                </div>
              )}
              {breakdown.time_cost > 0 && (
                <div className="flex justify-between text-slate-400">
                  <span>Time Charge</span>
                  <span className="text-slate-200">{formatCurrency(breakdown.time_cost)}</span>
                </div>
              )}
              <div className="flex justify-between text-slate-400">
                <span>GST Tax</span>
                <span className="text-slate-200">{formatCurrency(breakdown.tax_amount || 0)}</span>
              </div>
              <div className="border-t border-white/[.08] pt-2 flex justify-between font-bold text-white">
                <span>Total Amount Paid</span>
                <span className="text-emerald-400">{formatCurrency(cdrTotal)}</span>
              </div>
            </div>
          )}

          {/* Settlement Status Badge */}
          <div className="flex items-center justify-between bg-white/[.02] border border-white/[.05] rounded-xl px-4 py-2.5 text-xs">
            <span className="text-slate-400">Settlement Status:</span>
            <span
              className={`font-bold px-2 py-0.5 rounded-full text-[11px] ${
                settlementStatus === 'settled'
                  ? 'bg-emerald-500/15 text-emerald-400 border border-emerald-500/30'
                  : 'bg-amber-500/15 text-amber-300 border border-amber-500/30'
              }`}
            >
              {settlementStatus === 'settled' ? 'Settled via VahanPass Wallet' : 'Settlement Pending'}
            </span>
          </div>

          <button
            onClick={onClose}
            className="w-full py-3.5 rounded-xl font-bold text-sm bg-gradient-to-r from-sky-500 to-emerald-500 hover:from-sky-400 hover:to-emerald-400 text-white transition-all shadow-lg active:scale-[0.98] cursor-pointer"
          >
            Done
          </button>
        </div>
      </div>
    );
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // RENDER: Real-Time Active Charging Dashboard
  // ─────────────────────────────────────────────────────────────────────────────
  const socDisplay = currentSoc !== null ? `${currentSoc}%` : null;
  const socStrokeDashoffset =
    currentSoc !== null ? CIRCUMFERENCE - (currentSoc / 100) * CIRCUMFERENCE : CIRCUMFERENCE * 0.35;

  return (
    <div className="fixed inset-0 z-[1700] backdrop-blur-md bg-black/80 flex items-center justify-center p-3 sm:p-4 animate-fade-in overflow-y-auto">
      <div className="panel-surface border border-white/[.15] rounded-3xl p-5 sm:p-7 w-full max-w-lg shadow-2xl relative animate-slide-up flex flex-col items-center my-auto">
        {/* Close Button */}
        {onClose && (
          <button
            onClick={onClose}
            className="absolute top-4 right-4 p-2 rounded-xl bg-white/[.04] hover:bg-white/[.08] text-slate-400 hover:text-white transition-colors cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        )}

        {/* Freshness & Connection Status Pill */}
        <div className="mb-4">{renderFreshnessPill()}</div>

        {/* Station Info Header */}
        <div className="text-center mb-5">
          <div className="text-[10px] font-bold text-sky-400 uppercase tracking-widest bg-sky-500/10 px-2.5 py-0.5 rounded-full border border-sky-500/20 inline-block">
            {currentStatus === 'pending' ? 'Starting Session' : 'Active Charging Session'}
          </div>
          <h2 className="text-lg sm:text-xl font-black text-white mt-1.5">{stationName}</h2>
          <p className="text-xs text-slate-400 mt-0.5">
            {cpoName} • {connectorStandard} ({ratedPower} kW Rated)
          </p>
        </div>

        {/* ─── Circular Battery SoC / Charging Speed Visual ─── */}
        <div className="relative w-44 h-44 sm:w-48 sm:h-48 mb-5">
          {/* Ambient Glow */}
          <div className="absolute inset-4 rounded-full bg-sky-500/15 blur-2xl pointer-events-none" />

          <svg className="w-full h-full -rotate-90" viewBox="0 0 160 160">
            {/* Background Track */}
            <circle
              cx="80"
              cy="80"
              r="68"
              fill="none"
              stroke="rgba(148, 163, 184, 0.12)"
              strokeWidth="9"
            />
            {/* Active SoC Arc */}
            <circle
              cx="80"
              cy="80"
              r="68"
              fill="none"
              stroke="url(#vahangrid-active-grad)"
              strokeWidth="9"
              strokeLinecap="round"
              strokeDasharray={CIRCUMFERENCE}
              strokeDashoffset={socStrokeDashoffset}
              className="transition-all duration-700 ease-out"
            />
            <defs>
              <linearGradient id="vahangrid-active-grad" x1="0%" y1="0%" x2="100%" y2="100%">
                <stop offset="0%" stopColor="#38bdf8" />
                <stop offset="60%" stopColor="#0ea5e9" />
                <stop offset="100%" stopColor="#10b981" />
              </linearGradient>
            </defs>
          </svg>

          {/* Centered Gauge Data */}
          <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none text-center px-4">
            {socDisplay ? (
              <>
                <div className="flex items-center gap-1.5 text-white">
                  <BatteryCharging className="w-5 h-5 text-emerald-400 animate-pulse" />
                  <span className="text-3xl sm:text-4xl font-black font-display tracking-tight drop-shadow-[0_0_15px_rgba(16,185,129,0.4)]">
                    {socDisplay}
                  </span>
                </div>
                <span className="text-[10px] text-emerald-400 font-bold uppercase tracking-wider mt-0.5">
                  Battery State
                </span>
              </>
            ) : (
              <>
                <div className="text-2xl sm:text-3xl font-black text-sky-400 font-mono">
                  {powerKw !== null ? `${powerKw} kW` : '-- kW'}
                </div>
                <span className="text-[10px] text-slate-400 font-bold uppercase tracking-wider mt-0.5">
                  Charging Speed
                </span>
                <span className="text-[9px] text-slate-500 mt-0.5">SoC not supplied</span>
              </>
            )}
            <span className="text-[10px] text-slate-400 font-mono mt-1">{formatClock(elapsedSeconds)}</span>
          </div>
        </div>

        {/* ─── Real-Time 4-Metric Grid ─── */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5 w-full mb-4">
          {/* 1. Power Speed */}
          <div className="bg-white/[.02] border border-white/[.06] rounded-xl p-2.5 text-center">
            <div className="text-[9px] uppercase font-semibold text-slate-400">Power Speed</div>
            <div className="text-xs sm:text-sm font-bold text-sky-400 mt-0.5 font-mono">
              {powerKw !== null ? `${powerKw} kW` : '-- kW'}
            </div>
            <div className="text-[9px] text-slate-500 mt-0.5">{ratedPower} kW Rated</div>
          </div>

          {/* 2. Delivered Energy */}
          <div className="bg-white/[.02] border border-white/[.06] rounded-xl p-2.5 text-center">
            <div className="text-[9px] uppercase font-semibold text-slate-400">Delivered Energy</div>
            <div className="text-xs sm:text-sm font-bold text-white mt-0.5 font-mono">
              {energyKwh > 0 ? `${energyKwh.toFixed(2)} kWh` : '0.00 kWh'}
            </div>
            <div className="text-[9px] text-slate-500 mt-0.5">MeterValues Sync</div>
          </div>

          {/* 3. Estimated Cost */}
          <div className="bg-white/[.02] border border-white/[.06] rounded-xl p-2.5 text-center">
            <div className="text-[9px] uppercase font-semibold text-slate-400">Estimated Cost</div>
            <div className="text-xs sm:text-sm font-bold text-slate-200 mt-0.5 font-mono">
              {estimatedCost ? formatCurrency(estimatedCost.totalCost) : '--'}
            </div>
            <div className="text-[9px] text-slate-500 mt-0.5">Tariff Estimate</div>
          </div>

          {/* 4. Duration */}
          <div className="bg-white/[.02] border border-white/[.06] rounded-xl p-2.5 text-center">
            <div className="text-[9px] uppercase font-semibold text-slate-400">Duration</div>
            <div className="text-xs sm:text-sm font-bold text-emerald-400 mt-0.5 font-mono">
              {formatClock(elapsedSeconds)}
            </div>
            <div className="text-[9px] text-slate-500 mt-0.5">Authoritative Clock</div>
          </div>
        </div>

        {/* ─── Real-Time Charging Telemetry Curve ─── */}
        <div className="w-full mb-4">
          <PowerCurveChart telemetry={telemetry} ratedPowerKw={ratedPower} />
        </div>

        {/* Error Alert */}
        {stopError && (
          <div className="w-full bg-rose-500/10 border border-rose-500/25 rounded-xl p-3 mb-3 flex items-start gap-2 text-rose-400 text-xs">
            <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
            <div className="flex-1">
              <span className="font-bold">Error Stopping Session</span>
              <p className="text-[11px] text-rose-300/80 mt-0.5">{stopError}</p>
            </div>
          </div>
        )}

        {/* ─── Terminate Session Button ─── */}
        <button
          onClick={handleStopClick}
          disabled={isStopping}
          className="flex items-center justify-center gap-2 w-full py-3.5 rounded-xl font-bold text-sm bg-rose-500/15 border border-rose-500/30 text-rose-400 hover:bg-rose-500/25 hover:border-rose-500/50 transition-all active:scale-[0.98] cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {isStopping ? (
            <>
              <Loader2 className="w-4 h-4 animate-spin text-rose-400" />
              <span>Stopping charging session...</span>
            </>
          ) : (
            <>
              <StopCircle className="w-4 h-4" />
              <span>Stop Charging</span>
            </>
          )}
        </button>
      </div>
    </div>
  );
}
