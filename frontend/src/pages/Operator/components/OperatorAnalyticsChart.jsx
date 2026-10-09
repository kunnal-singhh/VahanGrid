import { useState, useId } from 'react';
import { TrendingUp, Zap, IndianRupee, BarChart2 } from 'lucide-react';
import { formatCurrency, formatKwh } from '../../../utils/formatters';

export default function OperatorAnalyticsChart({
  analyticsData,
  loading = false,
  error = null,
  period = '7d',
  onPeriodChange,
  theme = 'dark',
}) {
  const [metricTab, setMetricTab] = useState('revenue'); // 'revenue' | 'energy'
  const [hoveredIndex, setHoveredIndex] = useState(null);
  const chartId = useId();

  const timeSeries = analyticsData?.buckets || analyticsData?.time_series || [];
  const granularity =
    analyticsData?.interval === '1 hour'
      ? 'hourly'
      : analyticsData?.granularity || (analyticsData?.period === '24h' ? 'hourly' : 'daily');

  // SVG dimensions
  const svgWidth = 800;
  const svgHeight = 240;
  const padding = { top: 20, right: 30, bottom: 45, left: 65 };
  const chartWidth = svgWidth - padding.left - padding.right;
  const chartHeight = svgHeight - padding.top - padding.bottom;

  // Determine maximum values with safe fallbacks
  const maxRevenue = Math.max(
    ...timeSeries.map((d) => Math.max(d.billed_amount_inr || 0, d.settled_amount_inr || 0)),
    100
  );
  const maxEnergy = Math.max(...timeSeries.map((d) => d.energy_kwh || 0), 10);
  const currentMax = metricTab === 'revenue' ? maxRevenue : maxEnergy;

  // Helper to calculate X and Y coordinates
  const getX = (index) => {
    if (timeSeries.length <= 1) return padding.left + chartWidth / 2;
    return padding.left + (index / (timeSeries.length - 1)) * chartWidth;
  };

  const getY = (val) => {
    if (currentMax === 0) return padding.top + chartHeight;
    const clamped = Math.max(0, val || 0);
    return padding.top + chartHeight - (clamped / currentMax) * chartHeight;
  };

  // Generate SVG path strings
  const generateLinePath = (getValue) => {
    if (timeSeries.length === 0) return '';
    return timeSeries
      .map((d, i) => `${i === 0 ? 'M' : 'L'} ${getX(i).toFixed(1)} ${getY(getValue(d)).toFixed(1)}`)
      .join(' ');
  };

  const generateAreaPath = (getValue) => {
    if (timeSeries.length === 0) return '';
    const line = generateLinePath(getValue);
    const firstX = getX(0).toFixed(1);
    const lastX = getX(timeSeries.length - 1).toFixed(1);
    const bottomY = (padding.top + chartHeight).toFixed(1);
    return `${line} L ${lastX} ${bottomY} L ${firstX} ${bottomY} Z`;
  };

  const billedArea = generateAreaPath((d) => d.billed_amount_inr);
  const billedLine = generateLinePath((d) => d.billed_amount_inr);
  const settledLine = generateLinePath((d) => d.settled_amount_inr);

  const energyArea = generateAreaPath((d) => d.energy_kwh);
  const energyLine = generateLinePath((d) => d.energy_kwh);

  // Y-axis grid tick points (4 ticks)
  const yTicks = [0, currentMax * 0.33, currentMax * 0.66, currentMax];

  // Selected or hovered point
  const activeBucket = hoveredIndex !== null ? timeSeries[hoveredIndex] : null;

  return (
    <div
      className={`glass rounded-3xl p-5 md:p-6 border transition-all ${
        theme === 'light' ? 'border-slate-200 bg-white/90 shadow-sm' : 'border-white/[.08] bg-[#070d1e]/80'
      }`}
    >
      {/* Chart Header & Controls */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6">
        <div>
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-xl bg-sky-500/10 border border-sky-500/20 flex items-center justify-center text-sky-400">
              <TrendingUp className="w-4 h-4" />
            </div>
            <div>
              <h2 className="text-sm md:text-base font-bold text-white tracking-tight">
                Fleet Performance Trends
              </h2>
              <p className="text-[11px] text-slate-400">
                {granularity === 'hourly' ? 'Hourly buckets' : 'Daily buckets'} (Asia/Kolkata IST)
              </p>
            </div>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {/* Metric Toggle Tabs */}
          <div className="flex rounded-xl p-1 bg-white/[.04] border border-white/[.06]">
            <button
              onClick={() => setMetricTab('revenue')}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold flex items-center gap-1.5 transition-all cursor-pointer ${
                metricTab === 'revenue'
                  ? 'bg-sky-500 text-white shadow-sm shadow-sky-500/20'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              <IndianRupee className="w-3.5 h-3.5" />
              <span>Revenue</span>
            </button>
            <button
              onClick={() => setMetricTab('energy')}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold flex items-center gap-1.5 transition-all cursor-pointer ${
                metricTab === 'energy'
                  ? 'bg-emerald-500 text-white shadow-sm shadow-emerald-500/20'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              <Zap className="w-3.5 h-3.5" />
              <span>Energy</span>
            </button>
          </div>

          {/* Period Selector Tabs */}
          {onPeriodChange && (
            <div className="flex rounded-xl p-1 bg-white/[.04] border border-white/[.06]">
              {['24h', '7d', '30d'].map((p) => (
                <button
                  key={p}
                  onClick={() => onPeriodChange(p)}
                  className={`px-2.5 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                    period === p
                      ? 'bg-white/10 text-sky-400 border border-sky-400/30'
                      : 'text-slate-400 hover:text-slate-200'
                  }`}
                >
                  {p}
                </button>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Chart Canvas Area */}
      {loading ? (
        <div className="h-64 flex flex-col items-center justify-center text-slate-400 gap-2">
          <div className="w-8 h-8 rounded-full border-2 border-sky-400 border-t-transparent animate-spin" />
          <span className="text-xs">Aggregating time-series telemetry...</span>
        </div>
      ) : error ? (
        <div className="h-64 flex flex-col items-center justify-center text-rose-400 gap-2 p-4 text-center">
          <BarChart2 className="w-8 h-8 opacity-60" />
          <p className="text-xs font-semibold">{error}</p>
          <span className="text-[11px] text-slate-400">Failed to render time-series analytics</span>
        </div>
      ) : timeSeries.length === 0 ? (
        <div className="h-64 flex flex-col items-center justify-center text-slate-400 gap-2">
          <BarChart2 className="w-8 h-8 opacity-40" />
          <span className="text-xs">No charging activity recorded in this period.</span>
        </div>
      ) : (
        <div className="relative">
          {/* Legend */}
          <div className="flex items-center gap-4 mb-2 text-xs">
            {metricTab === 'revenue' ? (
              <>
                <div className="flex items-center gap-1.5">
                  <span className="w-3 h-1.5 rounded-full bg-sky-400" />
                  <span className="text-slate-300">Billed Revenue</span>
                </div>
                <div className="flex items-center gap-1.5">
                  <span className="w-3 h-1.5 rounded-full bg-emerald-400" />
                  <span className="text-slate-300">Settled Revenue</span>
                </div>
              </>
            ) : (
              <div className="flex items-center gap-1.5">
                <span className="w-3 h-1.5 rounded-full bg-emerald-400" />
                <span className="text-slate-300">Measured Energy (kWh)</span>
              </div>
            )}
          </div>

          {/* SVG Visual */}
          <div className="w-full overflow-x-auto">
            <svg
              viewBox={`0 0 ${svgWidth} ${svgHeight}`}
              className="w-full h-56 sm:h-64 select-none"
              preserveAspectRatio="none"
              role="img"
              aria-label="Operator analytics trend graph"
            >
              <defs>
                <linearGradient id={`billedGrad-${chartId}`} x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#38bdf8" stopOpacity="0.35" />
                  <stop offset="100%" stopColor="#38bdf8" stopOpacity="0.0" />
                </linearGradient>
                <linearGradient id={`energyGrad-${chartId}`} x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#34d399" stopOpacity="0.35" />
                  <stop offset="100%" stopColor="#34d399" stopOpacity="0.0" />
                </linearGradient>
              </defs>

              {/* Y Grid Lines & Labels */}
              {yTicks.map((tick, i) => {
                const y = getY(tick);
                return (
                  <g key={i}>
                    <line
                      x1={padding.left}
                      y1={y}
                      x2={svgWidth - padding.right}
                      y2={y}
                      stroke={theme === 'light' ? '#e2e8f0' : 'rgba(255,255,255,0.06)'}
                      strokeDasharray="4 4"
                    />
                    <text
                      x={padding.left - 8}
                      y={y + 4}
                      textAnchor="end"
                      fill={theme === 'light' ? '#64748b' : '#94a3b8'}
                      fontSize="10"
                      fontFamily="monospace"
                    >
                      {metricTab === 'revenue'
                        ? tick >= 1000
                          ? `₹${(tick / 1000).toFixed(1)}k`
                          : `₹${Math.round(tick)}`
                        : `${Math.round(tick)} kWh`}
                    </text>
                  </g>
                );
              })}

              {/* X Axis Labels */}
              {timeSeries.map((d, i) => {
                // Show subset of labels for 24h or 30d to prevent clutter
                const step = timeSeries.length > 20 ? 4 : timeSeries.length > 10 ? 2 : 1;
                if (i % step !== 0 && i !== timeSeries.length - 1) return null;
                const x = getX(i);
                return (
                  <text
                    key={i}
                    x={x}
                    y={svgHeight - 12}
                    textAnchor="middle"
                    fill={theme === 'light' ? '#64748b' : '#94a3b8'}
                    fontSize="10"
                  >
                    {d.label}
                  </text>
                );
              })}

              {/* Data Series Paths */}
              {metricTab === 'revenue' ? (
                <>
                  <path d={billedArea} fill={`url(#billedGrad-${chartId})`} />
                  <path
                    d={billedLine}
                    fill="none"
                    stroke="#38bdf8"
                    strokeWidth="2.5"
                    strokeLinecap="round"
                  />
                  <path
                    d={settledLine}
                    fill="none"
                    stroke="#34d399"
                    strokeWidth="2"
                    strokeDasharray="3 3"
                    strokeLinecap="round"
                  />
                </>
              ) : (
                <>
                  <path d={energyArea} fill={`url(#energyGrad-${chartId})`} />
                  <path
                    d={energyLine}
                    fill="none"
                    stroke="#34d399"
                    strokeWidth="2.5"
                    strokeLinecap="round"
                  />
                </>
              )}

              {/* Interactive Target Areas & Focus Points */}
              {timeSeries.map((d, i) => {
                const x = getX(i);
                const y =
                  metricTab === 'revenue' ? getY(d.billed_amount_inr) : getY(d.energy_kwh);
                const isHovered = hoveredIndex === i;

                return (
                  <g
                    key={i}
                    onMouseEnter={() => setHoveredIndex(i)}
                    onMouseLeave={() => setHoveredIndex(null)}
                    className="cursor-pointer"
                  >
                    {/* Hover vertical guide */}
                    {isHovered && (
                      <line
                        x1={x}
                        y1={padding.top}
                        x2={x}
                        y2={padding.top + chartHeight}
                        stroke="#38bdf8"
                        strokeWidth="1.5"
                        strokeDasharray="2 2"
                        opacity="0.75"
                      />
                    )}

                    {/* Point dot */}
                    <circle
                      cx={x}
                      cy={y}
                      r={isHovered ? 5.5 : 3}
                      fill={metricTab === 'revenue' ? '#38bdf8' : '#34d399'}
                      stroke={theme === 'light' ? '#ffffff' : '#070d1e'}
                      strokeWidth="2"
                      className="transition-all"
                    />

                    {/* Transparent touch area */}
                    <rect
                      x={x - chartWidth / (timeSeries.length * 2)}
                      y={padding.top}
                      width={chartWidth / timeSeries.length}
                      height={chartHeight}
                      fill="transparent"
                    />
                  </g>
                );
              })}
            </svg>
          </div>

          {/* Interactive Tooltip Card */}
          {activeBucket && (
            <div
              className={`mt-2 p-3 rounded-2xl border flex flex-wrap items-center justify-between gap-4 text-xs ${
                theme === 'light'
                  ? 'bg-slate-50 border-slate-200 text-slate-800'
                  : 'bg-white/[.04] border-white/10 text-slate-200'
              }`}
            >
              <div className="flex items-center gap-2">
                <span className="font-bold text-sky-400">{activeBucket.label}</span>
                <span className="text-slate-400">•</span>
                <span className="text-slate-300">{activeBucket.session_count || 0} Sessions</span>
              </div>

              <div className="flex flex-wrap items-center gap-4 font-mono font-medium">
                <div>
                  <span className="text-slate-400 mr-1.5 font-sans">Delivered:</span>
                  <span className="text-emerald-400 font-bold">
                    {formatKwh(activeBucket.energy_kwh || 0)}
                  </span>
                </div>
                <div>
                  <span className="text-slate-400 mr-1.5 font-sans">Billed:</span>
                  <span className="text-sky-400 font-bold">
                    {formatCurrency(activeBucket.billed_amount_inr || 0)}
                  </span>
                </div>
                <div>
                  <span className="text-slate-400 mr-1.5 font-sans">Settled:</span>
                  <span className="text-emerald-400 font-bold">
                    {formatCurrency(activeBucket.settled_amount_inr || 0)}
                  </span>
                </div>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
