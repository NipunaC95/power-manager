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
    setSyncToast('Syncing with primary GCP server...');
    try {
      const res = await fetch('/api/analytics/sync', { method: 'POST' });
      const data = await res.json();
      setSyncToast(data.message || 'Sync completed successfully!');
    } catch (err: any) {
      setSyncToast(`Sync failed: ${err.message}`);
    } finally {
      setIsSyncing(false);
      setTimeout(() => setSyncToast(null), 5000);
    }
  };

  return (
    <div className="max-w-6xl mx-auto px-4 py-6">
      {/* ── Executive Top Header ── */}
      <header className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-6 mb-4">
        <div>
          <div className="flex items-center gap-3">
            <span className="inline-flex items-center justify-center w-8 h-8 rounded-lg bg-[#BF3C27] text-white font-mono text-sm font-bold shadow-md">
              JK
            </span>
            <div>
              <h1 className="font-serif text-2xl sm:text-3xl text-white font-normal tracking-tight flex items-center gap-2">
                JK-BMS <span className="italic text-neutral-400 font-serif font-light text-lg sm:text-xl">Cloud Platform</span>
              </h1>
              <p className="font-mono text-xs text-neutral-400 mt-0.5">
                Realtime IoT Telemetry &middot; Cloudflare D1 Serverless Analytics
              </p>
            </div>
          </div>
        </div>

        {/* Top Right Quick Actions */}
        <div className="flex items-center gap-2.5 font-mono text-xs">
          <a
            href="http://136.80.228.184/"
            target="_blank"
            rel="noreferrer"
            className="zed-btn-neutral px-3 py-1.5 rounded-lg text-neutral-300 hover:text-white transition flex items-center gap-1.5"
            title="Open Dedicated GCP Direct Host"
          >
            <span>🌐</span>
            <span>GCP Host</span>
          </a>

          <button
            onClick={handleGlobalSync}
            disabled={isSyncing}
            className="zed-btn-rust px-3.5 py-1.5 rounded-lg text-white font-medium flex items-center gap-2 shadow disabled:opacity-50 cursor-pointer"
            title="Sync Latest Data into Cloudflare D1"
          >
            <span className={isSyncing ? 'animate-spin' : ''}>🔄</span>
            <span className="hidden sm:inline">{isSyncing ? 'Syncing...' : 'D1 Sync'}</span>
          </button>
        </div>
      </header>

      {/* Sync Toast Notification */}
      {syncToast && (
        <div className="mb-6 p-3 rounded-lg bg-emerald-950/60 border border-emerald-500/40 text-emerald-300 font-mono text-xs flex items-center justify-between shadow-lg">
          <div className="flex items-center gap-2">
            <span>✓</span>
            <span>{syncToast}</span>
          </div>
          <button onClick={() => setSyncToast(null)} className="text-neutral-400 hover:text-white">✕</button>
        </div>
      )}

      {/* ── Multi-Page Navigation ── */}
      <Navigation
        activePage={activePage}
        onSelectPage={setActivePage}
        isWsLive={connectionStatus === 'ws_live'}
      />

      {/* ── Page Content ── */}
      <main>
        {activePage === 'live' && <LiveMonitorPage />}
        {activePage === 'calendar' && <CalendarView />}
        {activePage === 'trends' && <TrendsPage />}
        {activePage === 'cells' && <CellHealthPage />}
        {activePage === 'settings' && <SettingsPage />}
      </main>

      {/* ── Executive Footer ── */}
      <footer className="border-t border-white/10 mt-12 pt-6 text-xs font-mono text-neutral-500 flex flex-col sm:flex-row items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <span className="w-2 h-2 rounded-full bg-emerald-400"></span>
          <span>Edge Network: Cloudflare Workers + D1 Database</span>
        </div>
        <div>
          <span>BMS ID: 507268D28101263 &middot; 8S LiFePO4</span>
        </div>
      </footer>
    </div>
  );
}
