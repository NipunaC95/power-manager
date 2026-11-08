import React from 'react';

export default function SwitchIndicator({ label, enabled }) {
  return (
    <div className={`text-xs px-3 py-1.5 rounded border ${
      enabled
        ? 'bg-emerald-500/5 border-emerald-500/20 text-emerald-400'
        : 'bg-red-500/5 border-red-500/20 text-red-400'
    }`}>
      {label}: {enabled ? 'ON' : 'OFF'}
    </div>
  );
}
