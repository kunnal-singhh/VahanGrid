/**
 * frontend/src/components/charging/PowerCurveChart.jsx
 *
 * Responsive SVG Charging Telemetry Curve Visualization (Phase 3F).
 *
 * Renders:
 *  - Power delivery speed (kW) time-series curve.
 *  - Battery State of Charge (SoC %) line.
 *  - Formatted time labels along X-axis.
 *  - Dual Y-axes (Left: Power kW, Right: SoC 0-100%).
 *  - Elegant empty state when waiting for initial samples.
 */

import { useState, useMemo } from 'react';
import { Activity, Zap } from 'lucide-react';

export default function PowerCurveChart({ telemetry = [], ratedPowerKw = 60 }) {
  const [hoveredIndex, setHoveredIndex] = useState(null);

  // Filter valid data points and sort chronologically
  const points = useMemo(() => {
    if (!Array.isArray(telemetry)) return [];
    return telemetry
      .filter((p) => p && p.recorded_at)
      .sort((a, b) => new Date(a.recorded_at).getTime() - new Date(b.recorded_at).getTime());
  }, [telemetry]);

  // Chart dimensions
  const width = 500;
  const height = 150;
  const padLeft = 40;
  const padRight = 40;
  const padTop = 20;
  const padBottom = 25;

  const chartW = width - padLeft - padRight;
  const chartH = height - padTop - padBottom;

  // Derive scales
  const maxPower = useMemo(() => {
    if (points.length === 0) return ratedPowerKw || 60;
    const peakRecorded = Math.max(...points.map((p) => Number(p.power_kw || 0)));
    return Math.max(ratedPowerKw || 50, Math.ceil(peakRecorded * 1.15));
  }, [points, ratedPowerKw]);

  // If no points, render clean waiting state
  if (points.length === 0) {
    return (
      <div className="w-full bg-white/[.02] border border-white/[.06] rounded-2xl p-4 flex flex-col items-center justify-center text-center h-[160px] relative overflow-hidden">
        <div className="w-8 h-8 rounded-full bg-sky-500/10 border border-sky-500/20 flex items-center justify-center text-sky-400 mb-2">
          <Activity className="w-4 h-4 animate-pulse" />
        </div>
        <div className="text-xs font-semibold text-slate-300">Live Power Curve</div>
        <p className="text-[11px] text-slate-500 max-w-xs mt-0.5">
          Awaiting meter telemetry samples. Instantaneous kW speed and SoC will plot here.
        </p>
      </div>
    );
  }

  // Generate SVG coordinates
  const coords = points.map((p, idx) => {
    const x =
      points.length === 1
        ? padLeft + chartW / 2
        : padLeft + (idx / (points.length - 1)) * chartW;

    const power = typeof p.power_kw === 'number' ? Math.max(0, p.power_kw) : 0;
    const powerY = padTop + chartH - (power / maxPower) * chartH;

    const soc = typeof p.soc_percent === 'number' ? Math.min(100, Math.max(0, p.soc_percent)) : null;
    const socY = soc !== null ? padTop + chartH - (soc / 100) * chartH : null;

    const time = new Date(p.recorded_at).toLocaleTimeString([], {
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    });

    return { x, powerY, socY, power, soc, time, raw: p };
  });

  // Path data strings
  const powerPathD = coords.reduce((acc, c, idx) => {
    return `${acc} ${idx === 0 ? 'M' : 'L'} ${c.x.toFixed(1)} ${c.powerY.toFixed(1)}`;
  }, '');

  const areaPathD =
    points.length > 1
      ? `${powerPathD} L ${coords[coords.length - 1].x.toFixed(1)} ${(padTop + chartH).toFixed(1)} L ${coords[0].x.toFixed(1)} ${(padTop + chartH).toFixed(1)} Z`
      : '';

  const socPoints = coords.filter((c) => c.socY !== null);
  const socPathD = socPoints.reduce((acc, c, idx) => {
    return `${acc} ${idx === 0 ? 'M' : 'L'} ${c.x.toFixed(1)} ${c.socY.toFixed(1)}`;
  }, '');

  const hoveredPoint = hoveredIndex !== null ? coords[hoveredIndex] : null;

  return (
    <div className="w-full bg-white/[.02] border border-white/[.06] rounded-2xl p-3 sm:p-4 space-y-2">
      {/* Chart Header & Legend */}
      <div className="flex items-center justify-between text-xs px-1">
        <div className="flex items-center gap-2">
          <span className="font-bold text-slate-300">Charging Curves</span>
          <span className="text-[10px] text-slate-500 font-mono">({points.length} samples)</span>
        </div>
        <div className="flex items-center gap-3 text-[11px]">
          <span className="flex items-center gap-1.5 text-sky-400 font-medium">
            <span className="w-2.5 h-0.5 rounded-full bg-sky-400 inline-block" /> Power (kW)
          </span>
          <span className="flex items-center gap-1.5 text-emerald-400 font-medium">
            <span className="w-2.5 h-0.5 rounded-full bg-emerald-400 inline-block" /> Battery (%)
          </span>
        </div>
      </div>

      {/* SVG Canvas */}
      <div className="relative w-full overflow-hidden">
        <svg
          viewBox={`0 0 ${width} ${height}`}
          className="w-full h-auto overflow-visible select-none"
        >
          <defs>
            <linearGradient id="powerGrad" x1="0%" y1="0%" x2="0%" y2="100%">
              <stop offset="0%" stopColor="#38bdf8" stopOpacity="0.35" />
              <stop offset="100%" stopColor="#38bdf8" stopOpacity="0.0" />
            </linearGradient>
          </defs>

          {/* Gridlines */}
          <line
            x1={padLeft}
            y1={padTop}
            x2={width - padRight}
            y2={padTop}
            stroke="rgba(255,255,255,0.06)"
            strokeDasharray="3 3"
          />
          <line
            x1={padLeft}
            y1={padTop + chartH / 2}
            x2={width - padRight}
            y2={padTop + chartH / 2}
            stroke="rgba(255,255,255,0.06)"
            strokeDasharray="3 3"
          />
          <line
            x1={padLeft}
            y1={padTop + chartH}
            x2={width - padRight}
            y2={padTop + chartH}
            stroke="rgba(255,255,255,0.12)"
          />

          {/* Y-Axis Labels (Left: kW) */}
          <text
            x={padLeft - 6}
            y={padTop + 4}
            textAnchor="end"
            fontSize="9"
            fill="#94a3b8"
            className="font-mono"
          >
            {maxPower}k
          </text>
          <text
            x={padLeft - 6}
            y={padTop + chartH / 2 + 3}
            textAnchor="end"
            fontSize="9"
            fill="#64748b"
            className="font-mono"
          >
            {Math.round(maxPower / 2)}k
          </text>
          <text
            x={padLeft - 6}
            y={padTop + chartH}
            textAnchor="end"
            fontSize="9"
            fill="#64748b"
            className="font-mono"
          >
            0
          </text>

          {/* Y-Axis Labels (Right: SoC %) */}
          <text
            x={width - padRight + 6}
            y={padTop + 4}
            textAnchor="start"
            fontSize="9"
            fill="#10b981"
            className="font-mono"
          >
            100%
          </text>
          <text
            x={width - padRight + 6}
            y={padTop + chartH}
            textAnchor="start"
            fontSize="9"
            fill="#059669"
            className="font-mono"
          >
            0%
          </text>

          {/* Area Fill */}
          {areaPathD && <path d={areaPathD} fill="url(#powerGrad)" />}

          {/* Power Curve (kW) */}
          {powerPathD && (
            <path
              d={powerPathD}
              fill="none"
              stroke="#38bdf8"
              strokeWidth="2.5"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          )}

          {/* SoC Curve (%) */}
          {socPathD && (
            <path
              d={socPathD}
              fill="none"
              stroke="#10b981"
              strokeWidth="2"
              strokeDasharray="4 2"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          )}

          {/* Data Points */}
          {coords.map((c, idx) => (
            <g key={idx}>
              {/* Power point */}
              <circle
                cx={c.x}
                cy={c.powerY}
                r={hoveredIndex === idx ? 4.5 : 2.5}
                fill="#38bdf8"
                stroke="#0f172a"
                strokeWidth="1.5"
                className="transition-all"
              />
              {/* SoC point */}
              {c.socY !== null && (
                <circle
                  cx={c.x}
                  cy={c.socY}
                  r={hoveredIndex === idx ? 4 : 2}
                  fill="#10b981"
                  stroke="#0f172a"
                  strokeWidth="1.5"
                />
              )}
              {/* Interactive Hit Area */}
              <rect
                x={c.x - (chartW / points.length / 2 || 10)}
                y={padTop}
                width={chartW / points.length || 20}
                height={chartH}
                fill="transparent"
                onMouseEnter={() => setHoveredIndex(idx)}
                onMouseLeave={() => setHoveredIndex(null)}
                className="cursor-pointer"
              />
            </g>
          ))}

          {/* X-Axis Time Markers */}
          {coords.length > 0 && (
            <>
              <text
                x={coords[0].x}
                y={height - 6}
                textAnchor="start"
                fontSize="9"
                fill="#64748b"
                className="font-mono"
              >
                {coords[0].time}
              </text>
              {coords.length > 2 && (
                <text
                  x={coords[Math.floor(coords.length / 2)].x}
                  y={height - 6}
                  textAnchor="middle"
                  fontSize="9"
                  fill="#64748b"
                  className="font-mono"
                >
                  {coords[Math.floor(coords.length / 2)].time}
                </text>
              )}
              {coords.length > 1 && (
                <text
                  x={coords[coords.length - 1].x}
                  y={height - 6}
                  textAnchor="end"
                  fontSize="9"
                  fill="#64748b"
                  className="font-mono"
                >
                  {coords[coords.length - 1].time}
                </text>
              )}
            </>
          )}

          {/* Tooltip Hover Line */}
          {hoveredPoint && (
            <line
              x1={hoveredPoint.x}
              y1={padTop}
              x2={hoveredPoint.x}
              y2={padTop + chartH}
              stroke="rgba(255,255,255,0.4)"
              strokeDasharray="2 2"
            />
          )}
        </svg>

        {/* Hover Tooltip Overlay */}
        {hoveredPoint && (
          <div
            className="absolute top-1 pointer-events-none bg-slate-900/95 border border-sky-500/40 rounded-xl px-2.5 py-1.5 shadow-xl text-[10px] text-white flex items-center gap-3 backdrop-blur-md animate-fade-in"
            style={{
              left: `${Math.min(Math.max(10, (hoveredPoint.x / width) * 100 - 15), 70)}%`,
            }}
          >
            <div className="font-mono text-slate-400">{hoveredPoint.time}</div>
            <div className="text-sky-400 font-bold">{hoveredPoint.power} kW</div>
            {hoveredPoint.soc !== null && (
              <div className="text-emerald-400 font-bold">{hoveredPoint.soc}% SoC</div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
