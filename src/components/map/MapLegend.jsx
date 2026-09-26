export default function MapLegend() {
  const LEGEND_ITEMS = [
    { color: '#10b981', label: 'Available', glow: 'rgba(16, 185, 129, 0.4)' },
    { color: '#f43f5e', label: 'In Use', glow: 'rgba(244, 63, 94, 0.4)' },
    { color: '#f59e0b', label: 'Reserved', glow: 'rgba(245, 158, 11, 0.4)' },
    { color: '#64748b', label: 'Offline / Maintenance', glow: 'rgba(100, 116, 139, 0.2)' },
  ];

  return (
    <div className="glass rounded-xl px-3.5 py-2.5 text-[10px] space-y-1.5 shadow-xl border border-white/[.08] backdrop-blur-xl">
      <div className="text-[9px] font-bold uppercase tracking-wider text-slate-400 mb-1">
        Charger Status
      </div>
      {LEGEND_ITEMS.map(({ color, label, glow }) => (
        <div key={label} className="flex items-center gap-2">
          <span
            className="w-2 h-2 rounded-full shrink-0"
            style={{ background: color, boxShadow: `0 0 8px ${glow}` }}
          />
          <span className="text-slate-300 font-medium">{label}</span>
        </div>
      ))}
    </div>
  );
}
