import { useState, useEffect } from 'react';
import {
  Zap,
  StopCircle,
  WifiOff,
  ShieldCheck,
  Clock,
  Gauge,
  AlertCircle,
  Loader2,
  X,
  Car
} from 'lucide-react';
import { formatDuration } from '../../utils/formatters';

const CIRCUMFERENCE = 2 * Math.PI * 66;

export default function ActiveChargingModal({ session, onStop, onClose }) {
  const [elapsedSeconds, setElapsedSeconds] = useState(() => {
    if (session?.started_at) {
      const started = new Date(session.started_at).getTime();
      return Math.max(0, Math.floor((Date.now() - started) / 1000));
    }
    return 0;
  });
  const [isStopping, setIsStopping] = useState(false);
  const [stopError, setStopError] = useState(null);

  // Live timer for elapsed duration calculated from real started_at
  useEffect(() => {
    if (!session?.started_at) return;

    const interval = setInterval(() => {
      const started = new Date(session.started_at).getTime();
      setElapsedSeconds(Math.max(0, Math.floor((Date.now() - started) / 1000)));
    }, 1000);

    return () => clearInterval(interval);
  }, [session?.started_at]);

  if (!session) return null;

  const handleStopClick = async () => {
    try {
      setIsStopping(true);
      setStopError(null);
      await onStop(session.id || session.sessionId);
    } catch (err) {
      console.error('[ActiveChargingModal] Stop failed:', err);
      setStopError(err.message || 'Failed to stop charging session.');
      setIsStopping(false);
    }
  };

  const minutes = Math.floor(elapsedSeconds / 60);
  const seconds = elapsedSeconds % 60;
  const durationText = `${minutes}m ${seconds.toString().padStart(2, '0')}s`;

  const vehicleName = session.vehicle
    ? `${session.vehicle.manufacturer} ${session.vehicle.model}${session.vehicle.variant ? ' ' + session.vehicle.variant : ''}`
    : session.vehicleName || 'Registered EV';

  const stationName = session.location?.name || session.stationName || 'VahanGrid Fast Hub';
  const cpoName = session.cpo?.name || session.cpoName || 'Network Operator';
  const connectorStandard = session.connector?.standard || session.connectorStandard || 'CCS2';
  const ratedPower = session.connector?.max_power_kw || session.power || 60;

  return (
    <div className="fixed inset-0 z-[1700] backdrop-blur-md bg-black/75 flex items-center justify-center p-4 animate-fade-in">
      <div className="panel-surface border border-white/[.12] rounded-3xl p-6 md:p-8 w-full max-w-lg shadow-2xl relative animate-slide-up flex flex-col items-center">
        {/* Close Button */}
        {onClose && (
          <button
            onClick={onClose}
            className="absolute top-5 right-5 p-2 rounded-xl bg-white/[.04] hover:bg-white/[.08] text-slate-400 hover:text-white transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        )}

        {/* Telemetry Status Notice */}
        <div className="flex items-center gap-2 bg-sky-500/10 border border-sky-500/25 rounded-full px-4 py-1.5 mb-5">
          <span className="w-2 h-2 rounded-full bg-emerald-400 animate-blink" />
          <span className="text-[11px] font-semibold text-sky-300">
            Hardware Connected • Awaiting Meter Telemetry
          </span>
          <ShieldCheck className="w-3.5 h-3.5 text-sky-400" />
        </div>

        {/* Station Info */}
        <div className="text-center mb-6">
          <span className="text-[10px] font-bold text-sky-400 uppercase tracking-widest bg-sky-500/10 px-2.5 py-0.5 rounded-full border border-sky-500/20">
            Active DC Fast Charge Session
          </span>
          <h2 className="text-lg md:text-xl font-black text-white mt-1.5">
            {stationName}
          </h2>
          <p className="text-xs text-slate-400 mt-0.5">
            {cpoName} • {connectorStandard} ({ratedPower} kW Rated)
          </p>
        </div>

        {/* Circular Progress Display */}
        <div className="relative w-44 h-44 md:w-52 md:h-52 mb-6">
          {/* Ambient Glow */}
          <div className="absolute inset-4 rounded-full bg-sky-500/10 blur-2xl pointer-events-none" />

          <svg className="w-full h-full -rotate-90" viewBox="0 0 160 160">
            {/* Track */}
            <circle
              cx="80"
              cy="80"
              r="66"
              fill="none"
              stroke="rgba(148, 163, 184, 0.1)"
              strokeWidth="8"
            />
            {/* Active Flow Ring */}
            <circle
              cx="80"
              cy="80"
              r="66"
              fill="none"
              stroke="url(#vahangrid-active-grad)"
              strokeWidth="8"
              strokeLinecap="round"
              strokeDasharray={CIRCUMFERENCE}
              strokeDashoffset={CIRCUMFERENCE * 0.25}
              className="animate-pulse"
            />
            <defs>
              <linearGradient id="vahangrid-active-grad" x1="0%" y1="0%" x2="100%" y2="100%">
                <stop offset="0%" stopColor="#06b6d4" />
                <stop offset="50%" stopColor="#3b82f6" />
                <stop offset="100%" stopColor="#10b981" />
              </linearGradient>
            </defs>
          </svg>

          {/* Centered Active Badge & Timer */}
          <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none text-center px-4">
            <span className="text-2xl md:text-3xl font-black font-display text-white tracking-tight drop-shadow-[0_0_18px_rgba(56,189,248,0.5)]">
              {durationText}
            </span>
            <span className="text-[10px] text-emerald-400 font-bold uppercase tracking-wider mt-1 flex items-center gap-1">
              <Zap className="w-3 h-3 fill-emerald-400" /> Active Session
            </span>
            <span className="text-[10px] text-slate-400 mt-0.5 truncate max-w-[130px]">
              {vehicleName}
            </span>
          </div>
        </div>

        {/* Live Metrics Grid — Real data & Unavailable/Pending states */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5 w-full mb-5">
          <div className="bg-white/[.02] border border-white/[.06] rounded-xl p-2.5 text-center">
            <div className="text-[9px] uppercase font-semibold text-slate-400">Energy</div>
            <div className="text-xs md:text-sm font-bold text-slate-300 mt-0.5">
              {session.energy_kwh > 0 ? `${session.energy_kwh} kWh` : 'Pending'}
            </div>
            <div className="text-[9px] text-slate-500 mt-0.5">OCPP Telemetry</div>
          </div>

          <div className="bg-white/[.02] border border-white/[.06] rounded-xl p-2.5 text-center">
            <div className="text-[9px] uppercase font-semibold text-slate-400">Power Speed</div>
            <div className="text-xs md:text-sm font-bold text-sky-400 mt-0.5">
              {ratedPower} kW
            </div>
            <div className="text-[9px] text-slate-500 mt-0.5">Rated Output</div>
          </div>

          <div className="bg-white/[.02] border border-white/[.06] rounded-xl p-2.5 text-center">
            <div className="text-[9px] uppercase font-semibold text-slate-400">Cost</div>
            <div className="text-xs md:text-sm font-bold text-slate-300 mt-0.5">
              {session.cost_amount > 0 ? `₹${session.cost_amount.toFixed(2)}` : 'At End'}
            </div>
            <div className="text-[9px] text-slate-500 mt-0.5">Tariff Billing</div>
          </div>

          <div className="bg-white/[.02] border border-white/[.06] rounded-xl p-2.5 text-center">
            <div className="text-[9px] uppercase font-semibold text-slate-400">Duration</div>
            <div className="text-xs md:text-sm font-bold text-emerald-400 mt-0.5">
              {durationText}
            </div>
            <div className="text-[9px] text-slate-500 mt-0.5">Live Timer</div>
          </div>
        </div>

        {/* Telemetry Notice Banner */}
        <div className="w-full bg-white/[.02] border border-white/[.05] rounded-xl p-3 mb-5 text-[11px] text-slate-400 flex items-center gap-2">
          <Clock className="w-4 h-4 text-sky-400 shrink-0" />
          <span>
            Real-time energy meter values and power curves will stream via OCPP 2.0.1 in Phase 4.
          </span>
        </div>

        {/* Error Alert */}
        {stopError && (
          <div className="w-full bg-rose-500/10 border border-rose-500/25 rounded-xl p-3 mb-4 flex items-start gap-2 text-rose-400 text-xs">
            <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
            <div className="flex-1">
              <span className="font-bold">Error Stopping Session</span>
              <p className="text-[11px] text-rose-300/80 mt-0.5">{stopError}</p>
            </div>
          </div>
        )}

        {/* Terminate Session Button */}
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
              <span>Stop & Finalize Session</span>
            </>
          )}
        </button>
      </div>
    </div>
  );
}
