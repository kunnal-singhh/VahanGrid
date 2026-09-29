import { User, Car, ShieldCheck, Sparkles, CheckCircle2, LogOut } from 'lucide-react';
import { VEHICLES } from '../../data/mockData';
import { useAuth } from '../../context/AuthContext';

export default function ProfilePage({
  selectedVehicle,
  onSelectVehicle,
}) {
  const { user, logout } = useAuth();

  const initials = user?.name
    ? user.name
        .split(' ')
        .filter(Boolean)
        .map((n) => n[0])
        .join('')
        .slice(0, 2)
        .toUpperCase()
    : 'VG';

  const memberSince = user?.created_at
    ? new Date(user.created_at).toLocaleDateString('en-IN', {
        month: 'short',
        year: 'numeric',
      })
    : '2026';

  return (
    <div className="p-4 md:p-6 max-w-4xl mx-auto space-y-6 animate-fade-in pb-20 md:pb-8">
      {/* Title */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <span className="text-[10px] font-bold text-sky-400 uppercase tracking-widest bg-sky-500/10 px-2 py-0.5 rounded-full border border-sky-500/20">
              Driver & Fleet Settings
            </span>
          </div>
          <h1 className="text-xl md:text-2xl font-black text-white">
            Driver Profile & Vehicle Portfolio
          </h1>
          <p className="text-xs text-slate-300 mt-0.5">
            Manage your electric vehicles, VahanPass roaming credentials, and account settings.
          </p>
        </div>

        {/* Logout Button */}
        <button
          onClick={logout}
          id="btn-logout-profile"
          className="self-start sm:self-auto flex items-center gap-2 px-3.5 py-2 rounded-xl bg-rose-500/10 hover:bg-rose-500/20 border border-rose-500/20 text-rose-300 text-xs font-bold transition-all cursor-pointer shadow-lg shadow-rose-950/20"
        >
          <LogOut className="w-3.5 h-3.5 text-rose-400" />
          <span>Sign Out</span>
        </button>
      </div>

      {/* Driver Card */}
      <div className="glass rounded-3xl p-6 border border-white/[.08] flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div className="flex items-center gap-4">
          <div className="w-14 h-14 rounded-2xl bg-gradient-to-tr from-sky-400 via-indigo-500 to-emerald-400 flex items-center justify-center text-xl font-black text-white shadow-xl shadow-sky-500/20 shrink-0">
            {initials}
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h2 className="text-base font-extrabold text-white" id="profile-user-name">
                {user?.name || 'VahanGrid EV Pilot'}
              </h2>
              <span className="text-[9px] font-bold px-2 py-0.5 rounded-full bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                VERIFIED DRIVER
              </span>
            </div>
            <p className="text-xs text-slate-400 mt-0.5" id="profile-user-contact">
              {user?.email || 'driver.pilot@vahangrid.in'} {user?.phone ? `• ${user.phone}` : ''}
            </p>
            <p className="text-[10px] text-slate-500 mt-0.5 font-mono">
              Driver ID: {user?.id || 'VG-LOCAL-PILOT'} • Member since {memberSince}
            </p>
          </div>
        </div>

        <div className="text-left sm:text-right">
          <div className="text-[10px] text-slate-400 uppercase font-semibold">Roaming Clearance</div>
          <div className="text-xs font-bold text-sky-400 flex items-center gap-1 mt-0.5">
            <ShieldCheck className="w-4 h-4 text-emerald-400" />
            <span>All Indian CPO Networks</span>
          </div>
        </div>
      </div>

      {/* Registered Electric Vehicles */}
      <div className="glass rounded-3xl p-6 border border-white/[.08] space-y-4">
        <div className="flex justify-between items-center">
          <h3 className="text-xs font-bold text-white uppercase tracking-wider flex items-center gap-2">
            <Car className="w-4 h-4 text-sky-400" /> Registered Electric Vehicles
          </h3>
          <span className="text-[10px] text-slate-400">Tap to set active vehicle</span>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {VEHICLES.map((vehicle) => {
            const isSelected = selectedVehicle?.id === vehicle.id;
            return (
              <div
                key={vehicle.id}
                onClick={() => onSelectVehicle(vehicle.id)}
                className={`cursor-pointer rounded-2xl p-4 border transition-all ${
                  isSelected
                    ? 'glass-highlight border-sky-500/50 shadow-lg shadow-sky-500/15'
                    : 'bg-white/[.02] border-white/[.05] hover:border-white/[.12]'
                }`}
              >
                <div className="flex justify-between items-start mb-2">
                  <h4 className="text-xs font-bold text-white truncate">{vehicle.name}</h4>
                  {isSelected && (
                    <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
                  )}
                </div>

                <div className="space-y-1 text-[11px] text-slate-400">
                  <div className="flex justify-between">
                    <span>Rated Range:</span>
                    <span className="font-bold text-sky-400">{vehicle.range} km</span>
                  </div>
                  <div className="flex justify-between">
                    <span>Battery Capacity:</span>
                    <span className="font-medium text-slate-200">{vehicle.battery} kWh</span>
                  </div>
                  <div className="flex justify-between">
                    <span>Connector:</span>
                    <span className="font-medium text-slate-200">{vehicle.connector}</span>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Architectural Principles Box */}
      <div className="glass rounded-3xl p-6 border border-white/[.08] space-y-3">
        <h3 className="text-xs font-bold text-white uppercase tracking-wider flex items-center gap-2">
          <Sparkles className="w-4 h-4 text-amber-400" /> VahanGrid Unified Architecture
        </h3>
        <p className="text-xs text-slate-300 leading-relaxed">
          Your profile is securely authenticated with PostgreSQL session management.
          Live stations and geospatial route discovery are served directly from the PostGIS REST API layer.
        </p>
      </div>
    </div>
  );
}
