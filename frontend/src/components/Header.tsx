import React from 'react';
import { timeAgo } from '../utils/format';
import { TelemetryData } from '../types';

export interface HeaderProps {
  latest: TelemetryData | null;
  isCharging: boolean;
  isDischarging: boolean;
  isOnline: boolean;
  isWsConnected: boolean;
  onOpenSettings: () => void;
}

export default function Header({
  latest,
  isCharging,
  isDischarging,
  isOnline,
  isWsConnected,
  onOpenSettings,
}: HeaderProps) {
  const lastUpdate = latest?.timestamp ? timeAgo(latest.timestamp) : null;

  return (
    <header className="border-b border-white/10 pb-5 mb-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        {/* Title & Branding */}
        <div>
          <div className="flex items-center gap-2.5">
            <span className="inline-flex items-center justify-center w-6 h-6 rounded bg-[#BF3C27] text-white font-mono text-xs font-bold shadow-sm">
              Z
            </span>
            <h1 className="font-serif text-xl sm:text-2xl text-white font-normal tracking-tight">
              JK-BMS <span className="italic text-neutral-400 font-serif font-light text-base sm:text-lg">Telemetry</span>
            </h1>
          </div>
          <p className="font-mono text-[11px] text-neutral-500 mt-1 flex items-center gap-2">
            <span className="text-neutral-400">Target:</span>
            <span className="text-neutral-300 bg-neutral-900 px-1.5 py-0.5 rounded border border-white/5">507268D28101263</span>
            <span className="text-neutral-600">/</span>
            <span>{isOnline ? `Updated ${lastUpdate}` : 'Awaiting stream…'}</span>
          </p>
        </div>

        {/* Status controls */}
        <div className="flex items-center gap-2.5">
          {/* State of operation */}
          <div className="flex items-center gap-1.5 px-2.5 py-1 rounded text-xs font-mono bg-neutral-900 border border-white/10">
            <span className={`w-1.5 h-1.5 rounded-full ${
              isCharging ? 'bg-emerald-400 animate-pulse' :
              isDischarging ? 'bg-amber-400' : 'bg-neutral-500'
            }`} />
            <span className="text-neutral-300">
              {isCharging ? 'CHARGING' : isDischarging ? 'DISCHARGING' : 'STANDBY'}
            </span>
          </div>

          {/* Connection */}
          <div className="flex items-center gap-1.5 px-2.5 py-1 rounded text-xs font-mono bg-neutral-900 border border-white/10"
               title={isWsConnected ? "Connected via Realtime WebSocket" : isOnline ? "Connected via HTTP Polling" : "Offline"}>
            <span className={`w-1.5 h-1.5 rounded-full ${
              isWsConnected ? 'bg-emerald-400 animate-ping' :
              isOnline ? 'bg-emerald-400' : 'bg-rose-500'
            }`} />
            <span className={isOnline ? 'text-neutral-300' : 'text-rose-400'}>
              {isWsConnected ? 'WS LIVE' : isOnline ? 'ONLINE' : 'OFFLINE'}
            </span>
          </div>

          {/* Settings button */}
          <button
            onClick={onOpenSettings}
            className="zed-btn-neutral px-3 py-1 rounded text-xs font-mono text-neutral-300 transition-colors flex items-center gap-1.5 cursor-pointer"
            title="Battery & SOC Settings"
          >
            <span>⚙</span>
            <span className="hidden sm:inline">Settings</span>
          </button>

          {/* Refresh action */}
          <button
            onClick={() => window.dispatchEvent(new Event('fetchNow'))}
            className="zed-btn-neutral px-3 py-1 rounded text-xs font-mono text-neutral-300 transition-colors flex items-center gap-1.5 cursor-pointer"
            title="Force refresh"
          >
            <span>↻</span>
            <span className="hidden sm:inline">Sync</span>
          </button>
        </div>
      </div>
    </header>
  );
}
