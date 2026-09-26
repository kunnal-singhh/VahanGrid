import { Receipt, CreditCard, ShieldCheck } from 'lucide-react';
import VahanPassCard from '../../components/wallet/VahanPassCard';
import QuickTopUp from '../../components/wallet/QuickTopUp';
import TransactionList from '../../components/wallet/TransactionList';
import { formatCurrency } from '../../utils/formatters';

export default function WalletPage({
  balance = 1450,
  transactions = [],
  onTopUp,
}) {
  // Compute monthly breakdown per operator
  const opTotals = {};
  transactions.forEach((tx) => {
    if (tx.cost > 0) {
      opTotals[tx.op] = (opTotals[tx.op] || 0) + tx.cost;
    }
  });

  const totalMonthlySpend = Object.values(opTotals).reduce((a, b) => a + b, 0);

  return (
    <div className="p-4 md:p-6 max-w-4xl mx-auto space-y-6 animate-fade-in pb-20 md:pb-8">
      {/* Page Title */}
      <div>
        <div className="flex items-center gap-2 mb-1">
          <span className="text-[10px] font-bold text-sky-400 uppercase tracking-widest bg-sky-500/10 px-2 py-0.5 rounded-full border border-sky-500/20">
            Unified Roaming Payments
          </span>
          <span className="text-[10px] text-emerald-400 font-semibold">
            One Invoice for India
          </span>
        </div>
        <h1 className="text-xl md:text-2xl font-black text-white">
          VahanPass Universal Wallet
        </h1>
        <p className="text-xs text-slate-300 mt-1">
          Single balance across all Indian EV charging operators. Plug, charge, and get consolidated GST tax invoices.
        </p>
      </div>

      {/* Pass Card & Quick Top-Up Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 items-stretch">
        <VahanPassCard balance={balance} />
        <QuickTopUp onTopUp={onTopUp} />
      </div>

      {/* Consolidated Monthly Billing Summary */}
      <div className="glass rounded-2xl p-5 border border-white/[.08] space-y-3.5">
        <div className="flex items-center justify-between">
          <span className="text-xs font-bold text-white flex items-center gap-1.5">
            <Receipt className="w-4 h-4 text-sky-400" /> Multi-CPO Monthly Spend Breakdown
          </span>
          <span className="text-[10px] text-slate-400 font-medium">September 2026</span>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
          {Object.entries(opTotals).map(([opName, amt]) => (
            <div
              key={opName}
              className="bg-white/[.02] border border-white/[.05] rounded-xl p-3 text-center"
            >
              <div className="text-[10px] text-slate-400 font-medium truncate">{opName}</div>
              <div className="text-sm font-extrabold text-white mt-0.5">
                {formatCurrency(amt)}
              </div>
            </div>
          ))}
        </div>

        <div className="flex justify-between items-center pt-2 border-t border-white/[.06] text-xs">
          <span className="text-slate-300 font-medium">Consolidated Monthly Total</span>
          <span className="text-base font-black font-display text-emerald-400">
            {formatCurrency(totalMonthlySpend)}
          </span>
        </div>
      </div>

      {/* Transaction History Log */}
      <TransactionList transactions={transactions} />
    </div>
  );
}
