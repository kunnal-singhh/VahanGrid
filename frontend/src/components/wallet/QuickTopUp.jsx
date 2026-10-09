import { useState } from 'react';
import { Plus, CheckCircle2, Zap } from 'lucide-react';
import { formatCompactCurrency } from '../../utils/formatters';

const DENOMINATIONS = [200, 500, 1000, 2000];

export default function QuickTopUp({ onTopUp, isProcessing = false }) {
  const [selectedAmount, setSelectedAmount] = useState(500);
  const [showSuccess, setShowSuccess] = useState(false);

  const handleExecute = async () => {
    if (onTopUp) {
      await onTopUp(selectedAmount);
      setShowSuccess(true);
      setTimeout(() => setShowSuccess(false), 2200);
    }
  };

  return (
    <div className="glass rounded-2xl p-4 md:p-5 border border-white/[.08] space-y-3.5">
      <div className="flex items-center justify-between">
        <h3 className="text-xs font-bold text-white uppercase tracking-wider flex items-center gap-1.5">
          <Zap className="w-3.5 h-3.5 text-emerald-400" /> Quick VahanPass Refill
        </h3>
        <span className="text-[10px] text-slate-400">Zero Processing Fee</span>
      </div>

      <div className="grid grid-cols-4 gap-2">
        {DENOMINATIONS.map((amt) => (
          <button
            key={amt}
            onClick={() => setSelectedAmount(amt)}
            className={`py-2 rounded-xl text-xs font-bold border transition-all cursor-pointer ${
              selectedAmount === amt
                ? 'bg-emerald-500/15 border-emerald-500/40 text-emerald-400 shadow-md shadow-emerald-500/10'
                : 'bg-white/[.02] border-white/[.06] text-slate-400 hover:text-slate-900 hover:bg-white/[.05]'
            }`}
          >
            {formatCompactCurrency(amt)}
          </button>
        ))}
      </div>

      <button
        onClick={handleExecute}
        disabled={isProcessing}
        className="w-full h-11 rounded-xl font-bold text-xs md:text-sm flex items-center justify-center gap-2 bg-gradient-to-r from-emerald-600 to-teal-500 hover:from-emerald-500 hover:to-teal-400 text-white transition-all shadow-lg shadow-emerald-600/15 active:scale-[0.98] cursor-pointer"
      >
        {showSuccess ? (
          <>
            <CheckCircle2 className="w-4 h-4" /> Added {formatCompactCurrency(selectedAmount)} to VahanPass!
          </>
        ) : (
          <>
            <Plus className="w-4 h-4" /> Top Up {formatCompactCurrency(selectedAmount)} via UPI
          </>
        )}
      </button>
    </div>
  );
}
