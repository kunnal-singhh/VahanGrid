import { Clock, Zap, Leaf, Download, Receipt, ShieldCheck } from 'lucide-react';
import { formatCurrency, formatKwh } from '../../utils/formatters';

export default function HistoryPage({ transactions = [] }) {
  const chargingSessions = transactions.filter((t) => t.cost > 0);
  const totalKwh = chargingSessions.reduce((acc, t) => acc + (t.kwh || 0), 0);
  const totalCost = chargingSessions.reduce((acc, t) => acc + (t.cost || 0), 0);
  const totalCo2 = (totalKwh * 0.71).toFixed(1);

  const handleDownloadInvoice = (tx) => {
    alert(`📄 Generating GST Tax Invoice for session at ${tx.station} (${formatCurrency(tx.cost)}).`);
  };

  return (
    <div className="p-4 md:p-6 max-w-5xl mx-auto space-y-6 animate-fade-in pb-20 md:pb-8">
      {/* Title */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <span className="text-[10px] font-bold text-sky-400 uppercase tracking-widest bg-sky-500/10 px-2 py-0.5 rounded-full border border-sky-500/20">
              Audit & Records
            </span>
          </div>
          <h1 className="text-xl md:text-2xl font-black text-white">
            Charging Session History
          </h1>
          <p className="text-xs text-slate-300 mt-0.5">
            Verified charge detail records (CDRs) across all connected CPO networks.
          </p>
        </div>

        <button
          onClick={() => alert('📄 Generating consolidated monthly GST tax statement.')}
          className="px-4 py-2 rounded-xl text-xs font-bold bg-white/[.06] hover:bg-white/[.1] border border-white/[.1] text-slate-200 transition-colors flex items-center gap-2 self-start sm:self-center cursor-pointer"
        >
          <Download className="w-3.5 h-3.5 text-sky-400" />
          <span>Export Monthly Tax CDRs</span>
        </button>
      </div>

      {/* Aggregate Stats */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 md:gap-4">
        <div className="glass rounded-2xl p-4 border border-white/[.08]">
          <div className="flex items-center justify-between text-slate-400 text-xs">
            <span>Total Energy Delivered</span>
            <Zap className="w-4 h-4 text-sky-400" />
          </div>
          <div className="text-xl font-black font-display text-white mt-1.5">
            {formatKwh(totalKwh)}
          </div>
          <div className="text-[10px] text-slate-400 mt-0.5">
            {chargingSessions.length} Successful Sessions
          </div>
        </div>

        <div className="glass rounded-2xl p-4 border border-white/[.08]">
          <div className="flex items-center justify-between text-slate-400 text-xs">
            <span>Total Expenditure</span>
            <Receipt className="w-4 h-4 text-teal-300" />
          </div>
          <div className="text-xl font-black font-display text-emerald-400 mt-1.5">
            {formatCurrency(totalCost)}
          </div>
          <div className="text-[10px] text-slate-400 mt-0.5">
            Unified Roaming Billing
          </div>
        </div>

        <div className="glass rounded-2xl p-4 border border-white/[.08]">
          <div className="flex items-center justify-between text-slate-400 text-xs">
            <span>Total CO₂ Saved</span>
            <Leaf className="w-4 h-4 text-emerald-400" />
          </div>
          <div className="text-xl font-black font-display text-teal-300 mt-1.5">
            {totalCo2} kg
          </div>
          <div className="text-[10px] text-slate-400 mt-0.5">
            Tailpipe Emissions Avoided
          </div>
        </div>
      </div>

      {/* Sessions Table / Cards */}
      <div className="glass rounded-3xl p-5 md:p-6 border border-white/[.08] space-y-4">
        <h2 className="text-xs font-bold text-white uppercase tracking-wider">
          Individual Charging CDRs ({chargingSessions.length})
        </h2>

        <div className="space-y-3">
          {chargingSessions.length === 0 ? (
            <div className="text-center py-10 text-xs text-slate-400">
              No charging sessions recorded yet.
            </div>
          ) : (
            chargingSessions.map((session, idx) => (
              <div
                key={session.id || idx}
                className="bg-white/[.02] border border-white/[.05] hover:border-sky-500/25 rounded-2xl p-4 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 transition-all"
              >
                <div>
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-xs font-extrabold text-white">
                      {session.op} — {session.station}
                    </span>
                    <span className="text-[9px] px-2 py-0.5 rounded-full chip-available font-bold">
                      {session.type || 'Roaming OCPI'}
                    </span>
                  </div>
                  <div className="text-[11px] text-slate-400 mt-1 flex items-center gap-3 flex-wrap">
                    <span>Date: {session.time}</span>
                    <span>• Energy: {formatKwh(session.kwh)}</span>
                    {session.isOffline && (
                      <span className="text-amber-400 font-semibold">• Edge Mode</span>
                    )}
                  </div>
                </div>

                <div className="flex items-center gap-4 self-end sm:self-center">
                  <div className="text-right">
                    <div className="text-sm font-black font-display text-white">
                      {formatCurrency(session.cost)}
                    </div>
                    <div className="text-[10px] text-emerald-400 font-semibold">
                      Settled via VahanPass
                    </div>
                  </div>

                  <button
                    onClick={() => handleDownloadInvoice(session)}
                    className="p-2 rounded-xl bg-white/[.04] hover:bg-white/[.08] text-slate-400 hover:text-white transition-colors cursor-pointer"
                    title="Download Tax Invoice"
                  >
                    <Download className="w-4 h-4" />
                  </button>
                </div>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
}
