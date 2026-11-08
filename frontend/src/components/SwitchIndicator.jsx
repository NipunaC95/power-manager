import React from 'react';

export default function SwitchIndicator({ label, enabled }) {
  return (
    <div className={`font-mono text-xs px-3 py-1.5 rounded-sm border flex items-center gap-2 transition-colors ${
      enabled
        ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-300'
        : 'bg-[#BF3C27]/10 border-[#BF3C27]/30 text-rose-300'
    }`}>
      <span className={`w-1.5 h-1.5 rounded-full ${enabled ? 'bg-emerald-400' : 'bg-[#BF3C27]'}`} />
      <span className="text-neutral-400">{label}:</span>
      <span className="font-semibold">{enabled ? 'ENABLED' : 'DISABLED'}</span>
    </div>
  );
}
