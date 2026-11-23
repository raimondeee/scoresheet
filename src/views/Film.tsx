import { useEffect, useRef, useState } from 'react';
import { EventFilter, matchesEventFilter, type EventFilterValue } from '../components/EventFilter.tsx';
import { TimeNumber } from '../components/TimeNumber.tsx';
import {
  FILM_TYPES,
  eventTone,
  filmHref,
  formatDate,
  formatGameStamp,
  formatVideoClock,
  gameElapsedMs,
  parseVideoClock,
  youtubeTimestamps,
  type TimestampChoice,
} from '../hockey.ts';
import { useApp } from '../store.tsx';

function FilmStamp({
  eventId,
  videoSeconds,
  onAlign,
}: {
  eventId: string;
  videoSeconds: number | null;
  onAlign: (seconds: number) => void;
}) {
  const [text, setText] = useState(videoSeconds == null ? '' : formatVideoClock(videoSeconds));
  const [error, setError] = useState('');
  useEffect(() => {
    setText(videoSeconds == null ? '' : formatVideoClock(videoSeconds));
    setError('');
  }, [eventId, videoSeconds]);
  return (
    <div className="film-align">
      <input
        value={text}
        placeholder="00:00:00"
        inputMode="numeric"
        aria-label="YouTube time for this tag"
        onChange={(event) => setText(event.target.value)}
      />
      <button
        type="button"
        className="btn btn-green"
        onClick={() => {
          const parsed = parseVideoClock(text);
          if (parsed == null) {
            setError('Use HH:MM:SS.');
            return;
          }
          setError('');
          onAlign(parsed);
        }}
      >
        Align below
      </button>
      {error ? <span className="bad">{error}</span> : null}
    </div>
  );
}

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
  const [stamps, setStamps] = useState<TimestampChoice>({ goals: true, penalties: false, shots: false });
  const [copied, setCopied] = useState(false);
  const stampRef = useRef<HTMLTextAreaElement>(null);
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

  const chapters = selected ? youtubeTimestamps(selected, app.state.roster, selected.events, stamps) : null;

  useEffect(() => {
    setCopied(false);
  }, [selected?.id, stamps.goals, stamps.penalties, stamps.shots]);

  async function copyChapters() {
    if (!chapters?.text) return;
    try {
      await navigator.clipboard.writeText(chapters.text);
    } catch {
      stampRef.current?.focus();
      stampRef.current?.select();
      document.execCommand('copy');
    }
    setCopied(true);
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
                  Enter the YouTube time for this tag, then align below it. Tags above stay put. Tags underneath move by the game clock, and stop at the next tag you have already aligned. Links still open {app.state.filmLeadSeconds}s early.
                </p>
                <div className="row wrap">
                  <button type="button" className="btn btn-green" onClick={() => align(true)}>
                    Align below
                  </button>
                  <label className="field grow">
                    Lead time (seconds)
                    <TimeNumber
                      label="Lead time (seconds)"
                      value={app.state.filmLeadSeconds}
                      max={120}
                      onValue={(seconds) => app.setLead(seconds)}
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

      {selected && chapters ? (
        <section className="card stack">
          <h2>YouTube timestamps</h2>
          <p className="muted">
            Paste this into the video description. Goals are included. Add penalties or shots on goal when you want them in the list.
          </p>
          <div className="row wrap">
            <label className="check">
              <input
                type="checkbox"
                checked={stamps.goals}
                onChange={(event) => setStamps((current) => ({ ...current, goals: event.target.checked }))}
              />
              Goals
            </label>
            <label className="check">
              <input
                type="checkbox"
                checked={stamps.penalties}
                onChange={(event) => setStamps((current) => ({ ...current, penalties: event.target.checked }))}
              />
              Penalties
            </label>
            <label className="check">
              <input
                type="checkbox"
                checked={stamps.shots}
                onChange={(event) => setStamps((current) => ({ ...current, shots: event.target.checked }))}
              />
              Shots on goal
            </label>
          </div>
          {chapters.text ? (
            <>
              <textarea
                ref={stampRef}
                className="timestamp-out"
                readOnly
                rows={Math.min(18, Math.max(6, chapters.text.split('\n').length + 1))}
                value={chapters.text}
                aria-label="YouTube description timestamps"
              />
              <button type="button" className="btn btn-green" onClick={copyChapters}>
                {copied ? 'Copied' : 'Copy'}
              </button>
              {chapters.missing ? (
                <p className="muted">
                  {chapters.missing === 1
                    ? '1 tag has no YouTube time yet, so the list skips it.'
                    : `${chapters.missing} tags have no YouTube time yet, so the list skips them.`}
                </p>
              ) : null}
            </>
          ) : (
            <p className="empty">
              {chapters.missing
                ? 'These tags have no YouTube time yet. Align one event above and the rest follow the game clock.'
                : 'Nothing in this game matches these filters.'}
            </p>
          )}
        </section>
      ) : null}

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
                <FilmStamp
                  eventId={event.id}
                  videoSeconds={event.videoSeconds}
                  onAlign={(seconds) => app.alignFilm(game.id, event.id, seconds, true)}
                />
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
