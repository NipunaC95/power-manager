import React from 'react';
import { timeAgo } from '../utils/format.js';

export default function Header({ latest, isCharging, isDischarging, isOnline }) {
  const lastUpdate = latest?.timestamp ? timeAgo(latest.timestamp) : null;

  return (
    <div className="flex items-center justify-between mb-6">
      <div>
        <h1 className="text-lg font-semibold text-white">BMS Monitor</h1>
        <p className="text-xs text-slate-500 mt-0.5">
          {isOnline ? `Updated ${lastUpdate}` : 'Connecting…'}
        </p>
      </div>
      <div className="flex items-center gap-2">
        <StatusBadge
          label={isCharging ? 'Charging' : isDischarging ? 'Discharging' : 'Idle'}
          color={isCharging ? 'green' : isDischarging ? 'amber' : 'slate'}
        />
        <span className={`w-2 h-2 rounded-full ${isOnline ? 'bg-emerald-400' : 'bg-slate-600'}`}
          title={isOnline ? 'Connected' : 'Offline'} />
      </div>
    </div>
  );
}

function StatusBadge({ label, color }) {
  const colors = {
    green: 'bg-emerald-500/10 text-emerald-400',
    amber: 'bg-amber-500/10 text-amber-400',
    slate: 'bg-slate-800 text-slate-400',
  };
  return (
    <span className={`text-[11px] font-medium px-2 py-0.5 rounded ${colors[color] || colors.slate}`}>
      {label}
    </span>
  );
}
