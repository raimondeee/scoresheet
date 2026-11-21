import { STAT_TIPS, StatHead, StatTip } from '../components/StatTip.tsx';
import { formatMin, formatPim } from '../hockey.ts';
import { buildSeason, gaa, pct, perGame, shootPct, svPct } from '../stats.ts';
import { useApp } from '../store.tsx';

export function Stats() {
  const app = useApp();
  const { team, skaters, goalies } = buildSeason(app.state.games, app.state.roster);
  return (
    <div className="page">
      <div className="page-head">
        <p className="kicker">Final games</p>
        <h1>Season stats</h1>
        <p className="lede">Totals come from finalized games. Plus/minus follows even-strength and shorthanded goals only.</p>
      </div>
      <div className="stat-grid">
        <article className="card stat">
          <span>
            <StatTip label="Games" tip={STAT_TIPS.Games} />
          </span>
          <strong>{team.games}</strong>
        </article>
        <article className="card stat">
          <span>
            <StatTip label="Record" tip={STAT_TIPS.Record} />
          </span>
          <strong>
            {team.wins}–{team.losses}–{team.ties}
          </strong>
        </article>
        <article className="card stat">
          <span>
            <StatTip label="GF / GA" tip={STAT_TIPS['GF / GA']} />
          </span>
          <strong>
            {team.gf} / {team.ga}
          </strong>
        </article>
        <article className="card stat">
          <span>
            <StatTip label="Goal diff" tip={STAT_TIPS['Goal diff']} />
          </span>
          <strong className={team.gf - team.ga > 0 ? 'good' : team.gf - team.ga < 0 ? 'bad' : ''}>
            {team.gf - team.ga > 0 ? `+${team.gf - team.ga}` : team.gf - team.ga}
          </strong>
        </article>
      </div>
      <section className="card">
        <h2>Special teams</h2>
        <p>
          Power play {team.ppGoals}/{team.ppOpps} ({pct(team.ppGoals, team.ppOpps)}) · Penalty kill{' '}
          {Math.max(0, team.pkOpps - team.ppAgainst)}/{team.pkOpps} ({pct(Math.max(0, team.pkOpps - team.ppAgainst), team.pkOpps)})
        </p>
        <p className="muted">
          Shorthanded goals {team.shGoals} · Shorthanded goals allowed {team.shAgainst} · Power-play goals against {team.ppAgainst}
        </p>
        <p className="muted">Shots {team.sog} for, {team.oppSog} against.</p>
      </section>
      <section className="card">
        <h2>Skaters</h2>
        {skaters.length === 0 ? <p className="empty">Finalize a game to see skater totals.</p> : null}
        <div className="table-wrap">
          <table className="stats">
            <thead>
              <tr>
                {['Player', 'GP', 'G', 'A', 'PTS', 'PTS/GP', 'SOG', 'SH%', 'PPG', 'SHG', 'GWG', 'PIM', '+/−', 'Highlights'].map(
                  (name) => (
                    <StatHead key={name} name={name} />
                  ),
                )}
              </tr>
            </thead>
            <tbody>
              {skaters.map((line) => (
                <tr key={line.id}>
                  <td>
                    #{line.number} {line.name}
                  </td>
                  <td>{line.gp}</td>
                  <td>{line.g}</td>
                  <td>{line.a}</td>
                  <td>{line.pts}</td>
                  <td>{perGame(line.pts, line.gp)}</td>
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
        <p className="muted">
          PTS/GP is points per game. SH% is goals divided by shots. PPG and SHG are power-play and shorthanded goals. GWG is the goal that reached one more than the opponent’s final total in a win. Highlights are goals and assists.
        </p>
      </section>
      <section className="card">
        <h2>Goalies</h2>
        {goalies.length === 0 ? <p className="empty">Finalize a game to see goalie totals.</p> : null}
        <div className="table-wrap">
          <table className="stats">
            <thead>
              <tr>
                {['Goalie', 'GP', 'MIN', 'W', 'L', 'T', 'SA', 'SV', 'GA', 'SV%', 'GAA'].map((name) => (
                  <StatHead key={name} name={name} />
                ))}
              </tr>
            </thead>
            <tbody>
              {goalies.map((line) => (
                <tr key={line.id}>
                  <td>
                    #{line.number} {line.name}
                  </td>
                  <td>{line.gp}</td>
                  <td>{formatMin(line.minMs)}</td>
                  <td>{line.w}</td>
                  <td>{line.l}</td>
                  <td>{line.t}</td>
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
      </section>
    </div>
  );
}
