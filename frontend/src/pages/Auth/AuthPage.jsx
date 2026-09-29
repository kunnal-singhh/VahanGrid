/**
 * frontend/src/pages/Auth/AuthPage.jsx
 *
 * Authentication page for VahanGrid (Sign In & Account Registration).
 * Seamless glassmorphic design aligned with the VahanGrid design system.
 */

import { useState } from 'react';
import {
  Zap,
  Mail,
  Lock,
  User,
  Phone,
  ArrowRight,
  ShieldCheck,
  AlertCircle,
  Sparkles,
  MapPin
} from 'lucide-react';
import { useAuth } from '../../context/AuthContext';

export default function AuthPage({ onExploreGuest }) {
  const { login, register } = useAuth();

  const [mode, setMode] = useState('login'); // 'login' | 'register'
  const [formData, setFormData] = useState({
    name: '',
    email: '',
    phone: '',
    password: '',
  });
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(false);

  const handleChange = (e) => {
    setFormData((prev) => ({ ...prev, [e.target.name]: e.target.value }));
    if (error) setError(null);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError(null);

    // Client-side validations
    if (!formData.email || !formData.email.includes('@')) {
      setError('Please enter a valid email address.');
      return;
    }

    if (!formData.password || formData.password.length < 8) {
      setError('Password must be at least 8 characters long.');
      return;
    }

    if (mode === 'register' && (!formData.name || formData.name.trim().length < 2)) {
      setError('Name must be at least 2 characters.');
      return;
    }

    setLoading(true);

    try {
      if (mode === 'login') {
        await login({
          email: formData.email.trim(),
          password: formData.password,
        });
      } else {
        await register({
          name: formData.name.trim(),
          email: formData.email.trim(),
          phone: formData.phone.trim() || undefined,
          password: formData.password,
        });
      }
      // On success, AuthContext user state is set and the parent switches to protected app
    } catch (err) {
      // Map error codes to friendly messages without exposing SQL or internals
      if (err.status === 401 || err.code === 'INVALID_CREDENTIALS') {
        setError('Invalid email or password. Please verify your credentials.');
      } else if (err.status === 409 || err.code === 'USER_EXISTS' || err.code === 'DUPLICATE_EMAIL') {
        setError('An account with this email address already exists. Please sign in instead.');
      } else if (err.code === 'PHONE_EXISTS' || err.code === 'DUPLICATE_PHONE') {
        setError('An account with this mobile number already exists.');
      } else if (err.details && err.details.length > 0) {
        setError(err.details[0]);
      } else {
        setError(err.message || 'Authentication failed. Please check your connection.');
      }
    } finally {
      setLoading(false);
    }
  };

  const toggleMode = (newMode) => {
    setMode(newMode);
    setError(null);
  };

  return (
    <div className="min-h-screen w-screen bg-[#050711] text-slate-200 flex flex-col justify-between relative overflow-hidden select-none">
      {/* Background Glows */}
      <div className="absolute -top-32 -left-32 w-96 h-96 bg-sky-500/10 rounded-full blur-3xl pointer-events-none" />
      <div className="absolute top-1/2 -right-32 w-96 h-96 bg-emerald-500/10 rounded-full blur-3xl pointer-events-none" />
      <div className="absolute -bottom-32 left-1/3 w-96 h-96 bg-indigo-500/10 rounded-full blur-3xl pointer-events-none" />

      {/* Top Bar */}
      <header className="px-6 py-5 flex items-center justify-between z-10">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-xl bg-gradient-to-tr from-sky-400 via-indigo-500 to-emerald-400 p-[1.5px] shadow-lg shadow-sky-500/20">
            <div className="w-full h-full bg-[#070c1d] rounded-[10px] flex items-center justify-center">
              <Zap className="w-4 h-4 text-sky-400 fill-sky-400" />
            </div>
          </div>
          <div>
            <div className="flex items-center gap-1.5">
              <span className="text-base font-black tracking-tight bg-gradient-to-r from-sky-400 via-teal-300 to-emerald-400 bg-clip-text text-transparent">
                VahanGrid
              </span>
              <span className="text-[9px] font-bold px-1.5 py-0.2 rounded bg-sky-500/10 text-sky-400 border border-sky-500/20">
                IN
              </span>
            </div>
            <p className="text-[10px] text-slate-400 font-medium">Unified EV Charging Grid</p>
          </div>
        </div>

        {onExploreGuest && (
          <button
            onClick={onExploreGuest}
            id="btn-explore-guest"
            className="flex items-center gap-1.5 text-xs text-slate-400 hover:text-white px-3 py-1.5 rounded-xl border border-white/[.08] hover:border-white/[.15] bg-white/[.02] transition-colors"
          >
            <MapPin className="w-3.5 h-3.5 text-sky-400" />
            <span>View Public Stations</span>
          </button>
        )}
      </header>

      {/* Main Container */}
      <main className="flex-1 flex items-center justify-center p-4 z-10 my-4">
        <div className="w-full max-w-md glass rounded-3xl p-6 md:p-8 border border-white/[.08] shadow-2xl shadow-sky-950/40 relative">
          {/* Card Header */}
          <div className="text-center mb-6">
            <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-sky-500/10 border border-sky-500/20 text-sky-400 text-[11px] font-semibold mb-3">
              <Sparkles className="w-3 h-3" />
              <span>{mode === 'login' ? 'Driver Sign In' : 'New Driver Account'}</span>
            </div>
            <h1 className="text-xl md:text-2xl font-black text-white tracking-tight">
              {mode === 'login' ? 'Welcome to VahanGrid' : 'Join India’s Unified EV Grid'}
            </h1>
            <p className="text-xs text-slate-400 mt-1">
              {mode === 'login'
                ? 'Sign in to access your VahanPass wallet, live sessions, and vehicle portfolio.'
                : 'One account across Tata Power, Statiq, ChargeZone, and Jio-bp.'}
            </p>
          </div>

          {/* Mode Switcher Tabs */}
          <div className="grid grid-cols-2 p-1 rounded-2xl bg-white/[.04] border border-white/[.08] mb-6">
            <button
              type="button"
              id="tab-login"
              onClick={() => toggleMode('login')}
              className={`py-2 text-xs font-bold rounded-xl transition-all ${
                mode === 'login'
                  ? 'bg-gradient-to-r from-sky-500 to-indigo-600 text-white shadow-lg shadow-sky-500/20'
                  : 'text-slate-400 hover:text-white'
              }`}
            >
              Sign In
            </button>
            <button
              type="button"
              id="tab-register"
              onClick={() => toggleMode('register')}
              className={`py-2 text-xs font-bold rounded-xl transition-all ${
                mode === 'register'
                  ? 'bg-gradient-to-r from-sky-500 to-indigo-600 text-white shadow-lg shadow-sky-500/20'
                  : 'text-slate-400 hover:text-white'
              }`}
            >
              Create Account
            </button>
          </div>

          {/* Error Banner */}
          {error && (
            <div
              id="auth-error-banner"
              className="mb-5 p-3 rounded-2xl bg-rose-500/10 border border-rose-500/20 flex items-start gap-2.5 text-xs text-rose-300 animate-fade-in"
            >
              <AlertCircle className="w-4 h-4 text-rose-400 shrink-0 mt-0.5" />
              <span>{error}</span>
            </div>
          )}

          {/* Form */}
          <form onSubmit={handleSubmit} className="space-y-4">
            {mode === 'register' && (
              <div>
                <label className="block text-[11px] font-bold uppercase tracking-wider text-slate-400 mb-1.5">
                  Full Name
                </label>
                <div className="relative flex items-center">
                  <User className="w-4 h-4 text-slate-500 absolute left-3.5" />
                  <input
                    type="text"
                    id="auth-name"
                    name="name"
                    value={formData.name}
                    onChange={handleChange}
                    placeholder="e.g. Vikram Malhotra"
                    required
                    className="w-full bg-white/[.03] border border-white/[.08] rounded-xl pl-10 pr-4 py-2.5 text-xs text-white placeholder-slate-600 focus:outline-none focus:border-sky-500/50 focus:bg-white/[.05] transition-all"
                  />
                </div>
              </div>
            )}

            <div>
              <label className="block text-[11px] font-bold uppercase tracking-wider text-slate-400 mb-1.5">
                Email Address
              </label>
              <div className="relative flex items-center">
                <Mail className="w-4 h-4 text-slate-500 absolute left-3.5" />
                <input
                  type="email"
                  id="auth-email"
                  name="email"
                  value={formData.email}
                  onChange={handleChange}
                  placeholder="driver@vahangrid.in"
                  required
                  autoComplete="email"
                  className="w-full bg-white/[.03] border border-white/[.08] rounded-xl pl-10 pr-4 py-2.5 text-xs text-white placeholder-slate-600 focus:outline-none focus:border-sky-500/50 focus:bg-white/[.05] transition-all"
                />
              </div>
            </div>

            {mode === 'register' && (
              <div>
                <label className="block text-[11px] font-bold uppercase tracking-wider text-slate-400 mb-1.5">
                  Mobile Number <span className="text-slate-600 lowercase">(optional)</span>
                </label>
                <div className="relative flex items-center">
                  <Phone className="w-4 h-4 text-slate-500 absolute left-3.5" />
                  <input
                    type="tel"
                    id="auth-phone"
                    name="phone"
                    value={formData.phone}
                    onChange={handleChange}
                    placeholder="+91 98765 43210"
                    autoComplete="tel"
                    className="w-full bg-white/[.03] border border-white/[.08] rounded-xl pl-10 pr-4 py-2.5 text-xs text-white placeholder-slate-600 focus:outline-none focus:border-sky-500/50 focus:bg-white/[.05] transition-all"
                  />
                </div>
              </div>
            )}

            <div>
              <label className="block text-[11px] font-bold uppercase tracking-wider text-slate-400 mb-1.5">
                Password
              </label>
              <div className="relative flex items-center">
                <Lock className="w-4 h-4 text-slate-500 absolute left-3.5" />
                <input
                  type="password"
                  id="auth-password"
                  name="password"
                  value={formData.password}
                  onChange={handleChange}
                  placeholder="At least 8 characters"
                  required
                  autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
                  className="w-full bg-white/[.03] border border-white/[.08] rounded-xl pl-10 pr-4 py-2.5 text-xs text-white placeholder-slate-600 focus:outline-none focus:border-sky-500/50 focus:bg-white/[.05] transition-all"
                />
              </div>
            </div>

            <button
              type="submit"
              id="auth-submit-btn"
              disabled={loading}
              className="w-full mt-2 py-3 rounded-xl bg-gradient-to-r from-sky-400 via-teal-400 to-emerald-400 text-slate-950 font-black text-xs uppercase tracking-wider flex items-center justify-center gap-2 hover:opacity-95 shadow-xl shadow-sky-500/20 active:scale-[0.99] transition-all cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {loading ? (
                <div className="w-4 h-4 border-2 border-slate-950 border-t-transparent rounded-full animate-spin" />
              ) : (
                <>
                  <span>{mode === 'login' ? 'Sign In to VahanGrid' : 'Create Driver Account'}</span>
                  <ArrowRight className="w-4 h-4" />
                </>
              )}
            </button>
          </form>

          {/* Security badge */}
          <div className="mt-6 pt-4 border-t border-white/[.06] flex items-center justify-center gap-2 text-[10px] text-slate-500">
            <ShieldCheck className="w-3.5 h-3.5 text-emerald-400" />
            <span>Secure HTTP-Only Cookie Authentication</span>
          </div>
        </div>
      </main>

      {/* Footer */}
      <footer className="px-6 py-4 text-center text-[10px] text-slate-600 z-10">
        VahanGrid Unified EV Mobility Platform • Phase 3C.1 Authentication
      </footer>
    </div>
  );
}
