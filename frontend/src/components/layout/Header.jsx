import { Menu, Sun, Moon, Search, X, LogOut } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';

export default function Header({
  activePage,
  pageTitle,
  pageIcon: PageIcon,
  theme,
  onToggleTheme,
  isNetworkOnline,
  onToggleNetwork,
  activeChargingSession,
  onOpenChargingSession,
  onOpenMobileMenu,
  searchQuery,
  onSearchChange,
  showSearch = false,
  onNavigate,
}) {
  const { user, isAuthenticated, logout } = useAuth();

  const initials = user?.name
    ? user.name
        .split(' ')
        .filter(Boolean)
        .map((n) => n[0])
        .join('')
        .slice(0, 2)
        .toUpperCase()
    : 'VG';

  return (
    <header
      className={`h-16 shrink-0 flex items-center justify-between px-4 md:px-6 border-b transition-colors duration-200 z-40 ${
        theme === 'light'
          ? 'bg-white/80 border-slate-200/80 backdrop-blur-xl'
          : 'bg-[#060a16]/80 border-white/[.06] backdrop-blur-xl'
      }`}
    >
      {/* Left: Mobile Toggle & Page Title */}
      <div className="flex items-center gap-3 min-w-0">
        <button
          onClick={onOpenMobileMenu}
          aria-label="Open Navigation Menu"
          className="md:hidden p-2 rounded-xl text-slate-400 hover:text-white hover:bg-white/[.06] transition-colors"
        >
          <Menu className="w-5 h-5" />
        </button>

        <div className="flex items-center gap-2.5 min-w-0">
          {PageIcon && (
            <div className="w-8 h-8 rounded-lg bg-sky-500/10 border border-sky-500/20 flex items-center justify-center text-sky-400 shrink-0">
              <PageIcon className="w-4 h-4" />
            </div>
          )}
          <div className="min-w-0">
            <h1 className="text-sm md:text-base font-bold text-white truncate">
              {pageTitle}
            </h1>
            <p className="text-[10px] text-slate-400 hidden sm:block">
              One Platform. Multiple Charging Networks.
            </p>
          </div>
        </div>

        {/* Active Charging Session Floating Pill */}
        {activeChargingSession && (
          <button
            onClick={onOpenChargingSession}
            className="ml-2 flex items-center gap-1.5 bg-gradient-to-r from-sky-500/15 to-emerald-500/15 border border-sky-500/30 text-sky-300 px-3 py-1 rounded-full text-[11px] font-semibold hover:border-sky-500/50 transition-all cursor-pointer animate-pulse"
          >
            <span className="w-2 h-2 rounded-full bg-emerald-400 animate-blink" />
            <span className="hidden sm:inline">Charging:</span>
            <span>Active</span>
          </button>
        )}
      </div>

      {/* Right: Search, Network Status, Theme, Profile */}
      <div className="flex items-center gap-2.5">
        {/* Optional Search Bar */}
        {showSearch && (
          <div className="hidden sm:flex items-center bg-white/[.04] border border-white/[.08] rounded-xl px-3 py-1.5 focus-within:border-sky-500/40 transition-all">
            <Search className="w-3.5 h-3.5 text-slate-400 mr-2" />
            <input
              type="text"
              placeholder="Search stations, cities..."
              value={searchQuery}
              onChange={(e) => onSearchChange(e.target.value)}
              className="bg-transparent text-xs text-white placeholder-slate-500 outline-none w-36 md:w-48"
            />
            {searchQuery && (
              <button onClick={() => onSearchChange('')} className="text-slate-400 hover:text-white">
                <X className="w-3 h-3" />
              </button>
            )}
          </div>
        )}

        {/* Network Online / Offline Simulation Toggle */}
        <button
          onClick={onToggleNetwork}
          title={isNetworkOnline ? 'Connected to VahanGrid Network' : 'Operating in Resilient Edge Mode'}
          className={`flex items-center gap-1.5 text-[11px] font-semibold px-2.5 md:px-3 py-1.5 rounded-xl border transition-all ${
            isNetworkOnline
              ? 'bg-emerald-500/10 border-emerald-500/25 text-emerald-400'
              : 'bg-amber-500/10 border-amber-500/25 text-amber-400'
          }`}
        >
          <span
            className={`w-1.5 h-1.5 rounded-full ${
              isNetworkOnline ? 'bg-emerald-400 animate-blink' : 'bg-amber-400'
            }`}
          />
          <span className="hidden md:inline">{isNetworkOnline ? 'Network Live' : 'Edge Mode'}</span>
        </button>

        {/* Theme Toggle */}
        <button
          onClick={onToggleTheme}
          aria-label="Toggle Theme"
          className="p-2 rounded-xl bg-white/[.04] border border-white/[.08] text-slate-400 hover:text-white hover:bg-white/[.08] transition-colors cursor-pointer"
        >
          {theme === 'dark' ? <Sun className="w-4 h-4 text-amber-400" /> : <Moon className="w-4 h-4 text-sky-400" />}
        </button>

        {/* Driver Profile Badge */}
        {isAuthenticated ? (
          <div className="flex items-center gap-1.5 pl-1" id="header-user-badge">
            <button
              onClick={() => onNavigate && onNavigate('profile')}
              title={`Logged in as ${user?.name || user?.email}`}
              className="flex items-center gap-2 p-1 rounded-xl hover:bg-white/[.04] transition-colors text-left cursor-pointer"
            >
              <div className="w-8 h-8 rounded-xl bg-gradient-to-br from-sky-500 via-indigo-500 to-emerald-500 flex items-center justify-center text-xs font-black text-white shadow-md shadow-sky-500/20">
                {initials}
              </div>
              <div className="hidden xl:block">
                <p className="text-xs font-bold text-white truncate max-w-[120px]">{user?.name || 'Driver'}</p>
                <p className="text-[9px] text-emerald-400 font-semibold leading-tight">Active</p>
              </div>
            </button>
            <button
              onClick={logout}
              id="header-logout-btn"
              title="Sign Out"
              className="p-2 rounded-xl text-slate-400 hover:text-rose-400 hover:bg-rose-500/10 transition-colors cursor-pointer"
            >
              <LogOut className="w-4 h-4" />
            </button>
          </div>
        ) : (
          <button
            onClick={() => onNavigate && onNavigate('auth')}
            id="header-signin-btn"
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-gradient-to-r from-sky-400 to-emerald-400 text-slate-950 text-xs font-bold shadow-md shadow-sky-500/20 hover:opacity-95 transition-all cursor-pointer"
          >
            <span>Sign In</span>
          </button>
        )}
      </div>
    </header>
  );
}
