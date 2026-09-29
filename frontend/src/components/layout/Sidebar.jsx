import {
  LayoutDashboard,
  MapPin,
  Navigation,
  Zap,
  Wallet,
  Clock,
  User,
  X,
  ChevronLeft,
  ChevronRight,
  ShieldCheck,
  Leaf,
  Car,
  LogOut,
  LogIn
} from 'lucide-react';
import { useAuth } from '../../context/AuthContext';

export const NAV_ITEMS = [
  { id: 'dashboard', label: 'Dashboard', icon: LayoutDashboard },
  { id: 'stations', label: 'Live Stations', icon: MapPin },
  { id: 'route', label: 'Route Planner', icon: Navigation },
  { id: 'charging', label: 'Charging Hub', icon: Zap },
  { id: 'wallet', label: 'VahanPass Wallet', icon: Wallet },
  { id: 'history', label: 'Session History', icon: Clock },
  { id: 'profile', label: 'Driver Profile', icon: User },
];

export default function Sidebar({
  activePage,
  onNavigate,
  sidebarOpen,
  onToggleSidebar,
  mobileDrawerOpen,
  onCloseMobileDrawer,
  theme,
  selectedVehicle,
  vehicles = [],
  onSelectVehicle,
  co2SavedKg = '85.4',
  activeChargingSession,
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
    <>
      {/* Mobile Backdrop */}
      {mobileDrawerOpen && (
        <div
          className="fixed inset-0 bg-black/60 backdrop-blur-sm z-[1400] md:hidden"
          onClick={onCloseMobileDrawer}
        />
      )}

      {/* Sidebar Panel */}
      <aside
        className={`
          shrink-0 flex flex-col border-r transition-all duration-300 z-[1500]
          ${theme === 'light' ? 'bg-white/95 border-slate-200' : 'bg-[#060a16]/95 border-white/[.06]'}
          backdrop-blur-2xl
          fixed md:relative inset-y-0 left-0
          ${mobileDrawerOpen ? 'translate-x-0' : '-translate-x-full md:translate-x-0'}
          ${sidebarOpen ? 'w-60' : 'md:w-20 w-60'}
        `}
      >
        {/* Brand Header */}
        <div className="h-16 flex items-center justify-between px-4 border-b border-white/[.06] shrink-0">
          <div
            onClick={() => onNavigate('dashboard')}
            className="flex items-center gap-3 cursor-pointer group"
          >
            <div className="w-9 h-9 rounded-xl bg-gradient-to-tr from-sky-400 via-indigo-500 to-emerald-400 p-[1.5px] shadow-lg shadow-sky-500/20 group-hover:scale-105 transition-transform">
              <div className="w-full h-full bg-[#070c1d] rounded-[10px] flex items-center justify-center">
                <Zap className="w-4 h-4 text-sky-400 fill-sky-400" />
              </div>
            </div>

            {(sidebarOpen || mobileDrawerOpen) && (
              <div className="animate-fade-in min-w-0">
                <div className="flex items-center gap-1.5">
                  <h1 className="text-sm font-black tracking-tight bg-gradient-to-r from-sky-400 via-teal-300 to-emerald-400 bg-clip-text text-transparent">
                    VahanGrid
                  </h1>
                  <span className="text-[9px] font-bold px-1.5 py-0.2 rounded bg-sky-500/10 text-sky-400 border border-sky-500/20">
                    IN
                  </span>
                </div>
                <p className="text-[9px] text-slate-400 font-medium tracking-wide">
                  Unified EV Mobility
                </p>
              </div>
            )}
          </div>

          {/* Close for mobile drawer */}
          <button
            onClick={onCloseMobileDrawer}
            className="md:hidden p-1.5 text-slate-400 hover:text-white"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Navigation List */}
        <nav className="flex-1 p-3 space-y-1.5 overflow-y-auto">
          {NAV_ITEMS.map(({ id, label, icon: Icon }) => {
            const isActive = activePage === id;
            return (
              <button
                key={id}
                onClick={() => {
                  onNavigate(id);
                  if (mobileDrawerOpen) onCloseMobileDrawer();
                }}
                className={`nav-item w-full ${isActive ? 'active' : ''} ${
                  !sidebarOpen && !mobileDrawerOpen ? 'justify-center px-0' : ''
                }`}
                title={!sidebarOpen ? label : undefined}
              >
                <Icon className="w-[18px] h-[18px] shrink-0" />
                {(sidebarOpen || mobileDrawerOpen) && (
                  <span className="truncate flex-1 text-left">{label}</span>
                )}
                {id === 'charging' && activeChargingSession && (
                  <span className="w-2 h-2 rounded-full bg-sky-400 animate-blink shrink-0" />
                )}
              </button>
            );
          })}
        </nav>

        {/* Active Vehicle Quick Switcher */}
        {(sidebarOpen || mobileDrawerOpen) && (
          <div className="px-4 py-3 border-t border-white/[.06]">
            <div className="flex items-center justify-between mb-2">
              <span className="text-[10px] uppercase font-bold tracking-wider text-slate-400 flex items-center gap-1.5">
                <Car className="w-3 h-3 text-sky-400" /> My Vehicle
              </span>
              <span className="text-[9px] text-emerald-400 font-semibold">
                {selectedVehicle?.range || 437} km
              </span>
            </div>
            <select
              value={selectedVehicle?.id || 'nexon'}
              onChange={(e) => onSelectVehicle(e.target.value)}
              className={`w-full text-xs rounded-xl px-2.5 py-1.5 outline-none transition-colors cursor-pointer ${
                theme === 'light'
                  ? 'bg-slate-100 border border-slate-200 text-slate-900'
                  : 'bg-slate-900/90 border border-white/10 text-white focus:border-sky-500/40'
              }`}
            >
              {vehicles.map((v) => (
                <option key={v.id} value={v.id}>
                  {v.name} ({v.battery} kWh)
                </option>
              ))}
            </select>
          </div>
        )}

        {/* Mobility Status Widget */}
        {(sidebarOpen || mobileDrawerOpen) && (
          <div className="p-4 border-t border-white/[.06] space-y-3 text-[11px] animate-fade-in bg-white/[.01]">
            <div className="flex items-center justify-between">
              <span className="text-slate-400 flex items-center gap-1">
                <Leaf className="w-3 h-3 text-emerald-400" /> CO₂ Offset
              </span>
              <span className="text-emerald-400 font-bold">{co2SavedKg} kg</span>
            </div>

            <div className="flex items-center justify-between">
              <span className="text-slate-400 flex items-center gap-1">
                <ShieldCheck className="w-3 h-3 text-sky-400" /> Interoperability
              </span>
              <span className="text-sky-400 font-semibold">OCPI 2.2.1 Ready</span>
            </div>
          </div>
        )}

        {/* User Account / Sign Out Section */}
        {isAuthenticated ? (
          <div className="p-3 border-t border-white/[.06]">
            {sidebarOpen || mobileDrawerOpen ? (
              <div className="flex items-center justify-between gap-2 p-1.5 rounded-xl bg-white/[.02]">
                <div
                  onClick={() => onNavigate('profile')}
                  className="flex items-center gap-2.5 min-w-0 cursor-pointer hover:opacity-80 transition-opacity"
                >
                  <div className="w-7 h-7 rounded-lg bg-gradient-to-tr from-sky-400 to-emerald-400 flex items-center justify-center text-[11px] font-black text-white shrink-0 shadow-sm shadow-sky-500/20">
                    {initials}
                  </div>
                  <div className="min-w-0">
                    <p className="text-xs font-bold text-white truncate">{user?.name || 'Driver'}</p>
                    <p className="text-[10px] text-slate-500 truncate">{user?.email}</p>
                  </div>
                </div>
                <button
                  onClick={logout}
                  id="sidebar-logout-btn"
                  title="Sign Out"
                  className="p-1.5 rounded-lg text-slate-400 hover:text-rose-400 hover:bg-rose-500/10 transition-colors shrink-0 cursor-pointer"
                >
                  <LogOut className="w-4 h-4" />
                </button>
              </div>
            ) : (
              <button
                onClick={logout}
                title={`Sign Out (${user?.name})`}
                className="w-full flex items-center justify-center py-2 text-slate-400 hover:text-rose-400 hover:bg-rose-500/10 rounded-xl transition-colors cursor-pointer"
              >
                <LogOut className="w-4 h-4" />
              </button>
            )}
          </div>
        ) : (
          <div className="p-3 border-t border-white/[.06]">
            <button
              onClick={() => onNavigate('auth')}
              id="sidebar-signin-btn"
              className="w-full flex items-center justify-center gap-2 py-2 rounded-xl bg-sky-500/10 hover:bg-sky-500/20 border border-sky-500/20 text-sky-400 text-xs font-bold transition-all cursor-pointer"
            >
              <LogIn className="w-4 h-4" />
              {(sidebarOpen || mobileDrawerOpen) && <span>Sign In</span>}
            </button>
          </div>
        )}

        {/* Desktop Collapse Button */}
        <button
          onClick={onToggleSidebar}
          className="hidden md:flex h-11 items-center justify-center border-t border-white/[.06] text-slate-400 hover:text-white transition-colors cursor-pointer"
          title={sidebarOpen ? 'Collapse sidebar' : 'Expand sidebar'}
        >
          {sidebarOpen ? <ChevronLeft className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
        </button>
      </aside>
    </>
  );
}
