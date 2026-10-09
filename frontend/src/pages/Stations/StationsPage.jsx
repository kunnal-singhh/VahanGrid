import { useState } from 'react';
import { MapPin, List, Map, SlidersHorizontal, Zap } from 'lucide-react';
import LiveMap from '../../components/map/LiveMap';
import MapLegend from '../../components/map/MapLegend';
import StationCard from '../../components/stations/StationCard';
import StationFilterBar from '../../components/stations/StationFilterBar';

export default function StationsPage({
  stations = [],
  selectedStation,
  onSelectStation,
  theme,
  filterOperator,
  onOperatorChange,
  filterStatus,
  onStatusChange,
  searchQuery,
  onSearchChange,
}) {
  const [viewMode, setViewMode] = useState('list'); // 'list' | 'map' on mobile; both visible on desktop

  // Filter stations based on state
  const filteredStations = stations.filter((st) => {
    if (filterOperator !== 'all' && st.operator !== filterOperator) return false;
    if (filterStatus !== 'all' && st.status !== filterStatus) return false;
    if (searchQuery && searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      const matchName = st.name.toLowerCase().includes(q);
      const matchId = st.id.toLowerCase().includes(q);
      const matchAddr = st.address && st.address.toLowerCase().includes(q);
      if (!matchName && !matchId && !matchAddr) return false;
    }
    return true;
  });

  return (
    <div className="flex-1 flex flex-col h-full overflow-hidden">
      {/* Top Filter Bar */}
      <div className="p-3 md:p-4 border-b border-white/[.06] panel-surface backdrop-blur-md">
        <div className="max-w-7xl mx-auto flex flex-col md:flex-row items-stretch md:items-center justify-between gap-3">
          <div className="flex-1">
            <StationFilterBar
              filterOperator={filterOperator}
              onOperatorChange={onOperatorChange}
              filterStatus={filterStatus}
              onStatusChange={onStatusChange}
              searchQuery={searchQuery}
              onSearchChange={onSearchChange}
            />
          </div>

          {/* View Mode Toggle (Mobile / Tablet only) */}
          <div className="flex lg:hidden bg-white/[.04] border border-white/[.08] rounded-xl p-1 gap-1 self-center sm:self-end">
            <button
              onClick={() => setViewMode('list')}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold flex items-center gap-1.5 transition-colors cursor-pointer ${
                viewMode === 'list' ? 'bg-sky-500 text-white shadow-sm' : 'text-slate-400 hover:text-slate-900 dark:hover:text-white'
              }`}
              title="List View"
            >
              <List className="w-3.5 h-3.5" />
              <span>List View</span>
            </button>
            <button
              onClick={() => setViewMode('map')}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold flex items-center gap-1.5 transition-colors cursor-pointer ${
                viewMode === 'map' ? 'bg-sky-500 text-white shadow-sm' : 'text-slate-400 hover:text-slate-900 dark:hover:text-white'
              }`}
              title="Map View"
            >
              <Map className="w-3.5 h-3.5" />
              <span>Live Map</span>
            </button>
          </div>
        </div>
      </div>

      {/* Main Content Area */}
      <div className="flex-1 flex overflow-hidden relative">
        {/* Left Side: Station List */}
        <div
          className={`
            w-full lg:w-[480px] xl:w-[520px] shrink-0 border-r border-white/[.06] flex flex-col overflow-hidden
            ${viewMode === 'map' ? 'hidden lg:flex' : 'flex'}
          `}
        >
          <div className="p-3 md:p-4 border-b border-white/[.06] flex justify-between items-center text-xs">
            <span className="text-slate-400 font-medium">
              Showing <strong className={theme === 'light' ? 'text-slate-900' : 'text-white'}>{filteredStations.length}</strong> Stations
            </span>
            <span className="text-[10px] text-emerald-500 font-semibold bg-emerald-500/10 border border-emerald-500/20 px-2 py-0.5 rounded-full chip-available">
              Live Network
            </span>
          </div>

          <div className="flex-1 overflow-y-auto p-3 md:p-4 space-y-3 pb-20 md:pb-6">
            {filteredStations.length === 0 ? (
              <div className="glass rounded-2xl p-8 text-center text-xs text-slate-400 mt-6">
                No charging hubs matched your filter parameters. Try clearing the filters.
              </div>
            ) : (
              filteredStations.map((station) => (
                <StationCard
                  key={station.id}
                  station={station}
                  onSelect={onSelectStation}
                  isSelected={selectedStation?.id === station.id}
                />
              ))
            )}
          </div>
        </div>

        {/* Right Side: Interactive Leaflet Map */}
        <div
          className={`
            flex-1 h-full relative
            ${viewMode === 'list' ? 'hidden lg:block' : 'block'}
          `}
        >
          <LiveMap
            mapId="stations-directory-map"
            stations={filteredStations}
            selectedStation={selectedStation}
            onSelectStation={onSelectStation}
            theme={theme}
          />

          <div className="absolute top-4 right-4 z-[1100]">
            <MapLegend />
          </div>
        </div>
      </div>
    </div>
  );
}
