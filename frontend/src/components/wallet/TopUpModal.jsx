/**
 * frontend/src/components/wallet/TopUpModal.jsx
 *
 * Secure Wallet Top-Up & Payment Gateway Checkout Modal (Phase 3G).
 *
 * Responsibilities:
 *  - Supports quick denomination presets (₹200, ₹500, ₹1000, ₹2000) and custom inputs.
 *  - Enforces minimum (₹10) and maximum (₹50,000) top-up limits.
 *  - Authenticated backend order creation via POST /api/v1/payments/orders.
 *  - Integrates Razorpay checkout with dynamically loaded script.
 *  - Authoritative server-side completion verification via POST /api/v1/payments/verify.
 *  - Displays checkout status, cancellation, and network feedback cleanly.
 *  - Never simulates client-side credits; balance updates only on verified confirmation.
 */

import { useState } from 'react';
import {
  X,
  CreditCard,
  CheckCircle2,
  AlertCircle,
  Loader2,
  ShieldCheck,
  Zap,
  Info,
} from 'lucide-react';
import { paymentService } from '../../services/paymentService';
import { formatCurrency } from '../../utils/formatters';

const PRESETS = [200, 500, 1000, 2000];
const MIN_AMOUNT = 10;
const MAX_AMOUNT = 50000;

function loadRazorpayScript() {
  return new Promise((resolve) => {
    if (window.Razorpay) {
      resolve(true);
      return;
    }
    const script = document.createElement('script');
    script.src = 'https://checkout.razorpay.com/v1/checkout.js';
    script.async = true;
    script.onload = () => resolve(true);
    script.onerror = () => resolve(false);
    document.body.appendChild(script);
  });
}

export default function TopUpModal({ initialAmount = 500, onClose, onSuccess }) {
  const [amount, setAmount] = useState(initialAmount || 500);
  const [customAmount, setCustomAmount] = useState('');
  const [isCustom, setIsCustom] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [step, setStep] = useState('select'); // 'select' | 'processing' | 'success' | 'error'
  const [errorMessage, setErrorMessage] = useState(null);
  const [successData, setSuccessData] = useState(null);
  const [gatewayNotice, setGatewayNotice] = useState(null);

  const selectedValue = isCustom ? Number(customAmount) : amount;

  const validateAmount = (val) => {
    if (!val || isNaN(val)) return 'Please enter a valid numeric amount.';
    if (val < MIN_AMOUNT) return `Minimum top-up amount is ₹${MIN_AMOUNT}.`;
    if (val > MAX_AMOUNT) return `Maximum top-up amount is ₹${MAX_AMOUNT.toLocaleString('en-IN')}.`;
    return null;
  };

  const handleSelectPreset = (preset) => {
    setIsCustom(false);
    setAmount(preset);
    setErrorMessage(null);
  };

  const handleCustomChange = (e) => {
    const val = e.target.value.replace(/[^0-9]/g, '');
    setCustomAmount(val);
    setIsCustom(true);
    setErrorMessage(null);
  };

  const handleInitiatePayment = async () => {
    const validationError = validateAmount(selectedValue);
    if (validationError) {
      setErrorMessage(validationError);
      return;
    }

    setIsProcessing(true);
    setErrorMessage(null);
    setGatewayNotice(null);

    try {
      // 1. Create order on backend (authoritative amount & limits)
      const orderData = await paymentService.createOrder({
        amount: Number(selectedValue),
        currency: 'INR',
      });

      // 2. Load Razorpay checkout script
      const scriptLoaded = await loadRazorpayScript();

      if (!scriptLoaded || !window.Razorpay) {
        // Script could not be fetched from CDN (offline or test environment)
        setIsProcessing(false);
        setGatewayNotice(
          `Payment order #${orderData.order_id?.slice(0, 10)} created in test mode. ` +
          `Live Razorpay checkout requires internet connection to https://checkout.razorpay.com.`
        );
        return;
      }

      // 3. Launch official Razorpay checkout
      const options = {
        key: orderData.key_id,
        amount: Math.round(orderData.amount * 100),
        currency: orderData.currency || 'INR',
        name: 'VahanGrid',
        description: 'VahanPass Wallet Top-Up',
        order_id: orderData.order_id,
        handler: async function (response) {
          try {
            setStep('processing');
            // 4. Server-side verification (authoritative HMAC check)
            const verifyResult = await paymentService.verifyPayment({
              orderId: response.razorpay_order_id,
              paymentId: response.razorpay_payment_id,
              signature: response.razorpay_signature,
            });

            setSuccessData(verifyResult);
            setStep('success');
            if (onSuccess) {
              onSuccess(verifyResult);
            }
          } catch (verifyErr) {
            console.error('[TopUpModal] Verification error:', verifyErr);
            setErrorMessage(verifyErr.message || 'Payment signature verification failed.');
            setStep('error');
          } finally {
            setIsProcessing(false);
          }
        },
        modal: {
          ondismiss: function () {
            setIsProcessing(false);
            setErrorMessage('Payment cancelled by user. No funds were debited.');
          },
        },
        theme: {
          color: '#0284c7', // Sky-600
        },
      };

      const rzp = new window.Razorpay(options);
      rzp.on('payment.failed', function (resp) {
        setIsProcessing(false);
        setErrorMessage(
          resp.error?.description || 'Payment was declined by payment gateway or issuing bank.'
        );
      });
      rzp.open();
    } catch (err) {
      console.error('[TopUpModal] Top-up error:', err);
      setIsProcessing(false);
      setErrorMessage(err.message || 'Failed to initialize payment.');
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-fade-in"
      role="dialog"
      aria-modal="true"
      aria-label="Top Up Wallet"
    >
      <div className="w-full max-w-md glass border border-white/[.12] rounded-3xl overflow-hidden shadow-2xl animate-scale-up">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-white/[.08]">
          <div className="flex items-center gap-2">
            <div className="w-7 h-7 rounded-xl bg-sky-500/20 border border-sky-500/30 flex items-center justify-center text-sky-400">
              <CreditCard className="w-4 h-4" />
            </div>
            <div>
              <h2 className="text-sm font-bold text-white">VahanPass Top-Up</h2>
              <p className="text-[10px] text-slate-400">UPI • Debit/Credit Card • NetBanking</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-2 rounded-xl hover:bg-white/[.08] text-slate-400 hover:text-white transition-colors cursor-pointer"
            aria-label="Close modal"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Content */}
        <div className="p-5 space-y-4">
          {step === 'success' ? (
            <div className="text-center py-6 space-y-4">
              <div className="w-12 h-12 rounded-2xl bg-emerald-500/20 border border-emerald-500/40 text-emerald-400 flex items-center justify-center mx-auto">
                <CheckCircle2 className="w-7 h-7" />
              </div>
              <div className="space-y-1">
                <h3 className="text-base font-bold text-white">Top-Up Confirmed!</h3>
                <p className="text-xs text-slate-300">
                  {formatCurrency(selectedValue)} added to your VahanPass wallet.
                </p>
              </div>
              {successData?.balance_after != null && (
                <div className="bg-white/[.03] p-3 rounded-2xl border border-white/[.06] text-xs">
                  <span className="text-slate-400">Updated Wallet Balance:</span>
                  <div className="text-lg font-black text-emerald-400 font-display mt-0.5">
                    {formatCurrency(successData.balance_after)}
                  </div>
                </div>
              )}
              <button
                onClick={onClose}
                className="w-full py-3 rounded-xl text-xs font-bold bg-emerald-600 hover:bg-emerald-500 text-white transition-colors cursor-pointer"
              >
                Done
              </button>
            </div>
          ) : (
            <>
              {/* Presets */}
              <div className="space-y-2">
                <label className="text-[11px] font-bold uppercase tracking-wider text-slate-300">
                  Select Amount
                </label>
                <div className="grid grid-cols-4 gap-2">
                  {PRESETS.map((amt) => {
                    const isSelected = !isCustom && amount === amt;
                    return (
                      <button
                        key={amt}
                        type="button"
                        onClick={() => handleSelectPreset(amt)}
                        className={`py-2.5 rounded-xl text-xs font-bold border transition-all cursor-pointer ${
                          isSelected
                            ? 'bg-sky-500/20 border-sky-500/50 text-sky-400 shadow-md shadow-sky-500/10'
                            : 'bg-white/[.02] border-white/[.08] text-slate-300 hover:bg-white/[.05]'
                        }`}
                      >
                        ₹{amt}
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Custom Input */}
              <div className="space-y-1.5">
                <label className="text-[11px] font-bold uppercase tracking-wider text-slate-300">
                  Or Custom Amount (₹)
                </label>
                <div className="relative">
                  <span className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400 font-bold text-sm">
                    ₹
                  </span>
                  <input
                    type="text"
                    inputMode="numeric"
                    placeholder="Enter amount (₹10 - ₹50,000)"
                    value={customAmount}
                    onChange={handleCustomChange}
                    className={`w-full bg-white/[.03] border rounded-xl py-2.5 pl-8 pr-4 text-xs font-bold text-white placeholder-slate-500 focus:outline-none transition-all ${
                      isCustom && customAmount
                        ? 'border-sky-500 ring-1 ring-sky-500/30'
                        : 'border-white/[.08] focus:border-sky-500/50'
                    }`}
                  />
                </div>
                <div className="flex justify-between text-[10px] text-slate-400 px-1">
                  <span>Min: ₹10</span>
                  <span>Max: ₹50,000</span>
                </div>
              </div>

              {/* Error Alert */}
              {errorMessage && (
                <div className="bg-rose-500/10 border border-rose-500/30 p-3 rounded-xl flex items-start gap-2 text-xs text-rose-400">
                  <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
                  <span>{errorMessage}</span>
                </div>
              )}

              {/* Gateway Notice if script unavailable */}
              {gatewayNotice && (
                <div className="bg-amber-500/10 border border-amber-500/30 p-3 rounded-xl flex items-start gap-2 text-xs text-amber-400">
                  <Info className="w-4 h-4 shrink-0 mt-0.5 text-amber-400" />
                  <span>{gatewayNotice}</span>
                </div>
              )}

              {/* Security Pill */}
              <div className="flex items-center gap-2 text-[10px] text-slate-400 bg-white/[.02] p-2.5 rounded-xl border border-white/[.05]">
                <ShieldCheck className="w-4 h-4 text-emerald-400 shrink-0" />
                <span>
                  Payments encrypted with 256-bit TLS. Server-verified Razorpay integration.
                </span>
              </div>

              {/* Action Button */}
              <button
                type="button"
                onClick={handleInitiatePayment}
                disabled={isProcessing || !selectedValue}
                className="w-full py-3.5 rounded-xl text-xs md:text-sm font-bold text-white bg-gradient-to-r from-sky-500 to-emerald-500 hover:from-sky-400 hover:to-emerald-400 transition-all shadow-lg shadow-sky-500/15 flex items-center justify-center gap-2 cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {isProcessing ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    <span>Processing Payment...</span>
                  </>
                ) : (
                  <>
                    <Zap className="w-4 h-4 fill-white" />
                    <span>Add {formatCurrency(selectedValue || 0)} to VahanPass</span>
                  </>
                )}
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
