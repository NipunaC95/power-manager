import React, { useState, useEffect } from 'react';

interface CellSummary {
  cell_index: number;
  avg_voltage: number;
  min_voltage: number;
  max_voltage: number;
  avg_delta_from_mean: number;
  voltage_spread: number;
  is_weakest: boolean;
  status: 'healthy' | 'caution' | 'imbalanced';
}

interface CellHealthData {
  sample_records: number;
  weakest_cell_index: number | null;
  max_pack_delta: number;
  avg_pack_delta: number;
  cells: CellSummary[];
}

export default function CellHealthPage() {
  const [data, setData] = useState<CellHealthData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch('/api/analytics/cells')
      .then((r) => r.json())
      .then((d) => setData(d))
      .catch((err) => console.error(err))
      .finally(() => setLoading(false));
  }, []);

  return (
    <div className="space-y-6">
      <div className="bg-[#1e1e22] border border-white/10 p-5 rounded-xl">
        <h2 className="font-serif text-xl text-white font-normal">Cell Health & Internal Resistance Analysis</h2>
        <p className="text-xs text-neutral-400 font-mono mt-1">
          Deep diagnostic tracking of individual cell degradation, voltage sag under load, and balancing performance
        </p>
      </div>

      {/* ── Summary Ribbon ── */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 font-mono text-xs">
        <div className="bg-[#1e1e22] border border-white/10 p-4 rounded-xl">
          <span className="text-neutral-400 text-[10px] block mb-1">PACK MAX SPREAD (ΔV)</span>
          <span className="text-xl font-bold text-white">
            {data ? `${(data.max_pack_delta * 1000).toFixed(0)} mV` : '--'}
          </span>
          <span className="text-[11px] text-neutral-500 block mt-1">
            Avg Delta: {data ? `${(data.avg_pack_delta * 1000).toFixed(1)} mV` : '--'}
          </span>
        </div>

        <div className="bg-[#1e1e22] border border-white/10 p-4 rounded-xl">
          <span className="text-neutral-400 text-[10px] block mb-1">WEAKEST CELL IDENTIFIED</span>
          <span className="text-xl font-bold text-amber-400">
            {data?.weakest_cell_index !== null && data?.weakest_cell_index !== undefined
              ? `Cell #${data.weakest_cell_index + 1}`
              : 'None (Balanced)'}
          </span>
          <span className="text-[11px] text-neutral-500 block mt-1">
            Highest voltage sag under discharge load
          </span>
        </div>

        <div className="bg-[#1e1e22] border border-white/10 p-4 rounded-xl">
          <span className="text-neutral-400 text-[10px] block mb-1">SAMPLE WINDOW</span>
          <span className="text-xl font-bold text-emerald-400">
            {data?.sample_records ?? 0} Snapshots
          </span>
          <span className="text-[11px] text-neutral-500 block mt-1">
            Analyzed across active discharge phases
          </span>
        </div>
      </div>

      {/* ── Cell Detailed Table ── */}
      <div className="bg-[#1e1e22] border border-white/10 rounded-xl p-6 shadow-sm">
        <h3 className="font-serif text-base text-white mb-4">Individual Cell Metrics & Sag Analysis</h3>

        {loading ? (
          <div className="py-8 text-center font-mono text-xs text-neutral-400 animate-pulse">
            Analyzing cell degradation...
          </div>
        ) : !data || !data.cells.length ? (
          <div className="py-8 text-center font-mono text-xs text-neutral-500">
            No cell telemetry available yet.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left font-mono text-xs">
              <thead>
                <tr className="border-b border-white/10 text-neutral-400 text-[11px]">
                  <th className="pb-3 font-semibold">CELL #</th>
                  <th className="pb-3 font-semibold">AVG VOLTAGE</th>
                  <th className="pb-3 font-semibold">MIN VOLTAGE</th>
                  <th className="pb-3 font-semibold">MAX VOLTAGE</th>
                  <th className="pb-3 font-semibold">LOAD SAG (Δ FROM PACK)</th>
                  <th className="pb-3 font-semibold">VOLTAGE SPREAD</th>
                  <th className="pb-3 font-semibold text-right">STATUS</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/5">
                {data.cells.map((c) => (
                  <tr key={c.cell_index} className={c.is_weakest ? 'bg-amber-950/20' : ''}>
                    <td className="py-3 font-bold text-white flex items-center gap-2">
                      <span>Cell {c.cell_index + 1}</span>
                      {c.is_weakest && (
                        <span className="text-[9px] bg-amber-500/20 text-amber-300 px-1.5 py-0.5 rounded font-bold">
                          WEAKEST
                        </span>
                      )}
                    </td>
                    <td className="py-3 text-neutral-200">{c.avg_voltage.toFixed(3)} V</td>
                    <td className="py-3 text-neutral-400">{c.min_voltage.toFixed(3)} V</td>
                    <td className="py-3 text-neutral-400">{c.max_voltage.toFixed(3)} V</td>
                    <td className="py-3">
                      <span className={c.avg_delta_from_mean < 0 ? 'text-amber-400 font-bold' : 'text-emerald-400'}>
                        {c.avg_delta_from_mean > 0 ? `+${c.avg_delta_from_mean}` : c.avg_delta_from_mean} mV
                      </span>
                    </td>
                    <td className="py-3 text-neutral-300">{c.voltage_spread} mV</td>
                    <td className="py-3 text-right">
                      <span
                        className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                          c.status === 'healthy'
                            ? 'bg-emerald-500/20 text-emerald-400'
                            : c.status === 'caution'
                            ? 'bg-amber-500/20 text-amber-400'
                            : 'bg-rose-500/20 text-rose-400'
                        }`}
                      >
                        {c.status.toUpperCase()}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}

