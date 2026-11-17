import React from 'react';

export type ActivePage = 'live' | 'calendar' | 'trends' | 'cells' | 'settings';

interface NavigationProps {
  activePage: ActivePage;
  onSelectPage: (page: ActivePage) => void;
  isWsLive: boolean;
}

export default function Navigation({ activePage, onSelectPage, isWsLive }: NavigationProps) {
  const navItems: Array<{
    id: ActivePage;
    label: string;
    icon: (isActive: boolean) => React.ReactNode;
    showLiveBadge?: boolean;
  }> = [
    {
      id: 'live',
      label: 'Monitor',
      showLiveBadge: isWsLive,
      icon: (isActive) => (
        <svg
          className={`w-6 h-6 transition-transform ${isActive ? 'scale-110' : ''}`}
          viewBox="0 0 24 24"
          fill={isActive ? 'currentColor' : 'none'}
          stroke="currentColor"
          strokeWidth={isActive ? '0' : '2'}
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <path d="M13 2L3 14h9l-1 8 10-12h-9l1-8z" />
        </svg>
      ),
    },
    {
      id: 'calendar',
      label: 'History',
      icon: (isActive) => (
        <svg
          className={`w-6 h-6 transition-transform ${isActive ? 'scale-110' : ''}`}
          viewBox="0 0 24 24"
          fill={isActive ? 'currentColor' : 'none'}
          stroke="currentColor"
          strokeWidth={isActive ? '1.5' : '2'}
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <rect x="3" y="4" width="18" height="18" rx="3" ry="3" />
          <line x1="16" y1="2" x2="16" y2="6" />
          <line x1="8" y1="2" x2="8" y2="6" />
          <line x1="3" y1="10" x2="21" y2="10" />
        </svg>
      ),
    },
    {
      id: 'trends',
      label: 'Trends',
      icon: (isActive) => (
        <svg
          className={`w-6 h-6 transition-transform ${isActive ? 'scale-110' : ''}`}
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth={isActive ? '2.5' : '2'}
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <polyline points="22 12 18 12 15 21 9 3 6 12 2 12" />
        </svg>
      ),
    },
    {
      id: 'cells',
      label: 'Cell Health',
      icon: (isActive) => (
        <svg
          className={`w-6 h-6 transition-transform ${isActive ? 'scale-110' : ''}`}
          viewBox="0 0 24 24"
          fill={isActive ? 'currentColor' : 'none'}
          stroke="currentColor"
          strokeWidth={isActive ? '1.5' : '2'}
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <rect x="2" y="7" width="20" height="14" rx="2" ry="2" />
          <path d="M16 21V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v16" />
        </svg>
      ),
    },
    {
      id: 'settings',
      label: 'Settings',
      icon: (isActive) => (
        <svg
          className={`w-6 h-6 transition-transform ${isActive ? 'scale-110' : ''}`}
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth={isActive ? '2.5' : '2'}
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <circle cx="12" cy="12" r="3" />
          <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z" />
        </svg>
      ),
    },
  ];

  return (
    <nav className="fixed bottom-0 left-0 right-0 z-50 bg-[#121214]/92 backdrop-blur-xl border-t border-white/10 shadow-2xl">
      <div className="max-w-lg mx-auto flex items-center justify-around h-16 px-3">
        {navItems.map((item) => {
          const isActive = activePage === item.id;
          return (
            <button
              key={item.id}
              onClick={() => onSelectPage(item.id)}
              className={`relative flex flex-col items-center justify-center flex-1 py-1.5 transition-all duration-150 active:scale-90 cursor-pointer ${
                isActive ? 'text-[#E2583E]' : 'text-neutral-400 hover:text-neutral-200'
              }`}
            >
              {/* Notification badge / Live pulse */}
              {item.showLiveBadge && (
                <span className="absolute top-1.5 right-1/4 w-2 h-2 rounded-full bg-emerald-400 ring-2 ring-[#121214] animate-pulse" />
              )}

              <div className="flex items-center justify-center h-6 mb-1">
                {item.icon(isActive)}
              </div>

              <span
                className={`text-[10px] tracking-tight font-sans transition-colors ${
                  isActive ? 'font-bold text-white' : 'font-normal text-neutral-400'
                }`}
              >
                {item.label}
              </span>

              {/* Active Instagram indicator dot */}
              {isActive && (
                <span className="w-1 h-1 rounded-full bg-[#E2583E] mt-0.5" />
              )}
            </button>
          );
        })}
      </div>
    </nav>
  );
}
