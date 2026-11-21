import type { Player } from '../types.ts';

export function PlayerGrid({
  players,
  selected = [],
  badges = {},
  onPick,
}: {
  players: Player[];
  selected?: string[];
  badges?: Record<string, string>;
  onPick: (id: string) => void;
}) {
  if (!players.length) return <p className="empty">No dressed skaters. Open Dressed and check who is playing.</p>;
  return (
    <div className="picks">
      {players.map((player) => {
        const on = selected.includes(player.id);
        return (
          <button
            key={player.id}
            type="button"
            className={`pick${player.position === 'G' ? ' goalie' : ''}${on ? ' on' : ''}`}
            onClick={() => onPick(player.id)}
          >
            <b>#{player.number}</b>
            <span>{player.last}</span>
            <small>{badges[player.id] || `${player.first} · ${player.position}`}</small>
          </button>
        );
      })}
    </div>
  );
}
