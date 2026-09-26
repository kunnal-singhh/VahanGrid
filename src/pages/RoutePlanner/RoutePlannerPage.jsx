import { useState } from 'react';
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
  const [routeStops, setRouteStops] = useState([]);

  // Calculate high-level summary metrics
  const totalStops = routeStops.length;
  const totalEnergyKwh = routeStops.reduce((sum, s) => sum + (s.energyNeededKwh || 0), 0);
  const totalCost = routeStops.reduce((sum, s) => sum + (s.estimatedCost || 0), 0);

  return (
    <div className="flex-1 flex flex-col md:flex-row h-full overflow-hidden">
      {/* Left Panel: Route Inputs & Stop Recommendations */}
      <div className="w-full md:w-[420px] lg:w-[460px] shrink-0 border-b md:border-b-0 md:border-r border-white/[.06] p-4 md:p-5 overflow-y-auto max-h-[50vh] md:max-h-none space-y-4">
        {routeActive && (
          <RouteSummaryCard
            distanceKm={485}
            durationMins={380}
            stopsCount={totalStops || 2}
            totalEnergyKwh={totalEnergyKwh || 48.5}
            estimatedCost={totalCost || 920}
            fromLabel="Lucknow"
            toLabel="New Delhi"
          />
        )}

        <RoutePlanner
          stations={stations}
          routeActive={routeActive}
          onPlanRoute={onPlanRoute}
          onClearRoute={onClearRoute}
          onStartCharge={onStartCharge}
          onSelectStation={onSelectStation}
          userSoc={userSoc}
          onSocChange={onSocChange}
          selectedVehicle={selectedVehicle}
          onStopsComputed={setRouteStops}
        />
      </div>

      {/* Right Panel: Map with Polyline and Highway Stops */}
      <div className="flex-1 min-h-[300px] relative">
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
      </div>
    </div>
  );
}
