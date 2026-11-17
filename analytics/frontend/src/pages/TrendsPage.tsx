import React, { useState, useEffect } from 'react';

interface DailyData {
  date: string;
  total_records: number;
  kwh_charged: number;
  kwh_discharged: number;
  net_kwh: number;
  coulomb_efficiency: number;
  equivalent_full_cycles: number;
  min_soc: number;
  max_soc: number;
  soc_swing: number;
  peak_charge_watts: number;
  peak_discharge_watts: number;
  max_cell_delta: number;
  weakest_cell_index: number | null;
  highest_temp_mos: number;
  highest_temp_bat: number;
  health_score: number;
}

export default function TrendsPage() {
  const [days, setDays] = useState<DailyData[]>([]);
  const [rangeDays, setRangeDays] = useState<number>(14);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    fetch(`/api/analytics/daily?days=${rangeDays}`)
      .then((r) => r.json())
      .then((data) => {
        setDays(Array.isArray(data) ? data : []);
      })
      .catch((err) => console.error(err))
      .finally(() => setLoading(false));
  }, [rangeDays]);

  const maxKwh = Math.max(...days.map((d) => Math.max(d.kwh_charged, d.kwh_discharged)), 0.5);
  const maxWatts = Math.max(...days.map((d) => Math.max(d.peak_charge_watts, d.peak_discharge_watts)), 500);

  return (
    <div className="space-y-6">
      {/* ── Range Selector Header ── */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-[#1e1e22] border border-white/10 p-4 rounded-xl">
        <div>
          <h2 className="font-serif text-xl text-white font-normal">Battery Energy & Power Trends</h2>
          <p className="text-xs text-neutral-400 font-mono mt-0.5">
            Historical charge vs discharge throughput and peak stress metrics
          </p>
        </div>

        <div className="flex items-center gap-1 bg-neutral-900 p-1 rounded-lg border border-white/5 font-mono text-xs">
          {[7, 14, 30].map((d) => (
            <button
              key={d}
              onClick={() => setRangeDays(d)}
              className={`px-3 py-1 rounded transition ${
                rangeDays === d
                  ? 'bg-[#BF3C27] text-white font-bold'
                  : 'text-neutral-400 hover:text-white'
              }`}
            >
              {d} Days
            </button>
          ))}
        </div>
      </div>

      {/* ── Daily Energy Chart ── */}
      <div className="bg-[#1e1e22] border border-white/10 rounded-xl p-6 shadow-sm">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h3 className="font-serif text-base text-white">Daily Energy Throughput (kWh)</h3>
            <p className="text-xs text-neutral-400 font-mono">Comparison of daily recharge vs consumption</p>
          </div>
          <div className="flex items-center gap-4 text-xs font-mono">
            <span className="flex items-center gap-1.5 text-emerald-400">
              <span className="w-2.5 h-2.5 rounded bg-emerald-500"></span> Charged (In)
            </span>
            <span className="flex items-center gap-1.5 text-amber-400">
              <span className="w-2.5 h-2.5 rounded bg-amber-500"></span> Discharged (Out)
            </span>
          </div>
        </div>

        {loading ? (
          <div className="h-48 flex items-center justify-center font-mono text-xs text-neutral-400 animate-pulse">
            Loading historical energy metrics...
          </div>
        ) : days.length === 0 ? (
          <div className="h-48 flex items-center justify-center font-mono text-xs text-neutral-500">
            No daily data available for this range yet.
          </div>
        ) : (
          <div className="h-48 flex items-end gap-3 pt-6 border-b border-white/10">
            {days.map((d) => {
              const chgPct = (d.kwh_charged / maxKwh) * 100;
              const disPct = (d.kwh_discharged / maxKwh) * 100;
              return (
                <div key={d.date} className="flex-1 flex flex-col items-center h-full justify-end group relative">
                  <div className="w-full flex items-end justify-center gap-1 h-full">
                    <div
                      style={{ height: `${Math.max(chgPct, 5)}%` }}
                      className="w-1/2 bg-emerald-500/80 hover:bg-emerald-400 rounded-t transition"
                      title={`${d.date} Charged: ${d.kwh_charged.toFixed(2)} kWh`}
                    />
                    <div
                      style={{ height: `${Math.max(disPct, 5)}%` }}
                      className="w-1/2 bg-amber-500/80 hover:bg-amber-400 rounded-t transition"
                      title={`${d.date} Discharged: ${d.kwh_discharged.toFixed(2)} kWh`}
                    />
                  </div>
                  <span className="text-[10px] text-neutral-500 font-mono mt-2 truncate w-full text-center">
                    {d.date.substring(5)}
                  </span>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* ── Daily SOC Depth of Discharge (DOD) Swing ── */}
      <div className="bg-[#1e1e22] border border-white/10 rounded-xl p-6 shadow-sm">
        <h3 className="font-serif text-base text-white mb-1">State of Charge (SOC) Daily Operating Range</h3>
        <p className="text-xs text-neutral-400 font-mono mb-6">
          Minimum and maximum battery SOC observed per day (Depth of Discharge cycle wear)
        </p>

        <div className="space-y-3">
          {days.map((d) => (
            <div key={d.date} className="flex items-center gap-4 font-mono text-xs">
              <span className="w-20 text-neutral-400 text-[11px]">{d.date.substring(5)}</span>
              <div className="flex-1 h-3 bg-neutral-900 rounded-full relative overflow-hidden">
                <div
                  style={{
                    left: `${d.min_soc}%`,
                    width: `${Math.max(d.soc_swing, 4)}%`,
                  }}
                  className="absolute top-0 bottom-0 bg-gradient-to-r from-amber-500 to-emerald-400 rounded-full"
                />
              </div>
              <span className="w-24 text-right text-neutral-300 text-[11px]">
                {d.min_soc}% → {d.max_soc}% ({d.soc_swing}%)
              </span>
            </div>
          ))}
        </div>
      </div>

      {/* ── Peak Power Spikes ── */}
      <div className="bg-[#1e1e22] border border-white/10 rounded-xl p-6 shadow-sm">
        <h3 className="font-serif text-base text-white mb-1">Peak Power Spikes (Watts)</h3>
        <p className="text-xs text-neutral-400 font-mono mb-4">
          Highest discharge surge watts vs maximum charge intake per day
        </p>

        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-3">
          {days.slice(-8).map((d) => (
            <div key={d.date} className="bg-neutral-900/60 p-3 rounded-lg border border-white/5 font-mono text-xs">
              <span className="text-neutral-400 text-[11px] block mb-1">{d.date}</span>
              <div className="flex items-center justify-between text-amber-400">
                <span>Peak Load:</span>
                <span className="font-bold">-{d.peak_discharge_watts} W</span>
              </div>
              <div className="flex items-center justify-between text-emerald-400 mt-1">
                <span>Peak Charge:</span>
                <span className="font-bold">+{d.peak_charge_watts} W</span>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
