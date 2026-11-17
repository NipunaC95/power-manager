import React from 'react';

export type ActivePage = 'live' | 'calendar' | 'trends' | 'cells' | 'settings';

interface NavigationProps {
  activePage: ActivePage;
  onSelectPage: (page: ActivePage) => void;
  isWsLive: boolean;
}

export default function Navigation({ activePage, onSelectPage, isWsLive }: NavigationProps) {
  const navItems: Array<{ id: ActivePage; label: string; icon: string; badge?: string }> = [
    { id: 'live', label: 'Live Monitor', icon: '⚡', badge: isWsLive ? 'LIVE' : undefined },
    { id: 'calendar', label: 'Calendar & Usages', icon: '📅' },
    { id: 'trends', label: 'Energy & Trends', icon: '📈' },
    { id: 'cells', label: 'Cell Health', icon: '🔬' },
    { id: 'settings', label: 'System & Sync', icon: '⚙️' },
  ];

  return (
    <nav className="flex items-center gap-1.5 overflow-x-auto pb-2 border-b border-white/10 mb-8 scrollbar-none">
      {navItems.map((item) => {
        const isActive = activePage === item.id;
        return (
          <button
            key={item.id}
            onClick={() => onSelectPage(item.id)}
            className={`px-3.5 py-2 rounded-lg font-mono text-xs flex items-center gap-2 whitespace-nowrap transition cursor-pointer ${
              isActive
                ? 'bg-[#BF3C27] text-white font-bold shadow-md'
                : 'zed-btn-neutral text-neutral-400 hover:text-white'
            }`}
          >
            <span>{item.icon}</span>
            <span>{item.label}</span>
            {item.badge && (
              <span className="text-[9px] bg-emerald-500/30 text-emerald-300 px-1.5 py-0.2 rounded font-bold animate-pulse">
                {item.badge}
              </span>
            )}
          </button>
        );
      })}
    </nav>
  );
}

