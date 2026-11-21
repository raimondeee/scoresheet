import { useEffect, useRef, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';

const HOVER_MS = 2000;

export const STAT_TIPS: Record<string, string> = {
  GP: 'Games played.',
  G: 'Goals.',
  A: 'Assists.',
  PTS: 'Points. Goals plus assists.',
  'PTS/GP': 'Points per game.',
  SOG: 'Shots on goal.',
  'SH%': 'Shooting percentage. Goals divided by shots on goal.',
  PPG: 'Power-play goals.',
  SHG: 'Shorthanded goals.',
  GWG: 'Game-winning goals. The goal that reached one more than the opponent’s final total in a win.',
  PIM: 'Penalty minutes.',
  '+/−': 'Plus/minus. Even-strength and shorthanded goals count. Power-play goals do not.',
  Highlights: 'Goals and assists. A penalty-shot goal is not included.',
  MIN: 'Minutes played.',
  W: 'Wins. The decision goes to the goalie who finished the game.',
  L: 'Losses. The decision goes to the goalie who finished the game.',
  T: 'Ties. The decision goes to the goalie who finished the game.',
  SA: 'Shots against.',
  SV: 'Saves.',
  GA: 'Goals against.',
  'SV%': 'Save percentage. Saves divided by shots against.',
  GAA: 'Goals against average, per 60 minutes.',
  Games: 'Finalized games in the season.',
  Record: 'Wins, losses, and ties.',
  'GF / GA': 'Goals for and goals against.',
  'Goal diff': 'Goals for minus goals against.',
};

export function StatTip({ label, tip, children }: { label?: string; tip: string; children?: ReactNode }) {
  const anchor = useRef<HTMLElement>(null);
  const timer = useRef<number | null>(null);
  const [place, setPlace] = useState<{ x: number; y: number; above: boolean } | null>(null);

  function clearTimer() {
    if (timer.current != null) window.clearTimeout(timer.current);
    timer.current = null;
  }

  function hide() {
    clearTimer();
    setPlace(null);
  }

  function show() {
    clearTimer();
    timer.current = window.setTimeout(() => {
      const node = anchor.current;
      if (!node) return;
      const rect = node.getBoundingClientRect();
      const width = 260;
      const x = Math.min(Math.max(rect.left + rect.width / 2, 16 + width / 2), window.innerWidth - 16 - width / 2);
      const below = rect.bottom + 8;
      const above = below + 72 > window.innerHeight;
      setPlace({ x, y: above ? rect.top - 8 : below, above });
    }, HOVER_MS);
  }

  useEffect(() => clearTimer, []);

  return (
    <span
      ref={anchor}
      className="stat-tip"
      tabIndex={0}
      onMouseEnter={show}
      onMouseLeave={hide}
      onFocus={show}
      onBlur={hide}
    >
      {children ?? label}
      {place
        ? createPortal(
            <span
              className={`stat-tip-pop${place.above ? ' above' : ''}`}
              role="tooltip"
              style={{ left: place.x, top: place.y }}
            >
              {tip}
            </span>,
            document.body,
          )
        : null}
    </span>
  );
}

export function StatHead({ name }: { name: string }) {
  const tip = STAT_TIPS[name];
  return <th>{tip ? <StatTip label={name} tip={tip} /> : name}</th>;
}
