import { useEffect, useState } from 'react';
import { EventFilter, matchesEventFilter, type EventFilterValue } from '../components/EventFilter.tsx';
import {
  FILM_TYPES,
  eventTone,
  filmHref,
  formatDate,
  formatGameStamp,
  formatVideoClock,
  gameElapsedMs,
  parseVideoClock,
} from '../hockey.ts';
import { useApp } from '../store.tsx';

function byGameClock<T extends { period: number; clockMs: number }>(
  game: { periodLengthsMs: [number, number, number]; otLengthMs: number },
  events: T[],
) {
  return [...events].sort(
    (a, b) => gameElapsedMs(game, a.period, a.clockMs) - gameElapsedMs(game, b.period, b.clockMs),
  );
}

export function Film() {
  const app = useApp();
  const [filter, setFilter] = useState(app.gameId ?? 'all');
  const [url, setUrl] = useState('');
  const [anchorId, setAnchorId] = useState<string | null>(null);
  const [timeText, setTimeText] = useState('00:00:00');
  const [error, setError] = useState('');
  const [kind, setKind] = useState<EventFilterValue>('all');
  const games = [...app.state.games].sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  const selected = filter === 'all' ? null : games.find((game) => game.id === filter) ?? null;
  const filmEvents = selected ? byGameClock(selected, selected.events.filter((event) => FILM_TYPES.has(event.type))) : [];
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
    byGameClock(game, game.events.filter((event) => FILM_TYPES.has(event.type))).map((event) => ({ game, event })),
  );
  const visibleRows = rows.filter(({ event }) => matchesEventFilter(event, kind));

  function saveLink() {
    if (!selected) return;
    app.editYoutube(selected.id, url);
  }

  function align(laterOnly: boolean) {
    if (!selected || !anchor) return;
    const parsed = parseVideoClock(timeText);
    if (parsed == null) {
      setError('Enter the YouTube time as HH:MM:SS.');
      return;
    }
    setError('');
    app.alignFilm(selected.id, anchor.id, parsed, laterOnly);
  }

  return (
    <div className="page">
      <div className="page-head">
        <p className="kicker">Coaches film</p>
        <h1>YouTube tags</h1>
        <p className="lede">
          Paste the saved video, then mark where one event sits in it. The rest line up from the game clock. The video keeps rolling through whistles and period breaks, so pin a later event when a tag drifts.
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
                  Event to sync
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
                  Find that play in the video and enter the time YouTube shows. Align timestamps moves every event by the game clock. Realign later events keeps earlier tags and moves only this play and the ones after it. Links still open {app.state.filmLeadSeconds}s early.
                </p>
                <div className="row wrap">
                  <button type="button" className="btn btn-green" onClick={() => align(false)}>
                    Align timestamps
                  </button>
                  <button type="button" className="btn btn-ghost" onClick={() => align(true)}>
                    Realign later events
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
      ) : (
        <EventFilter events={rows.map(({ event }) => event)} value={kind} onChange={setKind} />
      )}
      {rows.length > 0 && visibleRows.length === 0 ? <p className="empty card">Nothing in this filter.</p> : null}
      <div className="stack">
        {visibleRows.map(({ game, event }) => {
          const href = filmHref(game.youtubeUrl, event.videoSeconds, app.state.filmLeadSeconds);
          const openAt = event.videoSeconds == null ? null : Math.max(0, event.videoSeconds - app.state.filmLeadSeconds);
          return (
            <article key={event.id} className={`card film-row tone-${eventTone(event)}`}>
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
