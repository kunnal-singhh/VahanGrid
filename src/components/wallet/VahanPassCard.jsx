import { Zap, ShieldCheck, CreditCard, QrCode } from 'lucide-react';
import { formatCompactCurrency } from '../../utils/formatters';

export default function VahanPassCard({ balance = 1450 }) {
  return (
    <div
      className="relative rounded-3xl overflow-hidden p-6 md:p-7 min-h-[200px] md:min-h-[220px] flex flex-col justify-between shadow-2xl border border-sky-500/25 transition-transform hover:scale-[1.01]"
      style={{
        background: 'linear-gradient(135deg, #071026 0%, #0a1432 45%, #0d1b42 100%)',
      }}
    >
      {/* Decorative Energy Orbs */}
      <div className="absolute top-[-50px] right-[-50px] w-48 h-48 rounded-full bg-sky-500/10 blur-3xl pointer-events-none" />
      <div className="absolute bottom-[-40px] left-[-40px] w-40 h-40 rounded-full bg-emerald-500/10 blur-3xl pointer-events-none" />
      <div className="absolute inset-0 bg-white/[.02] pointer-events-none" />

      {/* Card Header: Brand & Security Chip */}
      <div className="relative z-10 flex justify-between items-start">
        <div>
          <div className="flex items-center gap-2">
            <div className="w-6 h-6 rounded-lg bg-sky-500/20 border border-sky-500/40 flex items-center justify-center">
              <Zap className="w-3.5 h-3.5 text-sky-400 fill-sky-400" />
            </div>
            <span className="text-sm font-black tracking-wider uppercase bg-gradient-to-r from-sky-400 to-emerald-400 bg-clip-text text-transparent">
              VahanPass
            </span>
            <span className="text-[9px] font-bold px-1.5 py-0.5 rounded bg-sky-400/10 text-sky-400 border border-sky-400/20">
              UNIVERSAL
            </span>
          </div>
          <div className="text-[10px] text-slate-400 font-mono mt-1">
            VG-PASS-9942-IN-ROAMING
          </div>
        </div>

        <div className="flex items-center gap-2">
          <QrCode className="w-5 h-5 text-sky-400/70" />
          <ShieldCheck className="w-5 h-5 text-emerald-400/70" />
        </div>
      </div>

      {/* Center: Unified Balance */}
      <div className="relative z-10 my-2">
        <div className="text-[10px] uppercase tracking-widest text-slate-400 font-bold">
          Unified Roaming Balance
        </div>
        <div className="text-3xl md:text-4xl font-black font-display text-white mt-0.5 tracking-tight flex items-baseline gap-1">
          <span>{formatCompactCurrency(balance)}</span>
          <span className="text-xs font-semibold text-emerald-400 font-sans">INR</span>
        </div>
      </div>

      {/* Card Footer: Interoperability Info */}
      <div className="relative z-10 flex flex-col sm:flex-row justify-between items-start sm:items-end gap-2 pt-2 border-t border-white/[.06]">
        <div className="text-[10px] text-slate-300">
          Valid across <span className="text-sky-300 font-bold">Tata, Statiq, ChargeZone, Jio-bp</span>
        </div>
        <div className="flex items-center gap-1.5 text-[9px] font-semibold bg-white/[.05] border border-white/[.1] px-2.5 py-1 rounded-full text-slate-300">
          <CreditCard className="w-3 h-3 text-sky-400" /> UPI 2.0 • RuPay • RFID Tap
        </div>
      </div>
    </div>
  );
}
