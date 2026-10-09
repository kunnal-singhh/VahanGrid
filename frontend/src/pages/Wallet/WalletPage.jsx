import { useState, useEffect, useCallback } from 'react';
import {
  Receipt,
  ShieldCheck,
  Loader2,
  AlertCircle,
  RefreshCw,
  Wallet as WalletIcon,
  TrendingDown,
  TrendingUp,
  CreditCard,
  PlusCircle,
  CheckCircle2,
} from 'lucide-react';
import VahanPassCard from '../../components/wallet/VahanPassCard';
import QuickTopUp from '../../components/wallet/QuickTopUp';
import TransactionList from '../../components/wallet/TransactionList';
import PaymentList from '../../components/wallet/PaymentList';
import TopUpModal from '../../components/wallet/TopUpModal';
import CdrReceiptModal from '../../components/charging/CdrReceiptModal';
import { walletService } from '../../services/walletService';
import { chargingService } from '../../services/chargingService';
import { formatCurrency } from '../../utils/formatters';

export default function WalletPage({ onBalanceSync, theme }) {
  const [wallet, setWallet] = useState(null);
  const [transactions, setTransactions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [successToast, setSuccessToast] = useState(null);

  // Tabs: 'ledger' | 'payments'
  const [activeTab, setActiveTab] = useState('ledger');

  // Top-Up Modal State
  const [topUpOpen, setTopUpOpen] = useState(false);
  const [topUpInitialAmount, setTopUpInitialAmount] = useState(500);

  // CDR Receipt Modal State (when clicking charging transaction)
  const [cdrModal, setCdrModal] = useState({
    open: false,
    session: null,
    cdr: null,
    loading: false,
    error: null,
  });

  const fetchWalletData = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const [walletData, txnsData] = await Promise.all([
        walletService.getWallet(),
        walletService.getWalletTransactions(),
      ]);

      setWallet(walletData);
      setTransactions(Array.isArray(txnsData) ? txnsData : []);
      if (walletData && onBalanceSync) {
        onBalanceSync(walletData.balance ?? 0);
      }
    } catch (err) {
      console.error('[WalletPage] Error loading wallet data:', err);
      setError(err.message || 'Unable to load wallet. Please try again.');
    } finally {
      setLoading(false);
    }
  }, [onBalanceSync]);

  useEffect(() => {
    fetchWalletData();
  }, [fetchWalletData]);

  const handleOpenTopUp = (amount = 500) => {
    setTopUpInitialAmount(amount);
    setTopUpOpen(true);
  };

  const handleTopUpSuccess = async (verifyResult) => {
    await fetchWalletData();
    setSuccessToast(`Top-up successful! New balance: ${formatCurrency(verifyResult.balance_after || wallet?.balance || 0)}`);
    setTimeout(() => setSuccessToast(null), 5000);
  };

  const handleViewReceipt = async (tx) => {
    if (!tx.cdr_id) return;
    setCdrModal({
      open: true,
      session: {
        id: tx.session_id || tx.reference_id || 'N/A',
        stationName: tx.location_name || 'Charging Station',
        energy_kwh: tx.energy_kwh || 0,
        cost_amount: Math.abs(tx.amount || 0),
        started_at: tx.created_at,
      },
      cdr: null,
      loading: true,
      error: null,
    });

    try {
      // Fetch CDR either via session or direct CDR lookup
      let cdrData = null;
      if (tx.session_id) {
        cdrData = await chargingService.getSessionCdr(tx.session_id);
      }
      if (!cdrData && tx.cdr_id) {
        // Fallback endpoint
        const res = await fetch(`http://localhost:3001/api/v1/cdrs/${encodeURIComponent(tx.cdr_id)}`, {
          credentials: 'include',
        });
        if (res.ok) {
          const json = await res.json();
          cdrData = json.data;
        }
      }
      setCdrModal((prev) => ({ ...prev, cdr: cdrData, loading: false }));
    } catch (err) {
      console.error('[WalletPage] Error loading receipt CDR:', err);
      setCdrModal((prev) => ({
        ...prev,
        loading: false,
        error: err.message || 'Could not load CDR details.',
      }));
    }
  };

  const handleCloseCdrModal = () => {
    setCdrModal({ open: false, session: null, cdr: null, loading: false, error: null });
  };

  const balance = wallet?.balance ?? 0;
  const currency = wallet?.currency || 'INR';
  const status = wallet?.status || 'active';

  // Compute metrics from signed transactions
  const totalDebits = transactions.reduce((acc, tx) => {
    const amt = Number(tx.amount) || 0;
    return amt < 0 ? acc + Math.abs(amt) : acc;
  }, 0);

  const totalCredits = transactions.reduce((acc, tx) => {
    const amt = Number(tx.amount) || 0;
    return amt > 0 ? acc + amt : acc;
  }, 0);

  return (
    <div className="p-4 md:p-6 max-w-4xl mx-auto space-y-6 animate-fade-in pb-20 md:pb-8">
      {/* Page Title & Status */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <span className="text-[10px] font-bold text-sky-400 uppercase tracking-widest bg-sky-500/10 px-2 py-0.5 rounded-full border border-sky-500/20">
              Unified Financial Hub
            </span>
            <span className="text-[10px] text-emerald-400 font-semibold flex items-center gap-1">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
              PostgreSQL Ledger Active
            </span>
          </div>
          <h1 className="text-xl md:text-2xl font-black text-white">
            VahanPass Universal Wallet
          </h1>
          <p className="text-xs text-slate-300 mt-1">
            Single balance across all Indian EV charging operators. Plug, charge, and get consolidated GST tax invoices.
          </p>
        </div>

        {/* Actions: Refresh & Top-Up */}
        <div className="flex items-center gap-2 self-start sm:self-center">
          {!loading && !error && (
            <button
              onClick={fetchWalletData}
              title="Refresh Wallet"
              className="px-3 py-2 rounded-xl text-xs font-semibold bg-white/[.04] hover:bg-white/[.08] border border-white/[.08] text-slate-300 flex items-center gap-1.5 transition-colors cursor-pointer"
            >
              <RefreshCw className="w-3.5 h-3.5 text-sky-400" />
              <span>Refresh</span>
            </button>
          )}

          <button
            onClick={() => handleOpenTopUp(500)}
            className="px-4 py-2 rounded-xl text-xs font-bold bg-gradient-to-r from-sky-500 to-emerald-500 hover:from-sky-400 hover:to-emerald-400 text-white flex items-center gap-1.5 shadow-md shadow-sky-500/15 transition-all cursor-pointer"
          >
            <PlusCircle className="w-3.5 h-3.5" />
            <span>Top Up</span>
          </button>
        </div>
      </div>

      {/* Success Toast */}
      {successToast && (
        <div className="glass rounded-xl p-3.5 border border-emerald-500/30 bg-emerald-500/10 flex items-center justify-between text-xs text-emerald-400 animate-fade-in">
          <div className="flex items-center gap-2">
            <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
            <span>{successToast}</span>
          </div>
          <button
            onClick={() => setSuccessToast(null)}
            className="text-emerald-400 font-bold ml-3 hover:text-slate-900 dark:hover:text-white"
          >
            ✕
          </button>
        </div>
      )}

      {/* Loading State */}
      {loading ? (
        <div className="glass rounded-3xl p-12 text-center space-y-3 border border-white/[.08]">
          <Loader2 className="w-8 h-8 text-sky-400 animate-spin mx-auto" />
          <p className="text-sm font-semibold text-white">Connecting to VahanPass Wallet Ledger...</p>
          <p className="text-xs text-slate-400">Deriving signed transaction balance from PostgreSQL</p>
        </div>
      ) : error ? (
        /* Error State with Retry */
        <div className="glass rounded-3xl p-10 text-center space-y-4 border border-rose-500/20 bg-rose-500/5">
          <AlertCircle className="w-10 h-10 text-rose-400 mx-auto" />
          <div className="space-y-1">
            <h3 className="text-sm font-bold text-white">Failed to Load Wallet</h3>
            <p className="text-xs text-slate-300 max-w-sm mx-auto">{error}</p>
          </div>
          <button
            onClick={fetchWalletData}
            className="px-5 py-2.5 rounded-xl text-xs font-bold bg-white/[.08] hover:bg-white/[.15] border border-white/[.15] text-sky-400 transition-colors inline-flex items-center gap-2 cursor-pointer"
          >
            <RefreshCw className="w-3.5 h-3.5" />
            Retry
          </button>
        </div>
      ) : (
        <>
          {/* Pass Card & Quick Top-Up Grid */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 items-stretch">
            <VahanPassCard balance={balance} currency={currency} status={status} theme={theme} />
            <QuickTopUp onTopUp={(amt) => handleOpenTopUp(amt)} />
          </div>

          {/* Consolidated Billing & Ledger Metrics Summary */}
          <div className="glass rounded-2xl p-5 border border-white/[.08] space-y-3.5">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold text-white flex items-center gap-1.5">
                <Receipt className="w-4 h-4 text-sky-400" /> Wallet Financial Summary
              </span>
              <span className="text-[10px] text-slate-400 font-medium">Verified Ledger</span>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2.5">
              <div className="bg-white/[.02] border border-white/[.05] rounded-xl p-3 text-center">
                <div className="text-[10px] text-slate-400 font-medium flex items-center justify-center gap-1">
                  <TrendingUp className="w-3 h-3 text-emerald-400" /> Total Inflow (Credits)
                </div>
                <div className="text-sm font-extrabold text-emerald-400 mt-0.5">
                  {formatCurrency(totalCredits, currency)}
                </div>
              </div>

              <div className="bg-white/[.02] border border-white/[.05] rounded-xl p-3 text-center">
                <div className="text-[10px] text-slate-400 font-medium flex items-center justify-center gap-1">
                  <TrendingDown className="w-3 h-3 text-rose-400" /> Total Outflow (Debits)
                </div>
                <div className="text-sm font-extrabold text-slate-200 mt-0.5">
                  {formatCurrency(totalDebits, currency)}
                </div>
              </div>

              <div className="bg-white/[.02] border border-white/[.05] rounded-xl p-3 text-center col-span-2 sm:col-span-1">
                <div className="text-[10px] text-slate-400 font-medium flex items-center justify-center gap-1">
                  <WalletIcon className="w-3 h-3 text-sky-400" /> Active Balance
                </div>
                <div className="text-sm font-extrabold text-white mt-0.5">
                  {formatCurrency(balance, currency)}
                </div>
              </div>
            </div>

            <div className="flex justify-between items-center pt-2 border-t border-white/[.06] text-xs">
              <span className="text-slate-300 font-medium">Net Ledger Balance ({currency})</span>
              <span className="text-base font-black font-display text-emerald-400">
                {formatCurrency(balance, currency)}
              </span>
            </div>
          </div>

          {/* Activity Navigation Tabs */}
          <div className="flex items-center gap-2 border-b border-white/[.08] pb-1">
            <button
              onClick={() => setActiveTab('ledger')}
              className={`px-4 py-2 text-xs font-bold rounded-xl transition-all cursor-pointer flex items-center gap-2 ${
                activeTab === 'ledger'
                  ? 'bg-sky-500/20 text-sky-400 border border-sky-500/30'
                  : 'text-slate-400 hover:text-white'
              }`}
            >
              <Receipt className="w-3.5 h-3.5" />
              <span>Ledger Transactions ({transactions.length})</span>
            </button>

            <button
              onClick={() => setActiveTab('payments')}
              className={`px-4 py-2 text-xs font-bold rounded-xl transition-all cursor-pointer flex items-center gap-2 ${
                activeTab === 'payments'
                  ? 'bg-sky-500/20 text-sky-400 border border-sky-500/30'
                  : 'text-slate-400 hover:text-white'
              }`}
            >
              <CreditCard className="w-3.5 h-3.5" />
              <span>Payment Gateway Orders</span>
            </button>
          </div>

          {/* Tab Views */}
          {activeTab === 'ledger' ? (
            <TransactionList
              transactions={transactions}
              currency={currency}
              onViewReceipt={handleViewReceipt}
            />
          ) : (
            <PaymentList onRefreshParent={fetchWalletData} />
          )}
        </>
      )}

      {/* Top-Up Modal */}
      {topUpOpen && (
        <TopUpModal
          initialAmount={topUpInitialAmount}
          onClose={() => setTopUpOpen(false)}
          onSuccess={handleTopUpSuccess}
        />
      )}

      {/* CDR Receipt Modal */}
      {cdrModal.open && cdrModal.session && (
        <CdrReceiptModal
          session={cdrModal.session}
          cdr={cdrModal.cdr}
          loading={cdrModal.loading}
          error={cdrModal.error}
          userBalance={balance}
          onClose={handleCloseCdrModal}
          onOpenTopUp={() => handleOpenTopUp(500)}
          onSettlementUpdated={fetchWalletData}
        />
      )}
    </div>
  );
}
