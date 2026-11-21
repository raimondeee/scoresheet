import { useEffect, useState } from 'react';
import { formatClock, formatDate, formatGameStamp, readRemaining } from '../hockey.ts';
import { useApp } from '../store.tsx';

type SavedCopy = { name: string; savedAt: string };

export function Home() {
  const app = useApp();
  const live = app.state.games.filter((game) => game.status === 'live');
  const [discardId, setDiscardId] = useState<string | null>(null);
  const [copies, setCopies] = useState<SavedCopy[]>([]);
  const [restoreName, setRestoreName] = useState<string | null>(null);
  const discard = live.find((game) => game.id === discardId);
  const restoring = copies.find((copy) => copy.name === restoreName);
  const bookStamp = app.state.games.map((game) => `${game.id}:${game.updatedAt}:${game.events.length}`).join('|');

  useEffect(() => {
    let cancelled = false;
    fetch('/api/history')
      .then(async (response) => {
        if (!response.ok) return [];
        return (await response.json()) as SavedCopy[];
      })
      .then((list) => {
        if (!cancelled) setCopies(Array.isArray(list) ? list : []);
      })
      .catch(() => {
        if (!cancelled) setCopies([]);
      });
    return () => {
      cancelled = true;
    };
  }, [bookStamp]);

  async function restore(name: string) {
    const response = await fetch('/api/history/restore', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name }),
    });
    if (!response.ok) return;
    app.replaceBook(await response.json());
    setRestoreName(null);
  }

  return (
    <div className="page">
      <div className="page-head">
        <p className="kicker">Team home</p>
        <h1>Winterhawks</h1>
        <p className="lede">Resume a game, start a new one, or check the roster, stats, and coaches film.</p>
      </div>

      <section className="card">
        <div className="spread">
          <h2>Unfinished games</h2>
          <span className="tag">{live.length}</span>
        </div>
        {live.length === 0 ? <p className="empty">No game in progress.</p> : null}
        <div className="stack">
          {live.map((game) => (
            <article key={game.id} className="resume">
              <div>
                <strong>{game.opponent}</strong>
                <p>
                  {formatDate(game.date)} · {formatGameStamp(game.clock.period, readRemaining(game.clock, Date.now()))} ·{' '}
                  {game.scoreUs}–{game.scoreOpp}
                  {game.clock.running ? ' · clock running' : ' · paused'}
                </p>
              </div>
              <div className="row">
                <button type="button" className="btn btn-green" onClick={() => app.open('live', game.id)}>
                  Resume
                </button>
                <button type="button" className="btn btn-danger" onClick={() => setDiscardId(game.id)}>
                  Discard
                </button>
              </div>
            </article>
          ))}
        </div>
      </section>

      <button type="button" className="btn btn-green xl" onClick={() => app.open('setup')}>
        Create game
      </button>

      <div className="home-grid">
        <button type="button" className="card link-card" onClick={() => app.open('roster')}>
          <span>Roster</span>
          <strong>{app.state.roster.length} players</strong>
        </button>
        <button type="button" className="card link-card" onClick={() => app.open('games')}>
          <span>Games</span>
          <strong>{app.state.games.filter((game) => game.status === 'final').length} final</strong>
        </button>
        <button type="button" className="card link-card" onClick={() => app.open('stats')}>
          <span>Stats</span>
          <strong>Season totals</strong>
        </button>
        <button type="button" className="card link-card" onClick={() => app.open('film', null)}>
          <span>Coaches film</span>
          <strong>{app.state.filmLeadSeconds}s lead</strong>
        </button>
      </div>

      <section className="card stack">
        <h2>Earlier copies</h2>
        <p className="muted">
          A copy is kept on this computer when the book changes, not on every clock tick. The current file also lives in the git repo, so a push keeps it off this machine.
        </p>
        {copies.length === 0 ? <p className="empty">No earlier copy yet. One is saved the next time a game changes.</p> : null}
        {copies.slice(0, 8).map((copy) => (
          <div key={copy.name} className="spread">
            <span>{new Date(copy.savedAt).toLocaleString(undefined, { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })}</span>
            <button type="button" className="btn btn-ghost" onClick={() => setRestoreName(copy.name)}>
              Restore
            </button>
          </div>
        ))}
        <p className="footnote">
          You can also{' '}
          <button type="button" className="text-btn" onClick={app.download}>
            download a copy
          </button>
          .
        </p>
      </section>

      {restoring ? (
        <div className="modal-back" onMouseDown={() => setRestoreName(null)}>
          <div className="modal" role="dialog" aria-label="Restore scorebook" onMouseDown={(event) => event.stopPropagation()}>
            <h2>Restore this copy?</h2>
            <p>
              This replaces the current scorebook with the copy from{' '}
              {new Date(restoring.savedAt).toLocaleString(undefined, { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })}.
              The book you have open is saved as an earlier copy first.
            </p>
            <div className="row">
              <button type="button" className="btn btn-green" onClick={() => restore(restoring.name)}>
                Restore copy
              </button>
              <button type="button" className="btn btn-ghost" onClick={() => setRestoreName(null)}>
                Keep current
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {discard ? (
        <div className="modal-back" onMouseDown={() => setDiscardId(null)}>
          <div className="modal" role="dialog" aria-label="Discard game" onMouseDown={(event) => event.stopPropagation()}>
            <h2>Discard this game?</h2>
            <p>
              {discard.opponent} · {discard.scoreUs}–{discard.scoreOpp} · {formatClock(readRemaining(discard.clock, Date.now()))} left.
              This removes it from the scorebook.
            </p>
            <div className="row">
              <button type="button" className="btn btn-danger" onClick={() => app.discard(discard.id)}>
                Discard game
              </button>
              <button type="button" className="btn btn-ghost" onClick={() => setDiscardId(null)}>
                Keep it
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
