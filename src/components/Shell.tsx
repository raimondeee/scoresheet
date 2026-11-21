import type { ReactNode } from 'react';
import type { View } from '../types.ts';

const NAV: Array<{ id: View; label: string }> = [
  { id: 'home', label: 'Home' },
  { id: 'live', label: 'Live' },
  { id: 'games', label: 'Games' },
  { id: 'film', label: 'Film' },
  { id: 'stats', label: 'Stats' },
  { id: 'roster', label: 'Roster' },
];

export function Shell({
  tone,
  view,
  teamName,
  saveStatus,
  hasLive,
  onNav,
  children,
}: {
  tone: 'running' | 'paused' | 'neutral';
  view: View;
  teamName: string;
  saveStatus: 'saving' | 'saved' | 'local';
  hasLive: boolean;
  onNav: (view: View) => void;
  children: ReactNode;
}) {
  const saveLabel =
    saveStatus === 'saving' ? 'Saving…' : saveStatus === 'saved' ? 'Saved to scorekeeper.json' : 'Saved in this browser';
  return (
    <div className={`app tone-${tone}`}>
      <header className="topbar">
        <div className="brand">
          <span className="mark">PJW</span>
          <div>
            <strong>Scorekeeper</strong>
            <small>{teamName}</small>
          </div>
        </div>
        <span className={`save-chip ${saveStatus}`}>{saveLabel}</span>
      </header>
      <main className="main">{children}</main>
      <nav className="nav">
        {NAV.map((item) => (
          <button
            key={item.id}
            type="button"
            className={view === item.id ? 'nav-btn on' : 'nav-btn'}
            aria-current={view === item.id ? 'page' : undefined}
            disabled={item.id === 'live' && !hasLive && view !== 'live'}
            onClick={() => onNav(item.id)}
          >
            {item.label}
          </button>
        ))}
      </nav>
    </div>
  );
}
