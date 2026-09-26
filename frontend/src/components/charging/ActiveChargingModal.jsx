import { useState, useEffect } from 'react';
import { Zap, Leaf, StopCircle, WifiOff, ShieldCheck, Clock, Gauge } from 'lucide-react';
import { formatCurrency, formatKwh, formatDuration } from '../../utils/formatters';

const CIRCUMFERENCE = 2 * Math.PI * 66;

export default function ActiveChargingModal({ session, onStop }) {
  const [soc, setSoc] = useState(session.startSoc || 35);
  const [kwh, setKwh] = useState(0);
  const [cost, setCost] = useState(0);
  const [power, setPower] = useState(session.power || 60);
  const [elapsedSeconds, setElapsedSeconds] = useState(0);

  useEffect(() => {
    const timer = setInterval(() => {
      setSoc((prev) => {
        if (prev >= 100) {
          clearInterval(timer);
          return 100;
        }
        const next = prev + 1;
        // Thermal / battery throttling above 80% SoC
        const currentPower = next > 80 ? Math.round(session.power * 0.4) : session.power;
        setPower(currentPower);

        const deltaKwh = (currentPower / 3600) * 10;
        setKwh((k) => parseFloat((k + deltaKwh).toFixed(2)));
        setCost((c) => parseFloat((c + deltaKwh * (session.price || 18.5)).toFixed(2)));
        setElapsedSeconds((e) => e + 1);
        return next;
      });
    }, 750);

    return () => clearInterval(timer);
  }, [session]);

  const offset = CIRCUMFERENCE * (1 - soc / 100);
  const co2Saved = (kwh * 0.71).toFixed(1);

  return (
    <div className="fixed inset-0 z-[1700] backdrop-blur-md bg-black/75 flex items-center justify-center p-4 animate-fade-in">
      <div className="panel-surface border border-white/[.12] rounded-3xl p-6 md:p-8 w-full max-w-lg shadow-2xl relative animate-slide-up flex flex-col items-center">
        {/* Offline Badge */}
        {session.isOffline && (
          <div className="flex items-center gap-2 bg-amber-500/10 border border-amber-500/25 rounded-full px-4 py-1.5 mb-5">
            <WifiOff className="w-3.5 h-3.5 text-amber-400" />
            <span className="text-[11px] font-semibold text-amber-400">
              VahanGrid Edge Gateway — Offline Sync Active
            </span>
            <ShieldCheck className="w-3.5 h-3.5 text-amber-400" />
          </div>
        )}

        {/* Station Info */}
        <div className="text-center mb-6">
          <span className="text-[10px] font-bold text-sky-400 uppercase tracking-widest bg-sky-500/10 px-2.5 py-0.5 rounded-full border border-sky-500/20">
            Active DC Fast Charge Session
          </span>
          <h2 className="text-lg md:text-xl font-black text-white mt-1.5">
            {session.stationName}
          </h2>
          <p className="text-xs text-slate-400 mt-0.5">
            {session.operator?.toUpperCase()} Network • CCS2 415V Interoperable
          </p>
        </div>

        {/* Circular Progress Ring */}
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
              strokeWidth="9"
            />
            {/* Active Flow Ring */}
            <circle
              cx="80"
              cy="80"
              r="66"
              fill="none"
              stroke="url(#vahangrid-ring-grad)"
              strokeWidth="9"
              strokeLinecap="round"
              strokeDasharray={CIRCUMFERENCE}
              strokeDashoffset={offset}
              style={{ transition: 'stroke-dashoffset 0.6s ease' }}
            />
            <defs>
              <linearGradient id="vahangrid-ring-grad" x1="0%" y1="0%" x2="100%" y2="100%">
                <stop offset="0%" stopColor="#06b6d4" />
                <stop offset="50%" stopColor="#3b82f6" />
                <stop offset="100%" stopColor="#10b981" />
              </linearGradient>
            </defs>
          </svg>

          {/* Centered SoC & kW Display */}
          <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
            <span className="text-4xl md:text-5xl font-black font-display text-white tracking-tight drop-shadow-[0_0_18px_rgba(56,189,248,0.5)]">
              {soc}%
            </span>
            <span className="text-xs text-sky-400 font-bold mt-1 flex items-center gap-1">
              <Zap className="w-3.5 h-3.5 fill-sky-400" /> {power} kW
            </span>
          </div>
        </div>

        {/* Live Metrics Grid */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5 w-full mb-6">
          <div className="bg-white/[.02] border border-white/[.06] rounded-xl p-2.5 text-center">
            <div className="text-[9px] uppercase font-semibold text-slate-400">Energy</div>
            <div className="text-xs md:text-sm font-bold text-sky-400 mt-0.5">{kwh} kWh</div>
          </div>

          <div className="bg-white/[.02] border border-white/[.06] rounded-xl p-2.5 text-center">
            <div className="text-[9px] uppercase font-semibold text-slate-400">Session Cost</div>
            <div className="text-xs md:text-sm font-bold text-emerald-400 mt-0.5">
              ₹{cost.toFixed(2)}
            </div>
          </div>

          <div className="bg-white/[.02] border border-white/[.06] rounded-xl p-2.5 text-center">
            <div className="text-[9px] uppercase font-semibold text-slate-400">CO₂ Avoided</div>
            <div className="text-xs md:text-sm font-bold text-teal-300 mt-0.5">{co2Saved} kg</div>
          </div>

          <div className="bg-white/[.02] border border-white/[.06] rounded-xl p-2.5 text-center">
            <div className="text-[9px] uppercase font-semibold text-slate-400">Duration</div>
            <div className="text-xs md:text-sm font-bold text-slate-200 mt-0.5">
              {Math.floor(elapsedSeconds / 60)}m {elapsedSeconds % 60}s
            </div>
          </div>
        </div>

        {/* Flow Animation Bar */}
        <div className="w-full h-2 rounded-full overflow-hidden bg-white/[.06] mb-6">
          <div
            className="h-full charge-bar rounded-full"
            style={{ width: `${soc}%`, transition: 'width 0.5s ease' }}
          />
        </div>

        {/* Terminate Session Button */}
        <button
          onClick={() => onStop({ cost, kwh, soc })}
          className="flex items-center justify-center gap-2 w-full py-3.5 rounded-xl font-bold text-sm bg-rose-500/15 border border-rose-500/30 text-rose-400 hover:bg-rose-500/25 hover:border-rose-500/50 transition-all active:scale-[0.98] cursor-pointer"
        >
          <StopCircle className="w-4 h-4" /> Stop & Finalize Session
        </button>
      </div>
    </div>
  );
}
