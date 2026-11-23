import { useState } from 'react';
import { BoxScore } from '../components/BoxScore.tsx';
import { EventEditModal } from '../components/EventEdit.tsx';
import { EventFilter, matchesEventFilter, type EventFilterValue } from '../components/EventFilter.tsx';
import { Modal } from '../components/Modal.tsx';
import { FILM_TYPES, eventTone, formatDate, formatGameStamp, readRemaining } from '../hockey.ts';
import { useApp } from '../store.tsx';
import type { Game } from '../types.ts';

function GameNameEditor({ game, onClose }: { game: Game; onClose: () => void }) {
  const app = useApp();
  const [name, setName] = useState(game.opponent);
  const [date, setDate] = useState(game.date);
  return (
    <Modal title="Game name" subtitle={formatDate(game.date)} onClose={onClose}>
      <label className="field">
        Name
        <input value={name} onChange={(event) => setName(event.target.value)} />
      </label>
      <label className="field">
        Date
        <input type="date" value={date} onChange={(event) => setDate(event.target.value)} />
      </label>
      <button
        type="button"
        className="btn btn-green"
        disabled={!name.trim()}
        onClick={() => {
          app.renameGame(game.id, name, date);
          onClose();
        }}
      >
        Save
      </button>
    </Modal>
  );
}

export function Games() {
  const app = useApp();
  const [editId, setEditId] = useState<string | null>(null);
  const games = [...app.state.games].sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  const editing = games.find((game) => game.id === editId) ?? null;
  return (
    <div className="page">
      <div className="page-head">
        <p className="kicker">Schedule</p>
        <h1>Games</h1>
      </div>
      {games.length === 0 ? <p className="empty card">No games yet. Create one from home.</p> : null}
      <div className="stack">
        {games.map((game) => {
          const marks = game.events.filter((event) => FILM_TYPES.has(event.type)).length;
          return (
            <article key={game.id} className="card resume">
              <div>
                <strong>{game.opponent}</strong>
                <p>
                  {formatDate(game.date)} · {game.homeAway === 'home' ? 'Home' : 'Away'} ·{' '}
                  {game.status === 'final'
                    ? 'Final'
                    : formatGameStamp(game.clock.period, readRemaining(game.clock, Date.now()))}
                </p>
              </div>
              <div className="score-lock">{game.scoreUs}–{game.scoreOpp}</div>
              <div className="row">
                <button type="button" className="btn btn-ghost" onClick={() => setEditId(game.id)}>
                  Edit
                </button>
                <button type="button" className="btn btn-ghost" onClick={() => app.open('game', game.id)}>
                  View
                </button>
                {game.status === 'live' ? (
                  <button type="button" className="btn btn-green" onClick={() => app.open('live', game.id)}>
                    Resume
                  </button>
                ) : null}
                <button type="button" className="btn btn-ghost" onClick={() => app.open('film', game.id)}>
                  Film {marks ? `(${marks})` : ''}
                </button>
              </div>
            </article>
          );
        })}
      </div>
      {editing ? <GameNameEditor game={editing} onClose={() => setEditId(null)} /> : null}
    </div>
  );
}

export function GameDetail() {
  const app = useApp();
  const game = app.state.games.find((item) => item.id === app.gameId);
  const [youtube, setYoutube] = useState(game?.youtubeUrl ?? '');
  const [confirm, setConfirm] = useState(false);
  const [eventId, setEventId] = useState<string | null>(null);
  const [eventFilter, setEventFilter] = useState<EventFilterValue>('all');
  const [editingName, setEditingName] = useState(false);
  if (!game) {
    return (
      <div className="page">
        <p className="empty">That game is not in the scorebook.</p>
      </div>
    );
  }
  return (
    <div className="page">
      <div className="page-head">
        <p className="kicker">{game.status === 'final' ? 'Final' : 'In progress'}</p>
        <h1>{game.opponent}</h1>
        <p className="lede">
          {formatDate(game.date)} · {game.homeAway === 'home' ? 'Home' : 'Away'} · {game.scoreUs}–{game.scoreOpp}
        </p>
      </div>
      <div className="row">
        {game.status === 'live' ? (
          <button type="button" className="btn btn-green" onClick={() => app.open('live', game.id)}>
            Resume scoring
          </button>
        ) : null}
        <button type="button" className="btn btn-ghost" onClick={() => app.open('film', game.id)}>
          Coaches film
        </button>
        <button type="button" className="btn btn-ghost" onClick={() => setEditingName(true)}>
          Edit name
        </button>
        {game.status === 'live' ? (
          <button type="button" className="btn btn-danger" onClick={() => setConfirm(true)}>
            Finalize
          </button>
        ) : null}
      </div>
      <label className="field card">
        YouTube link
        <input value={youtube} onChange={(event) => setYoutube(event.target.value)} placeholder="https://www.youtube.com/watch?v=…" />
        <button type="button" className="btn btn-ghost" onClick={() => app.editYoutube(game.id, youtube)}>
          Save link
        </button>
      </label>
      <section className="card">
        <h2>Box score</h2>
        <BoxScore game={game} roster={app.state.roster} />
      </section>
      <section className="card">
        <h2>Events</h2>
        <EventFilter events={game.events} value={eventFilter} onChange={setEventFilter} />
        {game.events.length === 0 ? <p className="empty">No events.</p> : null}
        {game.events.length > 0 && game.events.every((event) => !matchesEventFilter(event, eventFilter)) ? (
          <p className="empty">Nothing in this filter.</p>
        ) : null}
        <ol className="log">
          {[...game.events].reverse().filter((event) => matchesEventFilter(event, eventFilter)).map((event) => (
            <li key={event.id}>
              <button type="button" className={`log-item tone-${eventTone(event)}`} onClick={() => setEventId(event.id)}>
                <span>{formatGameStamp(event.period, event.clockMs)}</span>
                <strong>{event.detail}</strong>
              </button>
            </li>
          ))}
        </ol>
      </section>
      {eventId && game.events.some((item) => item.id === eventId) ? (
        <EventEditModal
          game={game}
          roster={app.state.roster}
          event={game.events.find((item) => item.id === eventId)!}
          onClose={() => setEventId(null)}
          onSave={(edit) => {
            app.editEvent(game.id, eventId, edit);
            setEventId(null);
          }}
          onRemove={() => {
            app.removeEvent(game.id, eventId);
            setEventId(null);
          }}
        />
      ) : null}
      {editingName ? <GameNameEditor game={game} onClose={() => setEditingName(false)} /> : null}
      {confirm ? (
        <div className="modal-back" onMouseDown={() => setConfirm(false)}>
          <div className="modal" role="dialog" aria-label="Finalize game" onMouseDown={(event) => event.stopPropagation()}>
            <h2>Finalize {game.scoreUs}–{game.scoreOpp}?</h2>
            <p>The clock stops and the game counts in the season stats.</p>
            <div className="row">
              <button
                type="button"
                className="btn btn-green"
                onClick={() => {
                  app.finish(game.id);
                  setConfirm(false);
                }}
              >
                Finalize game
              </button>
              <button type="button" className="btn btn-ghost" onClick={() => setConfirm(false)}>
                Not yet
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
