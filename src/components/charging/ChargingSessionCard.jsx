import { Zap, Clock, StopCircle, ArrowUpRight } from 'lucide-react';
import { formatCurrency, formatKwh } from '../../utils/formatters';

export default function ChargingSessionCard({ session, onOpenDetail, onStop }) {
  if (!session) return null;

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
              {session.stationName}
            </h3>
            <p className="text-[11px] text-slate-400">
              Target: 80% • Rated Speed {session.power} kW
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
            onClick={() => onStop && onStop({ cost: 180, kwh: 10, soc: 80 })}
            className="px-3 py-1.5 rounded-xl text-xs font-semibold bg-rose-500/15 hover:bg-rose-500/25 border border-rose-500/30 text-rose-400 transition-colors flex items-center gap-1 cursor-pointer"
          >
            <StopCircle className="w-3.5 h-3.5" />
            <span>Stop</span>
          </button>
        </div>
      </div>
    </div>
  );
}
