import { useEffect, useState } from 'react';
import {
  FILM_TYPES,
  filmHref,
  formatDate,
  formatGameStamp,
  formatVideoClock,
  parseVideoClock,
} from '../hockey.ts';
import { useApp } from '../store.tsx';

export function Film() {
  const app = useApp();
  const [filter, setFilter] = useState(app.gameId ?? 'all');
  const [url, setUrl] = useState('');
  const [anchorId, setAnchorId] = useState<string | null>(null);
  const [timeText, setTimeText] = useState('00:00:00');
  const [error, setError] = useState('');
  const games = [...app.state.games].sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  const selected = filter === 'all' ? null : games.find((game) => game.id === filter) ?? null;
  const filmEvents = selected?.events.filter((event) => FILM_TYPES.has(event.type)) ?? [];
  const anchor = filmEvents.find((event) => event.id === anchorId) ?? filmEvents[0] ?? null;

  useEffect(() => {
    setUrl(selected?.youtubeUrl ?? '');
    setAnchorId(null);
    setError('');
  }, [selected?.id, selected?.youtubeUrl]);

  useEffect(() => {
    setTimeText(anchor?.videoSeconds == null ? '00:00:00' : formatVideoClock(anchor.videoSeconds));
  }, [anchor?.id]);

  const rows = (selected ? [selected] : games).flatMap((game) =>
    game.events.filter((event) => FILM_TYPES.has(event.type)).map((event) => ({ game, event })),
  );

  function saveLink() {
    if (!selected) return;
    app.editYoutube(selected.id, url);
  }

  function align() {
    if (!selected || !anchor) return;
    const parsed = parseVideoClock(timeText);
    if (parsed == null) {
      setError('Enter the YouTube time as HH:MM:SS.');
      return;
    }
    setError('');
    app.alignFilm(selected.id, anchor.id, parsed);
  }

  return (
    <div className="page">
      <div className="page-head">
        <p className="kicker">Coaches film</p>
        <h1>YouTube tags</h1>
        <p className="lede">
          Paste the saved video, then mark where one event sits in it. The rest line up from the game clock.
        </p>
      </div>

      <section className="card stack">
        <label className="field">
          Game
          <select value={selected ? selected.id : 'all'} onChange={(event) => setFilter(event.target.value)}>
            <option value="all">Choose a game</option>
            {games.map((game) => (
              <option key={game.id} value={game.id}>
                {formatDate(game.date)} · {game.opponent}
              </option>
            ))}
          </select>
        </label>
        {selected ? (
          <>
            <label className="field">
              YouTube link
              <input
                value={url}
                placeholder="https://www.youtube.com/watch?v=…"
                onChange={(event) => setUrl(event.target.value)}
              />
            </label>
            <button type="button" className="btn btn-green" onClick={saveLink}>
              Save YouTube link
            </button>
            {filmEvents.length ? (
              <>
                <label className="field">
                  First event to sync
                  <select value={anchor?.id ?? ''} onChange={(event) => setAnchorId(event.target.value)}>
                    {filmEvents.map((event) => (
                      <option key={event.id} value={event.id}>
                        {formatGameStamp(event.period, event.clockMs)} · {event.detail}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="field">
                  YouTube time of that event (HH:MM:SS)
                  <input
                    value={timeText}
                    placeholder="00:00:00"
                    inputMode="numeric"
                    onChange={(event) => setTimeText(event.target.value)}
                  />
                </label>
                <p className="muted">
                  Find that play in the video and enter the time YouTube shows. Every other event shifts by the game clock between them. Links still open {app.state.filmLeadSeconds}s early.
                </p>
                <div className="row">
                  <button type="button" className="btn btn-green" onClick={align}>
                    Align timestamps
                  </button>
                  <label className="field grow">
                    Lead time (seconds)
                    <input
                      type="number"
                      min={0}
                      max={120}
                      value={app.state.filmLeadSeconds}
                      onChange={(event) => app.setLead(Number(event.target.value))}
                    />
                  </label>
                </div>
                {error ? <p className="bad">{error}</p> : null}
              </>
            ) : (
              <p className="empty">Goals, penalties, and great plays from this game show up here once they are tagged.</p>
            )}
          </>
        ) : (
          <p className="muted">Pick the game whose video you want to line up.</p>
        )}
      </section>

      {selected && rows.length === 0 ? null : rows.length === 0 ? (
        <p className="empty card">Goals, penalties, penalty shots, and great plays show up here.</p>
      ) : null}
      <div className="stack">
        {rows.map(({ game, event }) => {
          const href = filmHref(game.youtubeUrl, event.videoSeconds, app.state.filmLeadSeconds);
          const openAt = event.videoSeconds == null ? null : Math.max(0, event.videoSeconds - app.state.filmLeadSeconds);
          return (
            <article key={event.id} className="card film-row">
              <div>
                <strong>{event.detail}</strong>
                <p>
                  {game.opponent} · {formatGameStamp(event.period, event.clockMs)}
                  {event.videoSeconds == null ? '' : ` · ${formatVideoClock(event.videoSeconds)}`}
                </p>
              </div>
              <div>
                {href ? (
                  <a className="btn btn-green" href={href} target="_blank" rel="noreferrer">
                    Watch {openAt == null ? '' : formatVideoClock(openAt)}
                  </a>
                ) : (
                  <span className="muted">{game.youtubeUrl ? 'Align the timestamps' : 'Add the YouTube link'}</span>
                )}
              </div>
            </article>
          );
        })}
      </div>
    </div>
  );
}
