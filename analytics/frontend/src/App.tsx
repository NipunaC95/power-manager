import React, { useState } from 'react';
import Navigation, { ActivePage } from './components/Navigation';
import LiveMonitorPage from './pages/LiveMonitorPage';
import CalendarView from './components/CalendarView';
import TrendsPage from './pages/TrendsPage';
import CellHealthPage from './pages/CellHealthPage';
import SettingsPage from './pages/SettingsPage';
import { useLiveSocket } from './hooks/useLiveSocket';

export default function App() {
  const [activePage, setActivePage] = useState<ActivePage>('live');
  const { connectionStatus } = useLiveSocket();
  const [isSyncing, setIsSyncing] = useState(false);
  const [syncToast, setSyncToast] = useState<string | null>(null);

  const handleGlobalSync = async () => {
    setIsSyncing(true);
    setSyncToast('Syncing latest telemetry data...');
    try {
      const res = await fetch('/api/analytics/sync', { method: 'POST' });
      const data = await res.json();
      setSyncToast(data.message || 'Data synced successfully!');
    } catch (err: any) {
      setSyncToast(`Sync failed: ${err.message}`);
    } finally {
      setIsSyncing(false);
      setTimeout(() => setSyncToast(null), 4000);
    }
  };

  return (
    <div className="min-h-screen bg-[#121214] text-neutral-100 flex flex-col font-sans selection:bg-[#E2583E] selection:text-white">
      {/* ── Native Mobile Top App Bar ── */}
      <header className="sticky top-0 z-40 bg-[#121214]/90 backdrop-blur-xl border-b border-white/10 px-4 py-3">
        <div className="max-w-3xl mx-auto flex items-center justify-between">
          {/* App Brand & Status */}
          <div className="flex items-center gap-3">
            <span className="inline-flex items-center justify-center w-8 h-8 rounded-xl bg-gradient-to-br from-[#BF3C27] to-[#E2583E] text-white font-mono text-sm font-bold shadow-md">
              ⚡
            </span>
            <div>
              <div className="flex items-center gap-2">
                <h1 className="text-base sm:text-lg font-bold text-white tracking-tight">
                  BATMON
                </h1>
                <span className="text-[10px] font-mono font-bold px-2 py-0.5 rounded-full bg-white/10 text-neutral-300 border border-white/5">
                  130Ah &middot; 8S
                </span>
              </div>
              <p className="text-[10px] font-mono text-neutral-400">
                Battery Analytics &amp; Energy Monitor
              </p>
            </div>
          </div>

          {/* Quick Header Actions */}
          <div className="flex items-center gap-2">
            {/* Live Indicator Pill */}
            <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-neutral-900 border border-white/10 text-[10px] font-mono">
              <span
                className={`w-2 h-2 rounded-full ${
                  connectionStatus === 'ws_live'
                    ? 'bg-emerald-400 animate-pulse'
                    : connectionStatus === 'polling'
                    ? 'bg-amber-400'
                    : 'bg-rose-500'
                }`}
              />
              <span className="hidden sm:inline font-bold">
                {connectionStatus === 'ws_live' ? 'ONLINE' : connectionStatus === 'polling' ? 'POLLING' : 'OFFLINE'}
              </span>
            </div>

            {/* Sync Button */}
            <button
              onClick={handleGlobalSync}
              disabled={isSyncing}
              className="p-2 rounded-xl bg-neutral-900 border border-white/10 text-neutral-300 hover:text-white hover:bg-neutral-800 transition active:scale-95 disabled:opacity-50 cursor-pointer"
              title="Sync Latest Data"
            >
              <svg
                className={`w-4 h-4 ${isSyncing ? 'animate-spin text-[#E2583E]' : ''}`}
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <path d="M21.5 2v6h-6M2.5 22v-6h6M2 11.5a10 10 0 0 1 18.8-4.3M22 12.5a10 10 0 0 1-18.8 4.2" />
              </svg>
            </button>
          </div>
        </div>
      </header>

      {/* Sync Toast Notification */}
      {syncToast && (
        <div className="fixed top-16 left-4 right-4 z-50 max-w-md mx-auto">
          <div className="p-3 rounded-xl bg-[#1e1e22]/95 backdrop-blur-md border border-emerald-500/40 text-emerald-300 font-mono text-xs flex items-center justify-between shadow-2xl">
            <div className="flex items-center gap-2">
              <span>✓</span>
              <span>{syncToast}</span>
            </div>
            <button onClick={() => setSyncToast(null)} className="text-neutral-400 hover:text-white ml-2 text-sm">
              ✕
            </button>
          </div>
        </div>
      )}

      {/* ── Main App Content (Padded at bottom for Instagram Navigation) ── */}
      <main className="flex-1 max-w-3xl w-full mx-auto px-3.5 sm:px-6 pt-4 pb-28">
        {activePage === 'live' && <LiveMonitorPage />}
        {activePage === 'calendar' && <CalendarView />}
        {activePage === 'trends' && <TrendsPage />}
        {activePage === 'cells' && <CellHealthPage />}
        {activePage === 'settings' && <SettingsPage />}
      </main>

      {/* ── Fixed Bottom Instagram Tab Navigation ── */}
      <Navigation
        activePage={activePage}
        onSelectPage={setActivePage}
        isWsLive={connectionStatus === 'ws_live'}
      />
    </div>
  );
}
