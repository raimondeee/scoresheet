import { useMemo, useState, type FormEvent } from 'react';
import { byNumber } from '../hockey.ts';
import { useApp } from '../store.tsx';
import type { Position } from '../types.ts';

const POSITIONS: Position[] = ['F', 'D', 'G'];

export function Roster() {
  const app = useApp();
  const roster = useMemo(() => [...app.state.roster].sort(byNumber), [app.state.roster]);
  const [id, setId] = useState<string | undefined>(undefined);
  const [number, setNumber] = useState('');
  const [first, setFirst] = useState('');
  const [last, setLast] = useState('');
  const [position, setPosition] = useState<Position>('F');
  const [error, setError] = useState('');

  function reset() {
    setId(undefined);
    setNumber('');
    setFirst('');
    setLast('');
    setPosition('F');
    setError('');
  }

  function save(event: FormEvent) {
    event.preventDefault();
    if (!number.trim() || !last.trim()) {
      setError('Number and last name are required.');
      return;
    }
    const duplicate = roster.some((player) => player.number === number.trim() && player.id !== id);
    if (duplicate) {
      setError(`#${number.trim()} is already on the roster.`);
      return;
    }
    app.savePlayer({ id, number: number.trim(), first: first.trim(), last: last.trim(), position });
    reset();
  }

  return (
    <div className="page">
      <div className="page-head">
        <p className="kicker">Team</p>
        <h1>Roster</h1>
      </div>
      <label className="field card">
        Team name
        <input value={app.state.teamName} onChange={(event) => app.setTeamName(event.target.value)} />
      </label>
      <form className="card stack" onSubmit={save}>
        <h2>{id ? 'Edit player' : 'Add player'}</h2>
        <div className="form-grid">
          <label className="field">
            Number
            <input value={number} onChange={(event) => setNumber(event.target.value)} inputMode="numeric" />
          </label>
          <label className="field">
            Position
            <select value={position} onChange={(event) => setPosition(event.target.value as Position)}>
              {POSITIONS.map((item) => (
                <option key={item} value={item}>
                  {item === 'F' ? 'Forward' : item === 'D' ? 'Defense' : 'Goalie'}
                </option>
              ))}
            </select>
          </label>
          <label className="field">
            First name
            <input value={first} onChange={(event) => setFirst(event.target.value)} />
          </label>
          <label className="field">
            Last name
            <input value={last} onChange={(event) => setLast(event.target.value)} />
          </label>
        </div>
        {error ? <p className="bad">{error}</p> : null}
        <div className="row">
          <button type="submit" className="btn btn-green">
            {id ? 'Save player' : 'Add player'}
          </button>
          {id ? (
            <button type="button" className="btn btn-ghost" onClick={reset}>
              Cancel edit
            </button>
          ) : null}
        </div>
      </form>
      <div className="stack">
        {roster.map((player) => (
          <article key={player.id} className="resume">
            <div>
              <strong>
                #{player.number} {player.first} {player.last}
              </strong>
              <p>{player.position === 'F' ? 'Forward' : player.position === 'D' ? 'Defense' : 'Goalie'}</p>
            </div>
            <div className="row">
              <button
                type="button"
                className="btn btn-ghost"
                onClick={() => {
                  setId(player.id);
                  setNumber(player.number);
                  setFirst(player.first);
                  setLast(player.last);
                  setPosition(player.position);
                  setError('');
                }}
              >
                Edit
              </button>
              <button type="button" className="btn btn-danger" onClick={() => app.deletePlayer(player.id)}>
                Delete
              </button>
            </div>
          </article>
        ))}
      </div>
    </div>
  );
}
