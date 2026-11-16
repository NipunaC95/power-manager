import React, { useState, useEffect } from 'react';
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
  const [showIosPrompt, setShowIosPrompt] = useState(false);
  const [isIosDevice, setIsIosDevice] = useState(false);
  const [isStandalone, setIsStandalone] = useState(false);

  useEffect(() => {
    const isIos = /iPhone|iPad|iPod/.test(navigator.userAgent) && !(window as any).MSStream;
    const standalone = (window.navigator as any).standalone === true || window.matchMedia('(display-mode: standalone)').matches;
    setIsIosDevice(isIos);
    setIsStandalone(standalone);
  }, []);

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

          {/* iOS Install App Button */}
          {(!isStandalone) && (
            <button
              onClick={() => setShowIosPrompt(true)}
              className="zed-btn-neutral px-3 py-1 rounded text-xs font-mono text-emerald-400 border border-emerald-500/30 hover:border-emerald-500/60 transition-colors flex items-center gap-1.5 cursor-pointer"
              title="Install as iOS / Mobile App"
            >
              <span>📲</span>
              <span className="hidden sm:inline">Install App</span>
            </button>
          )}

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

      {/* iOS Install Guidance Modal */}
      {showIosPrompt && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-[#1e1e22] border border-white/10 rounded-xl p-6 max-w-sm w-full shadow-2xl relative">
            <button
              onClick={() => setShowIosPrompt(false)}
              className="absolute top-3 right-3 text-neutral-400 hover:text-white text-lg font-mono px-2 py-1"
            >
              ✕
            </button>
            <div className="flex items-center gap-3 mb-4">
              <img src="/apple-touch-icon.png" alt="JK-BMS" className="w-12 h-12 rounded-xl shadow-md border border-white/10" />
              <div>
                <h3 className="font-serif text-lg text-white">Install JK-BMS App</h3>
                <p className="text-xs text-neutral-400 font-mono">Run standalone on iPhone & iPad</p>
              </div>
            </div>

            <div className="space-y-3 text-sm text-neutral-300 font-sans my-4">
              <div className="flex items-start gap-3 bg-neutral-900/60 p-2.5 rounded-lg border border-white/5">
                <span className="font-mono text-emerald-400 font-bold">1.</span>
                <span>In Safari, tap the <strong>Share</strong> button <span className="inline-block px-1.5 py-0.5 bg-neutral-800 rounded font-mono text-xs">⎋</span> at the bottom.</span>
              </div>
              <div className="flex items-start gap-3 bg-neutral-900/60 p-2.5 rounded-lg border border-white/5">
                <span className="font-mono text-emerald-400 font-bold">2.</span>
                <span>Scroll down and tap <strong>Add to Home Screen</strong> <span className="inline-block px-1.5 py-0.5 bg-neutral-800 rounded font-mono text-xs">⊞</span>.</span>
              </div>
              <div className="flex items-start gap-3 bg-neutral-900/60 p-2.5 rounded-lg border border-white/5">
                <span className="font-mono text-emerald-400 font-bold">3.</span>
                <span>Tap <strong>Add</strong> in the top right corner.</span>
              </div>
            </div>

            <p className="text-[11px] text-neutral-500 font-mono text-center mb-4">
              Launches in fullscreen with zero browser address bars, like a native app.
            </p>

            <button
              onClick={() => setShowIosPrompt(false)}
              className="w-full zed-btn-rust py-2 rounded-lg text-xs font-mono text-white font-medium"
            >
              Got it!
            </button>
          </div>
        </div>
      )}
    </header>
  );
}
