import { useState } from 'react';
import { Zap, StopCircle, ArrowUpRight, Loader2 } from 'lucide-react';

export default function ChargingSessionCard({ session, onOpenDetail, onStop }) {
  const [isStopping, setIsStopping] = useState(false);

  if (!session) return null;

  const stationName = session.location?.name || session.stationName || 'Charging Station';
  const vehicleName = session.vehicle
    ? `${session.vehicle.manufacturer} ${session.vehicle.model}`
    : session.vehicleName || 'Registered EV';
  const connectorStandard = session.connector?.standard || session.connectorStandard || 'CCS2';
  const ratedPower = session.connector?.max_power_kw || session.power || 60;

  const handleStop = async (e) => {
    e.stopPropagation();
    if (!onStop || isStopping) return;
    try {
      setIsStopping(true);
      await onStop(session.id || session.sessionId);
    } catch (err) {
      console.error('[ChargingSessionCard] Stop failed:', err);
    } finally {
      setIsStopping(false);
    }
  };

  return (
    <div className="glass rounded-2xl p-4 md:p-5 border border-sky-500/30 bg-gradient-to-r from-sky-500/[.05] via-emerald-500/[.03] to-transparent relative overflow-hidden">
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-sky-500/20 border border-sky-500/30 flex items-center justify-center text-sky-400 shrink-0">
            <Zap className="w-5 h-5 animate-pulse fill-sky-400" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <span className="text-[10px] font-bold uppercase tracking-wider text-sky-400">
                Session Active
              </span>
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-blink" />
            </div>
            <h3 className="text-sm font-bold text-white truncate max-w-[280px]">
              {stationName}
            </h3>
            <p className="text-[11px] text-slate-400">
              {connectorStandard} ({ratedPower} kW) • {vehicleName} • Waiting for charger telemetry
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2 self-end sm:self-center">
          <button
            onClick={onOpenDetail}
            className="px-3 py-1.5 rounded-xl text-xs font-semibold bg-white/[.06] hover:bg-white/[.1] border border-white/[.08] text-slate-200 transition-colors flex items-center gap-1 cursor-pointer"
          >
            <span>View Gauge</span>
            <ArrowUpRight className="w-3.5 h-3.5" />
          </button>

          <button
            onClick={handleStop}
            disabled={isStopping}
            className="px-3 py-1.5 rounded-xl text-xs font-semibold bg-rose-500/15 hover:bg-rose-500/25 border border-rose-500/30 text-rose-400 transition-colors flex items-center gap-1 cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {isStopping ? (
              <>
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
                <span>Stopping...</span>
              </>
            ) : (
              <>
                <StopCircle className="w-3.5 h-3.5" />
                <span>Stop</span>
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
