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

interface MonthlySummary {
  total_kwh_discharged: number;
  total_kwh_charged: number;
  net_kwh: number;
  total_cycles: number;
  days_with_data: number;
  avg_daily_kwh: number;
  peak_usage_day: { date: string; kwh_discharged: number } | null;
}

interface HourlyData {
  hour_bucket: string;
  kwh_charged: number;
  kwh_discharged: number;
  net_kwh: number;
  avg_voltage: number;
  avg_current: number;
  avg_soc: number;
  max_cell_diff: number;
}

const MONTH_NAMES = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December'
];

const DAYS_OF_WEEK = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

export default function CalendarView() {
  const today = new Date();
  const [currentYear, setCurrentYear] = useState(today.getFullYear());
  const [currentMonth, setCurrentMonth] = useState(today.getMonth() + 1); // 1-indexed
  const [daysMap, setDaysMap] = useState<Map<string, DailyData>>(new Map());
  const [summary, setSummary] = useState<MonthlySummary | null>(null);
  const [loading, setLoading] = useState(true);

  // Day drilldown modal
  const [selectedDay, setSelectedDay] = useState<DailyData | null>(null);
  const [hourlyData, setHourlyData] = useState<HourlyData[]>([]);
  const [loadingHourly, setLoadingHourly] = useState(false);

  const fetchMonthData = async (year: number, month: number) => {
    setLoading(true);
    try {
      const res = await fetch(`/api/analytics/month?year=${year}&month=${month}`);
      const data = await res.json();
      setSummary(data.summary || null);

      const map = new Map<string, DailyData>();
      if (Array.isArray(data.days)) {
        data.days.forEach((d: DailyData) => {
          map.set(d.date, d);
        });
      }
      setDaysMap(map);
    } catch (err) {
      console.error('Failed to fetch monthly calendar data:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchMonthData(currentYear, currentMonth);
  }, [currentYear, currentMonth]);

  const handlePrevMonth = () => {
    if (currentMonth === 1) {
      setCurrentMonth(12);
      setCurrentYear(currentYear - 1);
    } else {
      setCurrentMonth(currentMonth - 1);
    }
  };

  const handleNextMonth = () => {
    if (currentMonth === 12) {
      setCurrentMonth(1);
      setCurrentYear(currentYear + 1);
    } else {
      setCurrentMonth(currentMonth + 1);
    }
  };

  const handleCurrentMonth = () => {
    setCurrentYear(today.getFullYear());
    setCurrentMonth(today.getMonth() + 1);
  };

  const handleSelectDay = async (dayData: DailyData) => {
    setSelectedDay(dayData);
    setLoadingHourly(true);
    try {
      const res = await fetch(`/api/analytics/hourly?date=${dayData.date}`);
      const data = await res.json();
      setHourlyData(Array.isArray(data) ? data : []);
    } catch (err) {
      console.error('Failed to load hourly drilldown:', err);
    } finally {
      setLoadingHourly(false);
    }
  };

  // Build calendar matrix
  const firstDayOfWeek = new Date(currentYear, currentMonth - 1, 1).getDay(); // 0 = Sun
  const daysInMonth = new Date(currentYear, currentMonth, 0).getDate();
  const calendarCells = [];

  // Padding for previous month
  for (let i = 0; i < firstDayOfWeek; i++) {
    calendarCells.push(null);
  }

  // Days of the month
  for (let day = 1; day <= daysInMonth; day++) {
    const dateStr = `${currentYear}-${String(currentMonth).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
    calendarCells.push({
      day,
      date: dateStr,
      data: daysMap.get(dateStr) || null,
    });
  }

  const isCurrentMonthActive = currentYear === today.getFullYear() && currentMonth === (today.getMonth() + 1);
  const todayStr = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;

  return (
    <div className="bg-[#1e1e22] border border-white/10 rounded-xl p-6 mb-8 shadow-sm">
      {/* ── Calendar Controls & Month Header ── */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-white/10 pb-5 mb-6">
        <div>
          <div className="flex items-center gap-3">
            <span className="text-xl">📅</span>
            <h2 className="font-serif text-xl sm:text-2xl text-white font-normal">
              {MONTH_NAMES[currentMonth - 1]} <span className="text-neutral-400 font-light">{currentYear}</span>
            </h2>
          </div>
          <p className="text-xs text-neutral-400 font-mono mt-1">
            Daily battery discharge usage, recharge statistics & cycle history
          </p>
        </div>

        {/* Navigation buttons */}
        <div className="flex items-center gap-2">
          <button
            onClick={handlePrevMonth}
            className="zed-btn-neutral px-3 py-1 rounded text-xs font-mono text-neutral-300 hover:text-white transition"
            title="Previous Month"
          >
            ◀ Prev
          </button>
          {!isCurrentMonthActive && (
            <button
              onClick={handleCurrentMonth}
              className="zed-btn-neutral px-3 py-1 rounded text-xs font-mono text-neutral-300 hover:text-white transition"
            >
              Today
            </button>
          )}
          <button
            onClick={handleNextMonth}
            className="zed-btn-neutral px-3 py-1 rounded text-xs font-mono text-neutral-300 hover:text-white transition"
            title="Next Month"
          >
            Next ▶
          </button>
        </div>
      </div>

      {/* ── Monthly Summary Ribbon ── */}
      {summary && (
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3 mb-6 font-mono text-xs">
          <div className="bg-neutral-900/60 border border-white/5 p-3 rounded-lg">
            <span className="text-[10px] text-neutral-400 block mb-1">TOTAL USAGE (OUT)</span>
            <span className="text-sm font-bold text-amber-400">{summary.total_kwh_discharged} kWh</span>
          </div>
          <div className="bg-neutral-900/60 border border-white/5 p-3 rounded-lg">
            <span className="text-[10px] text-neutral-400 block mb-1">TOTAL CHARGED (IN)</span>
            <span className="text-sm font-bold text-emerald-400">{summary.total_kwh_charged} kWh</span>
          </div>
          <div className="bg-neutral-900/60 border border-white/5 p-3 rounded-lg">
            <span className="text-[10px] text-neutral-400 block mb-1">NET BALANCE</span>
            <span className={`text-sm font-bold ${summary.net_kwh >= 0 ? 'text-emerald-400' : 'text-neutral-300'}`}>
              {summary.net_kwh > 0 ? `+${summary.net_kwh}` : summary.net_kwh} kWh
            </span>
          </div>
          <div className="bg-neutral-900/60 border border-white/5 p-3 rounded-lg">
            <span className="text-[10px] text-neutral-400 block mb-1">CYCLES RUN</span>
            <span className="text-sm font-bold text-blue-400">{summary.total_cycles} EFC</span>
          </div>
          <div className="bg-neutral-900/60 border border-white/5 p-3 rounded-lg">
            <span className="text-[10px] text-neutral-400 block mb-1">DAILY AVERAGE</span>
            <span className="text-sm font-bold text-white">{summary.avg_daily_kwh} kWh/d</span>
          </div>
          <div className="bg-neutral-900/60 border border-white/5 p-3 rounded-lg">
            <span className="text-[10px] text-neutral-400 block mb-1">PEAK USAGE DAY</span>
            <span className="text-sm font-bold text-rose-400">
              {summary.peak_usage_day ? `${summary.peak_usage_day.kwh_discharged} kWh` : '--'}
            </span>
          </div>
        </div>
      )}

      {/* ── Days of Week Header ── */}
      <div className="grid grid-cols-7 gap-2 mb-2 text-center text-xs font-mono text-neutral-400 font-semibold border-b border-white/5 pb-2">
        {DAYS_OF_WEEK.map((w) => (
          <div key={w}>{w}</div>
        ))}
      </div>

      {/* ── Month Days Grid ── */}
      <div className="grid grid-cols-7 gap-2">
        {calendarCells.map((cell, idx) => {
          if (!cell) {
            return <div key={`empty-${idx}`} className="h-24 bg-transparent rounded-lg opacity-20" />;
          }

          const hasData = cell.data !== null;
          const isToday = cell.date === todayStr;

          return (
            <div
              key={cell.date}
              onClick={() => cell.data && handleSelectDay(cell.data)}
              className={`h-24 p-2 rounded-lg border transition flex flex-col justify-between font-mono relative ${
                hasData
                  ? 'bg-neutral-900/70 border-white/10 hover:border-emerald-400/50 hover:bg-neutral-800/80 cursor-pointer shadow-sm'
                  : 'bg-neutral-900/30 border-white/5 opacity-50 cursor-default'
              } ${isToday ? 'ring-2 ring-[#BF3C27]' : ''}`}
            >
              {/* Day Number Header */}
              <div className="flex items-center justify-between w-full">
                <span className={`text-xs font-bold ${isToday ? 'text-[#BF3C27]' : 'text-neutral-300'}`}>
                  {cell.day}
                </span>
                {hasData && (
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" title="Telemetry data logged" />
                )}
              </div>

              {/* Day Metrics */}
              {hasData && cell.data ? (
                <div className="space-y-1 text-[10px]">
                  {/* Energy Out (Discharge) */}
                  <div className="flex items-center justify-between text-amber-400/90 font-medium">
                    <span>Out</span>
                    <span>{cell.data.kwh_discharged.toFixed(2)}k</span>
                  </div>
                  {/* Energy In (Charge) */}
                  <div className="flex items-center justify-between text-emerald-400/90">
                    <span>In</span>
                    <span>{cell.data.kwh_charged.toFixed(2)}k</span>
                  </div>
                  {/* Cycle count pill */}
                  <div className="text-[9px] text-neutral-400 text-right truncate">
                    {cell.data.equivalent_full_cycles.toFixed(2)} cyc
                  </div>
                </div>
              ) : (
                <div className="text-[10px] text-neutral-600 text-center my-auto">
                  --
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* ── Day Details Modal ── */}
      {selectedDay && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-[#1e1e22] border border-white/15 rounded-xl p-6 max-w-2xl w-full max-h-[90vh] overflow-y-auto shadow-2xl relative font-sans">
            <button
              onClick={() => setSelectedDay(null)}
              className="absolute top-4 right-4 text-neutral-400 hover:text-white text-lg font-mono px-2 py-1"
            >
              ✕
            </button>

            {/* Modal Header */}
            <div className="flex items-center gap-3 mb-6 border-b border-white/10 pb-4">
              <span className="text-2xl">⚡</span>
              <div>
                <h3 className="font-serif text-xl text-white">
                  Daily Battery Diagnostics: <span className="font-mono text-emerald-400 font-medium">{selectedDay.date}</span>
                </h3>
                <p className="text-xs text-neutral-400 font-mono">
                  {selectedDay.total_records} telemetry snapshots aggregated on this day
                </p>
              </div>
            </div>

            {/* Daily Metrics Grid */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-6 font-mono text-xs">
              <div className="bg-neutral-900/60 p-3 rounded-lg border border-white/5">
                <span className="text-[10px] text-neutral-400 block mb-1">ENERGY DELIVERED</span>
                <span className="text-base font-bold text-amber-400">{selectedDay.kwh_discharged.toFixed(3)} kWh</span>
              </div>
              <div className="bg-neutral-900/60 p-3 rounded-lg border border-white/5">
                <span className="text-[10px] text-neutral-400 block mb-1">ENERGY CHARGED</span>
                <span className="text-base font-bold text-emerald-400">{selectedDay.kwh_charged.toFixed(3)} kWh</span>
              </div>
              <div className="bg-neutral-900/60 p-3 rounded-lg border border-white/5">
                <span className="text-[10px] text-neutral-400 block mb-1">EQUIVALENT CYCLES</span>
                <span className="text-base font-bold text-blue-400">{selectedDay.equivalent_full_cycles.toFixed(3)} EFC</span>
              </div>
              <div className="bg-neutral-900/60 p-3 rounded-lg border border-white/5">
                <span className="text-[10px] text-neutral-400 block mb-1">HEALTH SCORE</span>
                <span className="text-base font-bold text-emerald-400">{selectedDay.health_score}%</span>
              </div>

              <div className="bg-neutral-900/60 p-3 rounded-lg border border-white/5">
                <span className="text-[10px] text-neutral-400 block mb-1">SOC RANGE</span>
                <span className="text-sm font-bold text-white">{selectedDay.min_soc}% → {selectedDay.max_soc}%</span>
                <span className="text-[9px] text-neutral-400 block mt-0.5">Swing: {selectedDay.soc_swing}%</span>
              </div>
              <div className="bg-neutral-900/60 p-3 rounded-lg border border-white/5">
                <span className="text-[10px] text-neutral-400 block mb-1">PEAK POWER</span>
                <span className="text-sm font-bold text-amber-400">-{selectedDay.peak_discharge_watts} W</span>
                <span className="text-[9px] text-emerald-400 block mt-0.5">+{selectedDay.peak_charge_watts} W chg</span>
              </div>
              <div className="bg-neutral-900/60 p-3 rounded-lg border border-white/5">
                <span className="text-[10px] text-neutral-400 block mb-1">MAX CELL DELTA</span>
                <span className="text-sm font-bold text-neutral-200">{(selectedDay.max_cell_delta * 1000).toFixed(0)} mV</span>
                {selectedDay.weakest_cell_index !== null && (
                  <span className="text-[9px] text-amber-400 block mt-0.5">Weakest: C{selectedDay.weakest_cell_index + 1}</span>
                )}
              </div>
              <div className="bg-neutral-900/60 p-3 rounded-lg border border-white/5">
                <span className="text-[10px] text-neutral-400 block mb-1">PEAK TEMPS</span>
                <span className="text-sm font-bold text-rose-400">{selectedDay.highest_temp_mos.toFixed(1)}°C <span className="text-[9px] text-neutral-400">MOS</span></span>
                <span className="text-[9px] text-neutral-400 block mt-0.5">{selectedDay.highest_temp_bat.toFixed(1)}°C Bat</span>
              </div>
            </div>

            {/* 24-Hour Hourly Breakdown Chart / Table */}
            <div className="border-t border-white/10 pt-4">
              <h4 className="font-serif text-sm text-white mb-3">24-Hour Hourly Energy Breakdown</h4>

              {loadingHourly ? (
                <div className="py-6 text-center text-xs font-mono text-neutral-400 animate-pulse">
                  Loading hourly records for {selectedDay.date}...
                </div>
              ) : hourlyData.length === 0 ? (
                <div className="py-4 text-center text-xs font-mono text-neutral-500">
                  No hourly breakdown segments available for this day.
                </div>
              ) : (
                <div className="space-y-2 max-h-48 overflow-y-auto pr-1">
                  {hourlyData.map((h) => {
                    const hourTime = h.hour_bucket.substring(11, 16);
                    return (
                      <div
                        key={h.hour_bucket}
                        className="bg-neutral-900/40 border border-white/5 p-2 rounded flex items-center justify-between text-xs font-mono"
                      >
                        <div className="flex items-center gap-3">
                          <span className="text-neutral-400 font-bold">{hourTime}</span>
                          <span className="text-neutral-500">Avg V: {h.avg_voltage.toFixed(2)}V</span>
                          <span className="text-neutral-500">SOC: {h.avg_soc.toFixed(0)}%</span>
                        </div>
                        <div className="flex items-center gap-4">
                          <span className="text-amber-400">-{h.kwh_discharged.toFixed(3)} kWh</span>
                          <span className="text-emerald-400">+{h.kwh_charged.toFixed(3)} kWh</span>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            <div className="mt-6 flex justify-end">
              <button
                onClick={() => setSelectedDay(null)}
                className="zed-btn-rust px-4 py-2 rounded-lg text-xs font-mono text-white"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

