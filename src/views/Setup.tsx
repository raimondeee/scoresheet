import { useMemo, useState, type FormEvent } from 'react';
import { byNumber } from '../hockey.ts';
import { useApp } from '../store.tsx';
import type { NewGame } from '../types.ts';

function today() {
  const date = new Date();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${date.getFullYear()}-${month}-${day}`;
}

function split(ms: number) {
  const total = Math.round(ms / 1000);
  return { minutes: Math.floor(total / 60), seconds: total % 60 };
}

function join(minutes: number, seconds: number) {
  return (Math.max(0, minutes) * 60 + Math.max(0, Math.min(59, seconds))) * 1000;
}

function ClockPair({
  label,
  value,
  onChange,
}: {
  label: string;
  value: number;
  onChange: (ms: number) => void;
}) {
  const parts = split(value);
  return (
    <div className="length-line">
      <span>{label}</span>
      <div className="length-time">
        <input
          type="number"
          min={0}
          aria-label={`${label} minutes`}
          value={parts.minutes}
          onChange={(event) => onChange(join(Number(event.target.value), parts.seconds))}
        />
        <span aria-hidden="true">:</span>
        <input
          type="number"
          min={0}
          max={59}
          aria-label={`${label} seconds`}
          value={parts.seconds}
          onChange={(event) => onChange(join(parts.minutes, Number(event.target.value)))}
        />
      </div>
    </div>
  );
}

export function Setup() {
  const app = useApp();
  const roster = useMemo(() => [...app.state.roster].sort(byNumber), [app.state.roster]);
  const goalies = roster.filter((player) => player.position === 'G');
  const [opponent, setOpponent] = useState('');
  const [date, setDate] = useState(today);
  const [homeAway, setHomeAway] = useState<'home' | 'away'>('home');
  const [youtubeUrl, setYoutubeUrl] = useState('');
  const [periods, setPeriods] = useState<[number, number, number]>([900000, 900000, 900000]);
  const [ot, setOt] = useState(300000);
  const [minor, setMinor] = useState(120000);
  const [major, setMajor] = useState(240000);
  const [misconduct, setMisconduct] = useState(600000);
  const [goalieId, setGoalieId] = useState(goalies[0]?.id ?? '');
  const [dressed, setDressed] = useState<string[]>(roster.map((player) => player.id));
  const [error, setError] = useState('');

  function toggle(id: string) {
    setDressed((current) => (current.includes(id) ? current.filter((item) => item !== id) : [...current, id]));
  }

  function chooseGoalie(id: string) {
    setGoalieId(id);
    if (id) setDressed((current) => (current.includes(id) ? current : [...current, id]));
  }

  function submit(event: FormEvent) {
    event.preventDefault();
    if (!opponent.trim()) {
      setError('Enter the opponent.');
      return;
    }
    if (periods.some((length) => length <= 0)) {
      setError('Each period needs a length.');
      return;
    }
    if (goalies.length && goalieId && !dressed.includes(goalieId)) {
      setError('The starting goalie has to be dressed.');
      return;
    }
    const input: NewGame = {
      opponent,
      date,
      homeAway,
      youtubeUrl,
      periodLengthsMs: periods,
      otLengthMs: ot || 300000,
      penaltyLengthsMs: { minor, major, misconduct },
      goalieId: goalieId || null,
      dressedIds: dressed,
    };
    app.create(input);
  }

  return (
    <form className="page" onSubmit={submit}>
      <div className="page-head">
        <p className="kicker">New game</p>
        <h1>Game setup</h1>
        <p className="lede">This goes straight to the scoring page. The clock starts paused.</p>
      </div>
      <section className="card stack">
        <label className="field">
          Opponent
          <input value={opponent} onChange={(event) => setOpponent(event.target.value)} placeholder="Seattle Jr. Kraken" />
        </label>
        <div className="form-grid">
          <label className="field">
            Date
            <input type="date" value={date} onChange={(event) => setDate(event.target.value)} />
          </label>
          <label className="field">
            Home / away
            <select value={homeAway} onChange={(event) => setHomeAway(event.target.value as 'home' | 'away')}>
              <option value="home">Home</option>
              <option value="away">Away</option>
            </select>
          </label>
        </div>
        <label className="field">
          YouTube link
          <input
            value={youtubeUrl}
            onChange={(event) => setYoutubeUrl(event.target.value)}
            placeholder="https://www.youtube.com/watch?v=…"
          />
        </label>
        <div className="length-columns">
          <div className="length-column">
            <h2>Periods</h2>
            {([0, 1, 2] as const).map((index) => (
              <ClockPair
                key={index}
                label={`${['1st', '2nd', '3rd'][index]} Period`}
                value={periods[index]}
                onChange={(ms) => setPeriods((current) => current.map((item, i) => (i === index ? ms : item)) as [number, number, number])}
              />
            ))}
            <ClockPair label="Overtime" value={ot} onChange={setOt} />
          </div>
          <div className="length-column">
            <h2>Penalties</h2>
            <ClockPair label="Minor" value={minor} onChange={setMinor} />
            <ClockPair label="Major" value={major} onChange={setMajor} />
            <ClockPair label="Misconduct" value={misconduct} onChange={setMisconduct} />
          </div>
        </div>
        <div>
          <h2>Starting goalie</h2>
          <div className="picks">
            <button type="button" className={goalieId ? 'pick' : 'pick on'} onClick={() => setGoalieId('')}>
              <b>—</b>
              <span>Empty net</span>
              <small>Start</small>
            </button>
            {goalies.map((player) => (
              <button
                type="button"
                key={player.id}
                className={goalieId === player.id ? 'pick goalie on' : 'pick goalie'}
                onClick={() => chooseGoalie(player.id)}
              >
                <b>#{player.number}</b>
                <span>{player.last}</span>
                <small>{player.position}</small>
              </button>
            ))}
          </div>
        </div>
        <div>
          <div className="spread">
            <h2>Dressed</h2>
            <button type="button" className="text-btn" onClick={() => setDressed(roster.map((player) => player.id))}>
              Dress everyone
            </button>
          </div>
          <div className="picks">
            {roster.map((player) => (
              <button
                type="button"
                key={player.id}
                className={`pick${player.position === 'G' ? ' goalie' : ''}${dressed.includes(player.id) ? ' on' : ''}`}
                onClick={() => toggle(player.id)}
              >
                <b>#{player.number}</b>
                <span>{player.last}</span>
                <small>{player.position}</small>
              </button>
            ))}
          </div>
        </div>
        {error ? <p className="bad">{error}</p> : null}
        <div className="row">
          <button type="submit" className="btn btn-green">
            Start game
          </button>
          <button type="button" className="btn btn-ghost" onClick={() => app.open('home')}>
            Cancel
          </button>
        </div>
      </section>
    </form>
  );
}
