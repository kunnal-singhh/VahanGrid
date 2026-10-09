import { useState } from 'react';
import { Navigation, Map, ListFilter } from 'lucide-react';
import RoutePlanner from '../../components/route/RoutePlanner';
import RouteSummaryCard from '../../components/route/RouteSummaryCard';
import LiveMap from '../../components/map/LiveMap';
import MapLegend from '../../components/map/MapLegend';

export default function RoutePlannerPage({
  stations = [],
  routeActive,
  onPlanRoute,
  onClearRoute,
  onStartCharge,
  onSelectStation,
  selectedStation,
  userSoc,
  onSocChange,
  selectedVehicle,
  theme,
  plannedRoutePath = [],
}) {
  const [viewMode, setViewMode] = useState('planner'); // 'planner' | 'map' on mobile
  const [routeStops, setRouteStops] = useState([]);
  const [routeInfo, setRouteInfo] = useState({
    fromLabel: 'Lucknow',
    toLabel: 'New Delhi',
    distanceKm: 485,
    durationMins: 380,
  });

  // Calculate high-level summary metrics
  const totalStops = routeStops.length;
  const totalEnergyKwh = routeStops.reduce((sum, s) => sum + (s.energyNeededKwh || 0), 0);
  const totalCost = routeStops.reduce((sum, s) => sum + (s.estimatedCost || 0), 0);

  const handlePlanRouteInternal = (path) => {
    if (onPlanRoute) onPlanRoute(path);
  };

  return (
    <div className="flex-1 flex flex-col h-full overflow-hidden">
      {/* Mobile / Tablet Tab Mode Switcher */}
      <div className="flex md:hidden p-2.5 border-b border-white/[.06] bg-slate-900/40 dark:bg-[#060a16]/40 backdrop-blur-md justify-center shrink-0">
        <div className="flex bg-white/[.04] border border-white/[.08] rounded-xl p-1 gap-1 w-full max-w-xs">
          <button
            onClick={() => setViewMode('planner')}
            className={`flex-1 py-1.5 rounded-lg text-xs font-semibold flex items-center justify-center gap-1.5 transition-colors cursor-pointer ${
              viewMode === 'planner'
                ? 'bg-sky-500 text-white shadow-sm'
                : 'text-slate-400 hover:text-slate-900 dark:hover:text-white'
            }`}
          >
            <Navigation className="w-3.5 h-3.5" />
            <span>Route Setup</span>
          </button>
          <button
            onClick={() => setViewMode('map')}
            className={`flex-1 py-1.5 rounded-lg text-xs font-semibold flex items-center justify-center gap-1.5 transition-colors cursor-pointer ${
              viewMode === 'map'
                ? 'bg-sky-500 text-white shadow-sm'
                : 'text-slate-400 hover:text-slate-900 dark:hover:text-white'
            }`}
          >
            <Map className="w-3.5 h-3.5" />
            <span>Live Map</span>
          </button>
        </div>
      </div>

      <div className="flex-1 flex flex-col md:flex-row h-full overflow-hidden">
        {/* Left Panel: Route Inputs & Stop Recommendations */}
        <div
          className={`
            w-full md:w-[420px] lg:w-[460px] shrink-0 border-b md:border-b-0 md:border-r border-white/[.06] p-4 md:p-5 overflow-y-auto space-y-4 pb-24 md:pb-6
            ${viewMode === 'map' ? 'hidden md:block' : 'block'}
          `}
        >
          {routeActive && (
            <RouteSummaryCard
              distanceKm={routeInfo.distanceKm || 485}
              durationMins={routeInfo.durationMins || 380}
              stopsCount={totalStops || 2}
              totalEnergyKwh={totalEnergyKwh || 48.5}
              estimatedCost={totalCost || 920}
              fromLabel={routeInfo.fromLabel || 'Lucknow'}
              toLabel={routeInfo.toLabel || 'New Delhi'}
            />
          )}

          {routeActive && (
            <button
              onClick={() => setViewMode('map')}
              className="md:hidden w-full py-2.5 px-4 rounded-xl bg-sky-500/15 hover:bg-sky-500/25 border border-sky-500/30 text-sky-400 text-xs font-bold flex items-center justify-center gap-2 transition-colors cursor-pointer"
            >
              <Map className="w-4 h-4" />
              <span>View Route & Chargers on Live Map</span>
            </button>
          )}

          <RoutePlanner
            stations={stations}
            routeActive={routeActive}
            onPlanRoute={handlePlanRouteInternal}
            onClearRoute={onClearRoute}
            onStartCharge={onStartCharge}
            onSelectStation={onSelectStation}
            userSoc={userSoc}
            onSocChange={onSocChange}
            selectedVehicle={selectedVehicle}
            onStopsComputed={setRouteStops}
            onRouteCalculated={setRouteInfo}
          />
        </div>

        {/* Right Panel: Map with Polyline and Highway Stops */}
        <div
          className={`
            flex-1 h-full min-h-[300px] relative pb-16 md:pb-0
            ${viewMode === 'planner' ? 'hidden md:block' : 'block'}
          `}
        >
          <LiveMap
            mapId="route-planner-map"
            stations={routeActive && routeStops.length > 0 ? routeStops : stations}
            selectedStation={selectedStation}
            onSelectStation={onSelectStation}
            routeActive={routeActive}
            theme={theme}
            routePath={plannedRoutePath}
          />

          <div className="absolute top-4 right-4 z-[1100]">
            <MapLegend />
          </div>

          {/* Quick Floating Pill on Mobile to switch back to stops */}
          {routeActive && (
            <button
              onClick={() => setViewMode('planner')}
              className="md:hidden absolute bottom-20 left-1/2 -translate-x-1/2 z-[1100] px-4 py-2 rounded-full glass border border-sky-500/40 text-sky-400 text-xs font-bold shadow-xl flex items-center gap-2 cursor-pointer"
            >
              <Navigation className="w-3.5 h-3.5 text-sky-400" />
              <span>View Route Summary & Stops</span>
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
