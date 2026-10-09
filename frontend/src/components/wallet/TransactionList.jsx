/**
 * frontend/src/components/wallet/TransactionList.jsx
 *
 * Unified Ledger Transaction History Component (Phase 3G).
 *
 * Responsibilities:
 *  - Renders signed ledger movements from PostgreSQL (debits & credits).
 *  - Displays running balance (balance_after) for auditable accounting.
 *  - Enriches charging payments with station location and delivered energy.
 *  - Provides direct one-click action to view the authoritative CDR receipt.
 *  - Filterable by activity type: All, Charging Payments, Top-Ups.
 */

import { useState } from 'react';
import {
  ArrowDownLeft,
  ArrowUpRight,
  Receipt,
  Clock,
  Zap,
  CreditCard,
  ExternalLink,
} from 'lucide-react';
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

export default function TransactionList({
  transactions = [],
  currency = 'INR',
  onViewReceipt,
}) {
  const [filter, setFilter] = useState('all'); // 'all' | 'charging' | 'topup'

  const filteredTransactions = transactions.filter((tx) => {
    if (filter === 'charging') return tx.type === 'charging_payment';
    if (filter === 'topup') return tx.type === 'topup';
    return true;
  });

  return (
    <div className="space-y-3">
      {/* Header & Filter Tabs */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2.5">
        <div>
          <h3 className="text-xs font-bold text-white uppercase tracking-wider flex items-center gap-1.5">
            <Receipt className="w-3.5 h-3.5 text-sky-400" /> Ledger Transactions ({transactions.length})
          </h3>
          <span className="text-[10px] text-slate-400">PostgreSQL Signed Immutable Ledger</span>
        </div>

        {/* Filter Pills */}
        <div className="flex items-center gap-1 bg-white/[.04] p-1 rounded-xl border border-white/[.06] self-start sm:self-center">
          <button
            type="button"
            onClick={() => setFilter('all')}
            className={`px-2.5 py-1 rounded-lg text-[10px] font-bold transition-all cursor-pointer ${
              filter === 'all'
                ? 'bg-sky-500/20 text-sky-400 border border-sky-500/30'
                : 'text-slate-400 hover:text-slate-900'
            }`}
          >
            All
          </button>
          <button
            type="button"
            onClick={() => setFilter('charging')}
            className={`px-2.5 py-1 rounded-lg text-[10px] font-bold transition-all cursor-pointer ${
              filter === 'charging'
                ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30'
                : 'text-slate-400 hover:text-slate-900'
            }`}
          >
            Charging
          </button>
          <button
            type="button"
            onClick={() => setFilter('topup')}
            className={`px-2.5 py-1 rounded-lg text-[10px] font-bold transition-all cursor-pointer ${
              filter === 'topup'
                ? 'bg-purple-500/20 text-purple-400 border border-purple-500/30'
                : 'text-slate-400 hover:text-slate-900'
            }`}
          >
            Top-Ups
          </button>
        </div>
      </div>

      <div className="space-y-2">
        {filteredTransactions.length === 0 ? (
          <div className="glass rounded-2xl p-8 text-center space-y-2 border border-white/[.06]">
            <div className="w-12 h-12 rounded-2xl bg-white/[.04] border border-white/[.08] flex items-center justify-center text-slate-400 mx-auto">
              <Receipt className="w-6 h-6 text-sky-400" />
            </div>
            <div className="text-sm font-bold text-white">No Transactions Recorded</div>
            <p className="text-xs text-slate-400 max-w-sm mx-auto">
              {filter === 'all'
                ? 'Your wallet ledger is currently empty. Once charging sessions or wallet credits occur, they will be listed here.'
                : `No ${filter === 'charging' ? 'charging payments' : 'top-up transactions'} found in your ledger.`}
            </p>
          </div>
        ) : (
          filteredTransactions.map((tx, idx) => {
            const numAmount = Number(tx.amount) || 0;
            const isCredit = numAmount > 0;
            const absAmount = Math.abs(numAmount);
            const txnCurrency = tx.currency || currency || 'INR';
            const isCharging = tx.type === 'charging_payment';
            const hasCdr = !!tx.cdr_id;

            return (
              <div
                key={tx.id || idx}
                className="glass rounded-xl p-3.5 flex flex-col sm:flex-row sm:items-center justify-between gap-3 hover:bg-white/[.04] transition-all border border-white/[.05]"
              >
                {/* Left Side: Icon & Details */}
                <div className="flex items-start sm:items-center gap-3 min-w-0">
                  <div
                    className={`w-9 h-9 rounded-xl flex items-center justify-center shrink-0 mt-0.5 sm:mt-0 ${
                      isCredit ? 'bg-emerald-500/10 text-emerald-400' : 'bg-rose-500/10 text-rose-400'
                    }`}
                  >
                    {isCredit ? (
                      <ArrowDownLeft className="w-4 h-4" />
                    ) : (
                      <ArrowUpRight className="w-4 h-4" />
                    )}
                  </div>

                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-xs font-bold text-white truncate">
                        {isCharging && tx.location_name
                          ? `Charging: ${tx.location_name}`
                          : tx.description || formatTransactionType(tx.type)}
                      </span>

                      <span
                        className={`text-[9px] px-1.5 py-0.5 rounded font-bold capitalize ${
                          isCharging
                            ? 'bg-sky-500/10 text-sky-400 border border-sky-500/20'
                            : isCredit
                            ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20'
                            : 'bg-white/[.05] text-slate-300 border border-white/[.08]'
                        }`}
                      >
                        {formatTransactionType(tx.type)}
                      </span>
                    </div>

                    <div className="text-[10px] text-slate-400 mt-1 flex items-center gap-2.5 flex-wrap">
                      <span className="flex items-center gap-1">
                        <Clock className="w-3 h-3 text-slate-500" />
                        {tx.created_at ? formatTimestampIST(tx.created_at) : 'N/A'}
                      </span>

                      {/* Energy Delivered Badge if charging */}
                      {isCharging && tx.energy_kwh != null && Number(tx.energy_kwh) > 0 && (
                        <span className="text-sky-400 flex items-center gap-0.5">
                          <Zap className="w-3 h-3 text-sky-400" />
                          {Number(tx.energy_kwh).toFixed(2)} kWh
                        </span>
                      )}

                      {/* Running Balance After */}
                      {tx.balance_after != null && (
                        <span className="text-slate-300 font-medium">
                          • Balance: {formatCurrency(tx.balance_after, txnCurrency)}
                        </span>
                      )}

                      {/* Reference details */}
                      {tx.provider_order_id && (
                        <span className="font-mono text-slate-400">
                          • {tx.provider_order_id.slice(0, 14)}
                        </span>
                      )}
                    </div>
                  </div>
                </div>

                {/* Right Side: Amount & Receipt Action */}
                <div className="flex items-center justify-between sm:justify-end gap-3 self-end sm:self-center shrink-0">
                  <div className="text-right">
                    <div
                      className={`text-xs md:text-sm font-black font-display ${
                        isCredit ? 'text-emerald-400' : 'text-slate-600'
                      }`}
                    >
                      {isCredit
                        ? `+${formatCurrency(absAmount, txnCurrency)}`
                        : `-${formatCurrency(absAmount, txnCurrency)}`}
                    </div>
                  </div>

                  {/* View CDR Receipt button */}
                  {hasCdr && onViewReceipt && (
                    <button
                      type="button"
                      onClick={() => onViewReceipt(tx)}
                      className="p-1.5 rounded-lg bg-white/[.05] hover:bg-white/[.1] border border-white/[.08] text-slate-300 hover:text-slate-900 dark:hover:text-white transition-colors cursor-pointer"
                      title="View CDR Tax Receipt"
                      aria-label="View CDR receipt for this charging payment"
                    >
                      <Receipt className="w-4 h-4 text-sky-400" />
                    </button>
                  )}
                </div>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}
