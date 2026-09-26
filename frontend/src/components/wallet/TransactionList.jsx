import { ArrowDownLeft, ArrowUpRight, Zap, ShieldCheck } from 'lucide-react';
import { formatCurrency, formatKwh } from '../../utils/formatters';

export default function TransactionList({ transactions = [] }) {
  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <h3 className="text-xs font-bold text-white uppercase tracking-wider">
          Unified Roaming History ({transactions.length})
        </h3>
        <span className="text-[10px] text-slate-400">OCPI Auto-Cleared</span>
      </div>

      <div className="space-y-2">
        {transactions.length === 0 ? (
          <div className="glass rounded-xl p-8 text-center text-xs text-slate-400">
            No transactions yet. Complete your first charging session or top up!
          </div>
        ) : (
          transactions.map((tx, idx) => {
            const isCredit = tx.cost < 0;
            return (
              <div
                key={tx.id || idx}
                className="glass rounded-xl p-3.5 flex items-center justify-between gap-3 hover:bg-white/[.04] transition-all"
              >
                {/* Icon */}
                <div
                  className={`w-9 h-9 rounded-xl flex items-center justify-center shrink-0 ${
                    isCredit ? 'bg-emerald-500/10 text-emerald-400' : 'bg-rose-500/10 text-rose-400'
                  }`}
                >
                  {isCredit ? (
                    <ArrowDownLeft className="w-4 h-4" />
                  ) : (
                    <ArrowUpRight className="w-4 h-4" />
                  )}
                </div>

                {/* Details */}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-bold text-white truncate">
                      {tx.op} — {tx.station}
                    </span>
                    {tx.type && (
                      <span className="text-[9px] px-1.5 py-0.2 rounded bg-white/[.05] text-slate-300 border border-white/[.08] hidden sm:inline">
                        {tx.type}
                      </span>
                    )}
                  </div>
                  <div className="text-[10px] text-slate-400 mt-0.5 flex items-center gap-2 flex-wrap">
                    <span>{tx.time}</span>
                    {tx.kwh > 0 && <span>• {formatKwh(tx.kwh)}</span>}
                    {tx.isOffline && (
                      <span className="text-amber-400 font-semibold">• Edge Mode</span>
                    )}
                  </div>
                </div>

                {/* Amount */}
                <div
                  className={`text-xs md:text-sm font-black font-display shrink-0 ${
                    isCredit ? 'text-emerald-400' : 'text-slate-200'
                  }`}
                >
                  {isCredit
                    ? `+${formatCurrency(Math.abs(tx.cost))}`
                    : `-${formatCurrency(tx.cost)}`}
                </div>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}
