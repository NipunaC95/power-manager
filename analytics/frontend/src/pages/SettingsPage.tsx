import React, { useState, useEffect } from 'react';

export default function SettingsPage() {
  const [syncStatus, setSyncStatus] = useState<any>(null);
  const [isSyncing, setIsSyncing] = useState(false);
  const [syncOutput, setSyncOutput] = useState<string | null>(null);

  const fetchStatus = () => {
    fetch('/api/sync/status')
      .then((r) => r.json())
      .then((d) => setSyncStatus(d))
      .catch((err) => console.error(err));
  };

  useEffect(() => {
    fetchStatus();
  }, []);

  const handleForceSync = async () => {
    setIsSyncing(true);
    setSyncOutput('Triggering batch sync with primary GCP server...');
    try {
      const res = await fetch('/api/analytics/sync', { method: 'POST' });
      const data = await res.json();
      setSyncOutput(JSON.stringify(data, null, 2));
      fetchStatus();
    } catch (err: any) {
      setSyncOutput(`Sync failed: ${err.message}`);
    } finally {
      setIsSyncing(false);
    }
  };

  return (
    <div className="space-y-6 max-w-4xl">
      <div className="bg-[#1e1e22] border border-white/10 p-5 rounded-xl">
        <h2 className="font-serif text-xl text-white font-normal">System & Pipeline Configuration</h2>
        <p className="text-xs text-neutral-400 font-mono mt-1">
          Cloudflare D1 edge database synchronization, battery pack specifications & pipeline diagnostics
        </p>
      </div>

      {/* ── Sync Pipeline Status ── */}
      <div className="bg-[#1e1e22] border border-white/10 rounded-xl p-6 shadow-sm space-y-4 font-mono text-xs">
        <h3 className="font-serif text-base text-white">Cloudflare D1 Scheduled Sync</h3>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-neutral-300">
          <div className="bg-neutral-900/60 p-3 rounded-lg border border-white/5">
            <span className="text-[10px] text-neutral-400 block mb-1">TARGET GCP HOST</span>
            <span className="text-white font-bold">{syncStatus?.target_server || 'http://136.80.228.184'}</span>
          </div>

          <div className="bg-neutral-900/60 p-3 rounded-lg border border-white/5">
            <span className="text-[10px] text-neutral-400 block mb-1">SCHEDULED CRON FREQUENCY</span>
            <span className="text-emerald-400 font-bold">Every 1 Hour (0 * * * *)</span>
          </div>

          <div className="bg-neutral-900/60 p-3 rounded-lg border border-white/5">
            <span className="text-[10px] text-neutral-400 block mb-1">LAST SYNCED RECORD ID</span>
            <span className="text-white font-bold">#{syncStatus?.last_synced_id ?? 0}</span>
          </div>

          <div className="bg-neutral-900/60 p-3 rounded-lg border border-white/5">
            <span className="text-[10px] text-neutral-400 block mb-1">LAST SYNC TIMESTAMP</span>
            <span className="text-neutral-200">{syncStatus?.last_sync_time || 'Never'}</span>
          </div>
        </div>

        <div className="pt-2">
          <button
            onClick={handleForceSync}
            disabled={isSyncing}
            className="zed-btn-rust px-4 py-2 rounded-lg text-white font-mono text-xs flex items-center gap-2 cursor-pointer shadow disabled:opacity-50"
          >
            <span className={isSyncing ? 'animate-spin' : ''}>🔄</span>
            <span>{isSyncing ? 'Executing Sync...' : 'Trigger Immediate Sync Now'}</span>
          </button>
        </div>

        {syncOutput && (
          <pre className="bg-neutral-950 p-3 rounded-lg border border-white/10 text-[11px] text-emerald-300 overflow-x-auto">
            {syncOutput}
          </pre>
        )}
      </div>

      {/* ── Battery Pack Specifications ── */}
      <div className="bg-[#1e1e22] border border-white/10 rounded-xl p-6 shadow-sm font-mono text-xs space-y-3">
        <h3 className="font-serif text-base text-white">Battery Specifications & Ratings</h3>
        <p className="text-[11px] text-neutral-400">
          Used by the analytical engine to calculate cycle wear (EFC), energy balance, and Coulomb efficiency.
        </p>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 pt-2">
          <div className="bg-neutral-900/60 p-3 rounded-lg border border-white/5">
            <span className="text-[10px] text-neutral-400 block mb-1">NOMINAL CAPACITY</span>
            <span className="text-base font-bold text-white">100.0 Ah</span>
          </div>
          <div className="bg-neutral-900/60 p-3 rounded-lg border border-white/5">
            <span className="text-[10px] text-neutral-400 block mb-1">NOMINAL VOLTAGE</span>
            <span className="text-base font-bold text-white">25.6 V (8S)</span>
          </div>
          <div className="bg-neutral-900/60 p-3 rounded-lg border border-white/5">
            <span className="text-[10px] text-neutral-400 block mb-1">CELL CHEMISTRY</span>
            <span className="text-base font-bold text-emerald-400">LiFePO4 (LFP)</span>
          </div>
        </div>
      </div>
    </div>
  );
}
