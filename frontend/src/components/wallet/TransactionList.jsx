import { ArrowDownLeft, ArrowUpRight, Receipt, Clock } from 'lucide-react';
import { formatCurrency, formatTimestampIST } from '../../utils/formatters';

function formatTransactionType(type) {
  switch (type) {
    case 'topup':
      return 'Top-Up';
    case 'charging_payment':
      return 'Charging Payment';
    case 'refund':
      return 'Refund';
    case 'cashback':
      return 'Cashback';
    case 'adjustment':
      return 'Adjustment';
    default:
      return type ? type.replace(/_/g, ' ') : 'Transaction';
  }
}

export default function TransactionList({ transactions = [], currency = 'INR' }) {
  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <h3 className="text-xs font-bold text-white uppercase tracking-wider">
          Transaction History ({transactions.length})
        </h3>
        <span className="text-[10px] text-slate-400">PostgreSQL Signed Ledger</span>
      </div>

      <div className="space-y-2">
        {transactions.length === 0 ? (
          <div className="glass rounded-2xl p-8 text-center space-y-2 border border-white/[.06]">
            <div className="w-12 h-12 rounded-2xl bg-white/[.04] border border-white/[.08] flex items-center justify-center text-slate-400 mx-auto">
              <Receipt className="w-6 h-6 text-sky-400" />
            </div>
            <div className="text-sm font-bold text-white">No Transactions Recorded</div>
            <p className="text-xs text-slate-400 max-w-sm mx-auto">
              Your wallet ledger is currently empty. Once charging sessions or wallet credits occur, they will be listed here in chronological order.
            </p>
          </div>
        ) : (
          transactions.map((tx, idx) => {
            const numAmount = Number(tx.amount) || 0;
            const isCredit = numAmount > 0;
            const absAmount = Math.abs(numAmount);
            const txnCurrency = tx.currency || currency || 'INR';

            return (
              <div
                key={tx.id || idx}
                className="glass rounded-xl p-3.5 flex items-center justify-between gap-3 hover:bg-white/[.04] transition-all border border-white/[.05]"
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
                      {tx.description || formatTransactionType(tx.type)}
                    </span>
                    {tx.type && (
                      <span className="text-[9px] px-1.5 py-0.5 rounded bg-white/[.05] text-slate-300 border border-white/[.08] hidden sm:inline capitalize">
                        {formatTransactionType(tx.type)}
                      </span>
                    )}
                  </div>
                  <div className="text-[10px] text-slate-400 mt-0.5 flex items-center gap-2 flex-wrap">
                    <span className="flex items-center gap-1">
                      <Clock className="w-3 h-3 text-slate-500" />
                      {tx.created_at ? formatTimestampIST(tx.created_at) : 'N/A'}
                    </span>
                    {tx.reference_type && tx.reference_id && (
                      <span className="text-slate-400">
                        • {tx.reference_type}: {tx.reference_id.slice(0, 8)}
                      </span>
                    )}
                    {(!tx.reference_type || !tx.reference_id) && tx.id && (
                      <span className="text-slate-500 font-mono">
                        • ID: {tx.id.slice(0, 8)}
                      </span>
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
                    ? `+${formatCurrency(absAmount, txnCurrency)}`
                    : `-${formatCurrency(absAmount, txnCurrency)}`}
                </div>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}
