/**
 * frontend/src/components/wallet/PaymentList.jsx
 *
 * Payment Gateway History & Order Status Component (Phase 3G).
 *
 * Responsibilities:
 *  - Consumes GET /api/v1/payments.
 *  - Displays user's payment orders with statuses: created, pending, paid, failed, cancelled.
 *  - Provides a refresh action to poll updated status.
 *  - Distinguishes confirmed credits from pending or failed attempts.
 */

import { useState, useEffect, useCallback } from 'react';
import {
  CreditCard,
  CheckCircle2,
  AlertCircle,
  Clock,
  RefreshCw,
  Loader2,
  XCircle,
} from 'lucide-react';
import { paymentService } from '../../services/paymentService';
import { formatCurrency, formatTimestampIST } from '../../utils/formatters';

function formatPaymentStatus(status) {
  switch (status) {
    case 'paid':
      return { label: 'Paid & Credited', color: 'bg-emerald-500/15 text-emerald-400 border-emerald-500/30' };
    case 'created':
      return { label: 'Order Created', color: 'bg-sky-500/15 text-sky-300 border-sky-500/30' };
    case 'pending':
      return { label: 'Pending Gateway', color: 'bg-amber-500/15 text-amber-300 border-amber-500/30' };
    case 'failed':
      return { label: 'Payment Failed', color: 'bg-rose-500/15 text-rose-300 border-rose-500/30' };
    case 'cancelled':
      return { label: 'Cancelled', color: 'bg-slate-500/15 text-slate-300 border-slate-500/30' };
    default:
      return { label: status || 'Unknown', color: 'bg-white/[.05] text-slate-300 border-white/[.1]' };
  }
}

export default function PaymentList({ onRefreshParent }) {
  const [payments, setPayments] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const fetchPayments = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const data = await paymentService.getPayments({ limit: 50 });
      setPayments(Array.isArray(data) ? data : []);
    } catch (err) {
      console.error('[PaymentList] Error fetching payments:', err);
      setError(err.message || 'Unable to load payment history.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchPayments();
  }, [fetchPayments]);

  const handleRefresh = async () => {
    await fetchPayments();
    if (onRefreshParent) {
      onRefreshParent();
    }
  };

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <h3 className="text-xs font-bold text-white uppercase tracking-wider flex items-center gap-1.5">
          <CreditCard className="w-3.5 h-3.5 text-sky-400" /> Payment Gateway Orders ({payments.length})
        </h3>
        <button
          onClick={handleRefresh}
          disabled={loading}
          className="text-xs font-semibold text-slate-400 hover:text-white flex items-center gap-1 cursor-pointer disabled:opacity-50"
        >
          <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
          <span>Refresh</span>
        </button>
      </div>

      {loading && payments.length === 0 ? (
        <div className="glass rounded-2xl p-8 text-center space-y-2 border border-white/[.06]">
          <Loader2 className="w-6 h-6 text-sky-400 animate-spin mx-auto" />
          <p className="text-xs text-slate-400">Loading payment gateway records...</p>
        </div>
      ) : error ? (
        <div className="glass rounded-2xl p-6 text-center space-y-2 border border-rose-500/20 bg-rose-500/5">
          <AlertCircle className="w-6 h-6 text-rose-400 mx-auto" />
          <p className="text-xs text-slate-300">{error}</p>
          <button
            onClick={fetchPayments}
            className="text-xs text-sky-400 font-bold hover:underline"
          >
            Retry
          </button>
        </div>
      ) : payments.length === 0 ? (
        <div className="glass rounded-2xl p-8 text-center space-y-2 border border-white/[.06]">
          <div className="w-10 h-10 rounded-2xl bg-white/[.04] border border-white/[.08] flex items-center justify-center text-slate-400 mx-auto">
            <CreditCard className="w-5 h-5 text-sky-400" />
          </div>
          <div className="text-sm font-bold text-white">No Payment Orders Yet</div>
          <p className="text-xs text-slate-400 max-w-sm mx-auto">
            When you top up your VahanPass wallet via UPI or cards, the gateway transaction records will appear here.
          </p>
        </div>
      ) : (
        <div className="space-y-2">
          {payments.map((p) => {
            const statusConfig = formatPaymentStatus(p.status);
            const isPaid = p.status === 'paid';
            const isFailed = p.status === 'failed';

            return (
              <div
                key={p.id}
                className="glass rounded-xl p-3.5 flex flex-col sm:flex-row sm:items-center justify-between gap-3 border border-white/[.05] hover:bg-white/[.04] transition-all"
              >
                <div className="flex items-center gap-3">
                  <div
                    className={`w-9 h-9 rounded-xl flex items-center justify-center shrink-0 ${
                      isPaid
                        ? 'bg-emerald-500/15 text-emerald-400'
                        : isFailed
                        ? 'bg-rose-500/15 text-rose-400'
                        : 'bg-sky-500/15 text-sky-400'
                    }`}
                  >
                    {isPaid ? (
                      <CheckCircle2 className="w-4 h-4" />
                    ) : isFailed ? (
                      <XCircle className="w-4 h-4" />
                    ) : (
                      <Clock className="w-4 h-4" />
                    )}
                  </div>

                  <div>
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-xs font-bold text-white">
                        {p.provider_order_id || `Payment #${p.id.slice(0, 8)}`}
                      </span>
                      <span
                        className={`text-[9px] px-2 py-0.5 rounded-full font-bold uppercase tracking-wider border ${statusConfig.color}`}
                      >
                        {statusConfig.label}
                      </span>
                    </div>

                    <div className="text-[10px] text-slate-400 mt-0.5 flex items-center gap-2 flex-wrap">
                      <span>{p.created_at ? formatTimestampIST(p.created_at) : 'N/A'}</span>
                      {p.provider_payment_id && (
                        <span className="font-mono text-slate-400">
                          • Ref: {p.provider_payment_id}
                        </span>
                      )}
                      {p.error_description && (
                        <span className="text-rose-400">
                          • {p.error_description}
                        </span>
                      )}
                    </div>
                  </div>
                </div>

                <div className="text-right self-end sm:self-center shrink-0">
                  <div className="text-xs md:text-sm font-black font-display text-white">
                    {formatCurrency(p.amount, p.currency || 'INR')}
                  </div>
                  {p.wallet_transaction_id && (
                    <span className="text-[9px] text-emerald-400 font-semibold block">
                      Wallet Credited
                    </span>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
