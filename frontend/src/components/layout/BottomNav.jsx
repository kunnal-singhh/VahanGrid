import { LayoutDashboard, MapPin, Navigation, Zap, Wallet } from 'lucide-react';

const MOBILE_TABS = [
  { id: 'dashboard', label: 'Home', icon: LayoutDashboard },
  { id: 'stations', label: 'Stations', icon: MapPin },
  { id: 'route', label: 'Route', icon: Navigation },
  { id: 'charging', label: 'Charging', icon: Zap },
  { id: 'wallet', label: 'VahanPass', icon: Wallet },
];

export default function BottomNav({ activePage, onNavigate, theme, activeChargingSession }) {
  return (
    <nav
      className={`md:hidden fixed bottom-0 left-0 right-0 z-[1200] border-t flex ${
        theme === 'light'
          ? 'bg-white/95 border-slate-200 text-slate-700'
          : 'bg-[#060a16]/95 border-white/[.08] text-slate-300'
      } backdrop-blur-2xl safe-area-pb`}
    >
      {MOBILE_TABS.map(({ id, label, icon: Icon }) => {
        const isActive = activePage === id;
        return (
          <button
            key={id}
            onClick={() => onNavigate(id)}
            className={`flex-1 flex flex-col items-center justify-center py-2.5 gap-1 transition-all relative ${
              theme === 'light'
                ? isActive
                  ? 'text-sky-600 font-bold'
                  : 'text-slate-500 hover:text-slate-900'
                : isActive
                ? 'text-sky-400 font-semibold'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            <Icon className="w-5 h-5" />
            <span className="text-[10px]">{label}</span>

            {/* Active underline indicator */}
            {isActive && (
              <span className="absolute top-0 left-1/2 -translate-x-1/2 w-8 h-0.5 bg-gradient-to-r from-sky-400 to-emerald-400 rounded-full" />
            )}

            {/* Charging pulse dot */}
            {id === 'charging' && activeChargingSession && activeChargingSession.status !== 'stopped' && activeChargingSession.status !== 'completed' && (
              <span className="absolute top-2 right-1/3 w-2 h-2 rounded-full bg-sky-400 animate-blink" />
            )}
          </button>
        );
      })}
    </nav>
  );
}
