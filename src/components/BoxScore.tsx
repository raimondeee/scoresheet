import { StatHead } from './StatTip.tsx';
import { formatMin, formatPim } from '../hockey.ts';
import { buildBox, gaa, shootPct, svPct } from '../stats.ts';
import type { Game, Player } from '../types.ts';

export function BoxScore({ game, roster }: { game: Game; roster: Player[] }) {
  const box = buildBox(game, roster);
  return (
    <div className="stack">
      <div className="table-wrap">
        <table className="stats">
          <thead>
            <tr>
              {['Player', 'G', 'A', 'PTS', 'SOG', 'SH%', 'PPG', 'SHG', 'GWG', 'PIM', '+/−', 'Highlights'].map((name) => (
                <StatHead key={name} name={name} />
              ))}
            </tr>
          </thead>
          <tbody>
            {box.skaters.map((line) => (
              <tr key={line.id}>
                <td>
                  #{line.number} {line.name}
                </td>
                <td>{line.g}</td>
                <td>{line.a}</td>
                <td>{line.pts}</td>
                <td>{line.sog}</td>
                <td>{shootPct(line.g, line.sog)}</td>
                <td>{line.ppg}</td>
                <td>{line.shg}</td>
                <td>{line.gwg}</td>
                <td>{formatPim(line.pimMs)}</td>
                <td className={line.plusMinus > 0 ? 'good' : line.plusMinus < 0 ? 'bad' : ''}>
                  {line.plusMinus > 0 ? `+${line.plusMinus}` : line.plusMinus}
                </td>
                <td>{line.highlights}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="table-wrap">
        <table className="stats">
          <thead>
            <tr>
              {['Goalie', 'MIN', 'SA', 'SV', 'GA', 'SV%', 'GAA'].map((name) => (
                <StatHead key={name} name={name} />
              ))}
            </tr>
          </thead>
          <tbody>
            {box.goalies.map((line) => (
              <tr key={line.id}>
                <td>
                  #{line.number} {line.name}
                  {game.starterGoalieId === line.id ? ' · starter' : ''}
                </td>
                <td>{formatMin(line.minMs)}</td>
                <td>{line.sa}</td>
                <td>{line.sv}</td>
                <td>{line.ga}</td>
                <td>{svPct(line.sv, line.sa)}</td>
                <td>{gaa(line.ga, line.minMs)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
