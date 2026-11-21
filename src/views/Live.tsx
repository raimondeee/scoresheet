import { useEffect, useMemo, useRef, useState } from 'react';
import { BoxScore } from '../components/BoxScore.tsx';
import { EventEditModal } from '../components/EventEdit.tsx';
import { FilmPlayer, type FilmPlayerHandle } from '../components/FilmPlayer.tsx';
import { Modal } from '../components/Modal.tsx';
import { PlayerGrid } from '../components/PlayerGrid.tsx';
import {
  INFRACTIONS,
  byNumber,
  formatClock,
  formatDurationLabel,
  formatGameStamp,
  formatVideo,
  ordinalPeriod,
  parseVideoClock,
  playerName,
  plusMinusFor,
  readPenaltyRemaining,
  readRemaining,
  situation,
  strengthLabel,
  youtubeId,
} from '../hockey.ts';
import { useApp } from '../store.tsx';
import type { ActivePenalty, Game, PenaltyKind, PenaltyLengths, Player, PlusMinus, ShotResult, Strength } from '../types.ts';

type GoalDraft = {
  step: 'scorer' | 'a1' | 'a2' | 'ice' | 'skip';
  scorerId: string | null;
  a1: string | null;
  a2: string | null;
  emptyNet: boolean;
  onIce: string[];
};

type OppGoalDraft = {
  step: 'info' | 'ice' | 'skip';
  oppNumber: string;
  emptyNet: boolean;
  onIce: string[];
};

type PenaltyDraft = {
  side: 'us' | 'opp';
  mode: 'box' | 'shot';
  playerId: string | null;
  bench: boolean;
  infraction: string;
  other: string;
  kind: PenaltyKind | 'double-minor';
  result: ShotResult;
};

type PenaltyEditDraft = {
  playerId: string | null;
  bench: boolean;
  infraction: string;
  other: string;
  kind: PenaltyKind;
  minutes: number;
  seconds: number;
};

type Wizard =
  | { type: 'shot' }
  | { type: 'goal'; draft: GoalDraft }
  | { type: 'opp-goal'; draft: OppGoalDraft }
  | { type: 'penalty'; draft: PenaltyDraft }
  | { type: 'penalty-edit'; penaltyId: string; side: 'us' | 'opp'; draft: PenaltyEditDraft }
  | { type: 'lengths' }
  | { type: 'event'; eventId: string }
  | { type: 'clock' }
  | { type: 'dressed' }
  | { type: 'finish' };

function ClockDigits({ clock }: { clock: Game['clock'] }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const node = ref.current;
    if (!node) return;
    if (!clock.running) {
      node.textContent = formatClock(clock.remainingMs);
      return;
    }
    let frame = 0;
    const draw = () => {
      node.textContent = formatClock(readRemaining(clock, Date.now()));
      frame = requestAnimationFrame(draw);
    };
    draw();
    return () => cancelAnimationFrame(frame);
  }, [clock]);
  return (
    <div className="clock-digits" ref={ref}>
      {formatClock(readRemaining(clock, Date.now()))}
    </div>
  );
}

function PenaltyTime({ penalty, clock }: { penalty: ActivePenalty; clock: Game['clock'] }) {
  const ref = useRef<HTMLElement>(null);
  const penaltyRef = useRef(penalty);
  const clockRef = useRef(clock);
  penaltyRef.current = penalty;
  clockRef.current = clock;
  useEffect(() => {
    const node = ref.current;
    if (!node) return;
    const draw = () => {
      node.textContent = formatClock(readPenaltyRemaining(penaltyRef.current, clockRef.current, Date.now()));
    };
    if (!clock.running) {
      draw();
      return;
    }
    let frame = 0;
    const loop = () => {
      draw();
      frame = requestAnimationFrame(loop);
    };
    loop();
    return () => cancelAnimationFrame(frame);
  }, [clock.running, clock.anchorEpoch, penalty.id, penalty.remainingMs]);
  return <b ref={ref}>{formatClock(readPenaltyRemaining(penalty, clock, Date.now()))}</b>;
}

function pmCopy(forUs: boolean, mode: PlusMinus, strength: Strength) {
  if (mode === 'none' && strength === 'PP') {
    return forUs
      ? 'Power-play goal. Plus/minus is not recorded on the power play.'
      : 'They scored on the power play. Plus/minus is not recorded while we are shorthanded.';
  }
  if (mode === 'plus' && strength === 'SH') return 'Shorthanded goal. Tap the skaters who were on the ice for the plus.';
  if (mode === 'plus') return 'Even strength. Tap the skaters who were on the ice for the plus.';
  if (mode === 'minus' && strength === 'SH') {
    return 'They scored shorthanded, into our power play. Tap our skaters who were on for the minus.';
  }
  if (mode === 'minus') return 'Even strength. Tap our skaters who were on the ice for the minus.';
  return 'Plus/minus does not apply to this goal.';
}

export function Live() {
  const app = useApp();
  const game = app.state.games.find((item) => item.id === app.gameId && item.status === 'live');
  const [wizard, setWizard] = useState<Wizard | null>(null);
  const [tick, setTick] = useState(0);
  const [videoText, setVideoText] = useState('');
  const [showFilm, setShowFilm] = useState(false);
  const [link, setLink] = useState('');
  const videoRef = useRef(videoText);
  videoRef.current = videoText;
  const playerRef = useRef<FilmPlayerHandle>(null);
  const stampRef = useRef<number | null>(null);
  const expireLock = useRef(false);

  useEffect(() => {
    setVideoText(game?.videoSeconds == null ? '' : formatVideo(game.videoSeconds));
    setLink(game?.youtubeUrl ?? '');
    setShowFilm(false);
    setWizard(null);
  }, [game?.id]);

  useEffect(() => {
    if (!showFilm) return;
    const id = window.setInterval(() => {
      if (stampRef.current != null) return;
      const seconds = playerRef.current?.seconds();
      if (seconds == null) return;
      setVideoText(formatVideo(seconds));
    }, 500);
    return () => window.clearInterval(id);
  }, [showFilm, game?.youtubeUrl]);

  useEffect(() => {
    if (!game?.clock.running) {
      expireLock.current = false;
      return;
    }
    const id = window.setInterval(() => {
      if (!game.clock.running || expireLock.current) return;
      if (readRemaining(game.clock, Date.now()) <= 0) {
        expireLock.current = true;
        app.expire(game.id);
      }
    }, 200);
    return () => window.clearInterval(id);
  }, [game?.clock.running, game?.clock.anchorEpoch, game?.id, app]);

  useEffect(() => {
    if (!game?.clock.running) return;
    const id = window.setInterval(() => setTick((value) => value + 1), 250);
    return () => window.clearInterval(id);
  }, [game?.clock.running, game?.id]);

  const roster = app.state.roster;
  const dressed = useMemo(() => {
    if (!game) return [];
    return roster.filter((player) => game.dressedIds.includes(player.id)).sort(byNumber);
  }, [game, roster]);
  const skaters = dressed.filter((player) => player.position !== 'G');

  if (!game) {
    return (
      <div className="page">
        <p className="empty card">No live game. Create one from home, or resume an unfinished game.</p>
        <button type="button" className="btn btn-green" onClick={() => app.open('home')}>
          Home
        </button>
      </div>
    );
  }

  const filmId = youtubeId(game.youtubeUrl);
  const now = Date.now() + tick * 0;
  const sit = situation(game.penalties, game.clock, now);
  const remaining = readRemaining(game.clock, now);
  const periodOver = !game.clock.running && remaining <= 0;
  const inBox = new Set(sit.penalties.filter((penalty) => penalty.side === 'us' && penalty.playerId).map((penalty) => penalty.playerId as string));
  const ourMode = plusMinusFor(true, sit.ourStrength, false);
  const theirMode = plusMinusFor(false, sit.theirStrength, false);

  function readPlayhead() {
    if (showFilm) {
      const seconds = playerRef.current?.seconds();
      if (seconds != null) return seconds;
    }
    const text = videoRef.current.trim();
    if (!text) return null;
    const parsed = parseVideoClock(text);
    return parsed == null ? game!.videoSeconds : parsed;
  }

  function videoNow() {
    return stampRef.current != null ? stampRef.current : readPlayhead();
  }

  function holdStamp() {
    stampRef.current = readPlayhead();
  }

  function begin(next: Wizard) {
    if (next.type === 'goal' || next.type === 'opp-goal' || next.type === 'penalty') holdStamp();
    app.pause(game!.id);
    setWizard(next);
  }

  function close() {
    stampRef.current = null;
    setWizard(null);
  }

  function penaltyLabel(penalty: ActivePenalty) {
    if (penalty.side === 'opp') return penalty.infraction;
    if (!penalty.playerId) return `Bench · ${penalty.infraction}`;
    const player = roster.find((item) => item.id === penalty.playerId) ?? game!.playerSnapshots[penalty.playerId];
    const name = player ? `#${player.number} ${player.last}` : 'Player';
    return `${name} · ${penalty.infraction}`;
  }

  function openPenalty(penalty: ActivePenalty) {
    const ms = readPenaltyRemaining(penalty, game!.clock, Date.now());
    const total = ms === 0 ? 0 : Math.ceil(ms / 1000);
    const known = (INFRACTIONS as readonly string[]).includes(penalty.infraction);
    setWizard({
      type: 'penalty-edit',
      penaltyId: penalty.id,
      side: penalty.side,
      draft: {
        playerId: penalty.playerId,
        bench: penalty.side === 'us' && !penalty.playerId,
        infraction: known ? penalty.infraction : 'Other',
        other: known ? '' : penalty.infraction,
        kind: penalty.kind,
        minutes: Math.floor(total / 60),
        seconds: total % 60,
      },
    });
  }

  const last = game.events[game.events.length - 1];

  return (
    <div className={`page live-page${showFilm ? ' with-film' : ''}`}>
      <section className={showFilm ? 'film-stage' : 'card film-dock'}>
        <div className="spread">
          <h2>Film</h2>
          <button type="button" className={showFilm ? 'btn btn-green' : 'btn btn-ghost'} onClick={() => setShowFilm((on) => !on)}>
            {showFilm ? 'Hide film' : 'Play film here'}
          </button>
        </div>
        {showFilm ? (
          <>
            <div className="film-link-row">
              <input
                value={link}
                aria-label="YouTube link"
                placeholder="https://www.youtube.com/watch?v=…"
                onChange={(event) => setLink(event.target.value)}
              />
              <button type="button" className="btn btn-ghost" onClick={() => app.editYoutube(game.id, link)}>
                Save link
              </button>
            </div>
            {filmId ? (
              <>
                <FilmPlayer
                  key={filmId}
                  ref={playerRef}
                  videoId={filmId}
                  start={game.videoSeconds ?? 0}
                  onPause={() => {
                    if (game.clock.running) app.pause(game.id);
                  }}
                />
                <p className="muted">Pausing the film stops the clock.</p>
              </>
            ) : (
              <p className="muted">Save a YouTube link and the film plays here.</p>
            )}
          </>
        ) : (
          <p className="muted">Watch the uploaded film on this page. Each tag saves the moment you tap it.</p>
        )}
      </section>

      <div className="live-sheet">
      <div className="live-head">
        <div>
          <p className="kicker">
            {game.homeAway === 'home' ? 'Home' : 'Away'} · {formatDateSafe(game.date)}
          </p>
          <h1>{game.opponent}</h1>
        </div>
        <button type="button" className="btn btn-ghost" onClick={() => setWizard({ type: 'dressed' })}>
          Dressed {game.dressedIds.length}
        </button>
      </div>
      <section className="scoreboard">
        <div className="score-side us">
          <span>Us</span>
          <strong>{game.scoreUs}</strong>
          <small>SOG {game.sogUs}</small>
        </div>
        <div className="clock-block">
          <div className="clock-top">
            <span className={game.clock.running ? 'status-pill run' : 'status-pill pause'}>
              {game.clock.running ? 'Running' : 'Paused'}
            </span>
            <span>{ordinalPeriod(game.clock.period)}</span>
            <span>{strengthLabel(sit.man)}</span>
          </div>
          <ClockDigits clock={game.clock} />
          <button
            type="button"
            className={game.clock.running ? 'clock-btn run' : 'clock-btn pause'}
            disabled={periodOver}
            onClick={() => (game.clock.running ? app.pause(game.id) : app.start(game.id))}
          >
            {periodOver ? 'Period over' : game.clock.running ? 'Stop clock' : 'Start clock'}
          </button>
          <p className="clock-hint">Green means paused. The page goes dark while the clock is running.</p>
          <div className="clock-links">
            <button type="button" onClick={() => begin({ type: 'clock' })}>
              Set clock
            </button>
            <button type="button" onClick={() => app.advancePeriod(game.id)} disabled={game.clock.period >= 4}>
              {game.clock.period === 3 ? 'Overtime' : game.clock.period === 4 ? 'In overtime' : 'Next period'}
            </button>
          </div>
          <label className="yt-line">
            <span>YouTube</span>
            <input
              value={videoText}
              placeholder="12:34"
              aria-label="YouTube time for the next tag"
              readOnly={showFilm}
              onChange={(event) => setVideoText(event.target.value)}
              onBlur={() => {
                if (!showFilm) app.stampVideo(game.id, videoNow());
              }}
            />
          </label>
        </div>
        <div className="score-side opp">
          <span>Opp</span>
          <strong>{game.scoreOpp}</strong>
          <small>SOG {game.sogOpp}</small>
        </div>
      </section>

      <div className="live-grid">
        <div className="stack">
          <section className="penalty-board" aria-label="Penalties">
            <div className="pen-teams">
              {(['us', 'opp'] as const).map((side) => {
                const active = sit.penalties.filter((penalty) => penalty.side === side);
                const count = Math.max(3, active.length);
                return (
                  <div className="pen-row" key={side}>
                    <span className={side === 'us' ? 'pen-side us' : 'pen-side opp'}>{side === 'us' ? 'Us' : 'Opp'}</span>
                    <div className="pen-slots">
                      {Array.from({ length: count }, (_, index) => {
                        const live = active[index];
                        if (!live) {
                          return (
                            <span key={`${side}-empty-${index}`} className={`pen-slot empty ${side}`}>
                              <em>Empty</em>
                              <b>0:00</b>
                            </span>
                          );
                        }
                        const penalty = game.penalties.find((item) => item.id === live.id) ?? live;
                        return (
                          <button
                            key={penalty.id}
                            type="button"
                            className={`pen-slot ${side}`}
                            onClick={() => openPenalty(penalty)}
                          >
                            <em>{penaltyLabel(penalty)}</em>
                            <PenaltyTime penalty={penalty} clock={game.clock} />
                          </button>
                        );
                      })}
                    </div>
                  </div>
                );
              })}
            </div>
            <button type="button" className="pen-lengths" onClick={() => setWizard({ type: 'lengths' })}>
              Lengths
              <small>
                {formatDurationLabel(game.penaltyLengthsMs.minor)} · {formatDurationLabel(game.penaltyLengthsMs.major)} ·{' '}
                {formatDurationLabel(game.penaltyLengthsMs.misconduct)}
              </small>
            </button>
          </section>

          <div className="actions">
            <button type="button" className="action our-shot" onClick={() => { holdStamp(); setWizard({ type: 'shot' }); }}>
              Our shot
              <small>Clock keeps running</small>
            </button>
            <button type="button" className="action opp-shot" onClick={() => app.oppShot(game.id, videoNow())}>
              Opp shot
              <small>Clock keeps running</small>
            </button>
            <button
              type="button"
              className="action our-goal"
              onClick={() =>
                begin({
                  type: 'goal',
                  draft: { step: 'scorer', scorerId: null, a1: null, a2: null, emptyNet: false, onIce: [] },
                })
              }
            >
              Our goal
              <small>Pauses clock</small>
            </button>
            <button
              type="button"
              className="action opp-goal"
              onClick={() =>
                begin({
                  type: 'opp-goal',
                  draft: { step: 'info', oppNumber: '', emptyNet: !game.goalieId, onIce: [] },
                })
              }
            >
              Opp goal
              <small>Pauses clock</small>
            </button>
            <button
              type="button"
              className="action our-pen"
              onClick={() => begin({ type: 'penalty', draft: freshPenalty('us') })}
            >
              Our penalty
              <small>Pauses clock</small>
            </button>
            <button
              type="button"
              className="action opp-pen"
              onClick={() => begin({ type: 'penalty', draft: freshPenalty('opp') })}
            >
              Opp penalty
              <small>Pauses clock</small>
            </button>
            <button type="button" className="action great" onClick={() => app.greatPlay(game.id, '', videoNow())}>
              Great play
              <small>Stamps the time</small>
            </button>
            <button type="button" className="action box" onClick={() => document.getElementById('box-score')?.scrollIntoView({ behavior: 'smooth' })}>
              Box score
              <small>Clock keeps running</small>
            </button>
          </div>
        </div>

        <aside className="card log-card">
          <div className="spread">
            <h2>Events</h2>
            <button type="button" className="btn btn-ghost" disabled={!last} onClick={() => app.undoLast(game.id)}>
              Undo
            </button>
          </div>
          <div className="log-scroll">
            {game.events.length === 0 ? <p className="empty">No events yet.</p> : null}
            <ol className="log">
              {[...game.events].reverse().map((event) => (
                <li key={event.id}>
                  <button type="button" className="log-item" onClick={() => setWizard({ type: 'event', eventId: event.id })}>
                    <span>{formatGameStamp(event.period, event.clockMs)}</span>
                    <strong>{event.detail}</strong>
                  </button>
                </li>
              ))}
            </ol>
          </div>
          <button type="button" className="btn btn-danger" onClick={() => setWizard({ type: 'finish' })}>
            Finalize game
          </button>
        </aside>
      </div>

      <section id="box-score" className="card">
        <h2>Box score</h2>
        <BoxScore game={game} roster={roster} />
      </section>
      </div>

      {wizard?.type === 'shot' ? (
        <Modal title="Our shot" subtitle="Clock keeps running." onClose={close}>
          <PlayerGrid players={skaters} onPick={(playerId) => { app.ourShot(game.id, playerId, videoNow()); close(); }} />
        </Modal>
      ) : null}

      {wizard?.type === 'goal' ? (
        <GoalWindows
          game={game}
          skaters={skaters}
          draft={wizard.draft}
          mode={ourMode}
          strength={sit.ourStrength}
          expected={sit.man.our}
          inBox={inBox}
          onChange={(draft) => setWizard({ type: 'goal', draft })}
          onClose={close}
          onSave={(draft) => {
            if (!draft.scorerId) return;
            app.ourGoal(
              game.id,
              {
                scorerId: draft.scorerId,
                assist1Id: draft.a1,
                assist2Id: draft.a2,
                onIceIds: draft.onIce,
                emptyNet: draft.emptyNet,
              },
              videoNow(),
            );
            close();
          }}
        />
      ) : null}

      {wizard?.type === 'opp-goal' ? (
        <OppGoalWindows
          game={game}
          skaters={skaters}
          draft={wizard.draft}
          mode={theirMode}
          strength={sit.theirStrength}
          expected={sit.man.our}
          inBox={inBox}
          goalieName={goalieLabel(roster, game.goalieId)}
          onChange={(draft) => setWizard({ type: 'opp-goal', draft })}
          onClose={close}
          onSave={(draft) => {
            app.oppGoal(game.id, { oppNumber: draft.oppNumber, onIceIds: draft.onIce, emptyNet: draft.emptyNet }, videoNow());
            close();
          }}
        />
      ) : null}

      {wizard?.type === 'penalty' ? (
        <PenaltyWindow
          game={game}
          players={wizard.draft.side === 'us' ? dressed : []}
          draft={wizard.draft}
          onChange={(draft) => setWizard({ type: 'penalty', draft })}
          onClose={close}
          onSave={(draft) => {
            const infraction = draft.infraction === 'Other' ? draft.other.trim() || 'Other' : draft.infraction;
            if (draft.mode === 'shot') {
              if (draft.side === 'us') {
                if (!draft.playerId) return;
                app.ourPenaltyShot(game.id, { playerId: draft.playerId, result: draft.result }, videoNow());
              } else {
                app.oppPenaltyShot(game.id, { playerId: null, result: draft.result }, videoNow());
              }
            } else if (draft.side === 'us') {
              app.ourPenalty(
                game.id,
                { playerId: draft.bench ? null : draft.playerId, infraction, kind: draft.kind },
                videoNow(),
              );
            } else {
              app.oppPenalty(game.id, { playerId: null, infraction, kind: draft.kind }, videoNow());
            }
            close();
          }}
        />
      ) : null}

      {wizard?.type === 'penalty-edit' ? (
        <PenaltyEditWindow
          game={game}
          players={wizard.side === 'us' ? dressed : []}
          side={wizard.side}
          draft={wizard.draft}
          onChange={(draft) => setWizard({ type: 'penalty-edit', penaltyId: wizard.penaltyId, side: wizard.side, draft })}
          onClose={close}
          onSave={(draft) => {
            const infraction = draft.infraction === 'Other' ? draft.other.trim() || 'Other' : draft.infraction;
            app.editPenalty(game.id, wizard.penaltyId, {
              playerId: wizard.side === 'us' && !draft.bench ? draft.playerId : null,
              infraction,
              kind: draft.kind,
              remainingMs: (Math.max(0, draft.minutes) * 60 + Math.min(59, Math.max(0, draft.seconds))) * 1000,
            });
            close();
          }}
          onClear={() => {
            app.clearPenalty(game.id, wizard.penaltyId);
            close();
          }}
        />
      ) : null}

      {wizard?.type === 'event' ? (
        <EventEditor game={game} roster={roster} eventId={wizard.eventId} onClose={close} />
      ) : null}

      {wizard?.type === 'lengths' ? (
        <LengthsWindow
          lengths={game.penaltyLengthsMs}
          onClose={close}
          onSave={(lengths) => {
            app.setPenaltyLengths(game.id, lengths);
            close();
          }}
        />
      ) : null}

      {wizard?.type === 'clock' ? (
        <ClockWindow
          remainingMs={remaining}
          onClose={close}
          onSave={(ms) => {
            app.setRemaining(game.id, ms);
            close();
          }}
        />
      ) : null}

      {wizard?.type === 'dressed' ? (
        <DressedWindow
          roster={[...roster].sort(byNumber)}
          dressed={game.dressedIds}
          onClose={close}
          onSave={(ids) => {
            app.editDressed(game.id, ids);
            close();
          }}
        />
      ) : null}

      {wizard?.type === 'finish' ? (
        <Modal title={`Finalize ${game.scoreUs}–${game.scoreOpp}?`} onClose={close}>
          <p>The clock stops and this game starts counting in the season stats.</p>
          <div className="row">
            <button
              type="button"
              className="btn btn-green"
              onClick={() => {
                app.finish(game.id);
                close();
                app.open('game', game.id);
              }}
            >
              Finalize game
            </button>
            <button type="button" className="btn btn-ghost" onClick={close}>
              Keep scoring
            </button>
          </div>
        </Modal>
      ) : null}
    </div>
  );
}

function formatDateSafe(value: string) {
  const date = new Date(value.length === 10 ? `${value}T12:00:00` : value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

function freshPenalty(side: 'us' | 'opp'): PenaltyDraft {
  return { side, mode: 'box', playerId: null, bench: false, infraction: 'Tripping', other: '', kind: 'minor', result: 'goal' };
}

function goalieLabel(roster: Player[], id: string | null) {
  const goalie = roster.find((player) => player.id === id);
  return goalie ? playerName(goalie) : 'Empty net';
}

function GoalWindows({
  game,
  skaters,
  draft,
  mode,
  strength,
  expected,
  inBox,
  onChange,
  onClose,
  onSave,
}: {
  game: Game;
  skaters: Player[];
  draft: GoalDraft;
  mode: PlusMinus;
  strength: Strength;
  expected: number;
  inBox: Set<string>;
  onChange: (draft: GoalDraft) => void;
  onClose: () => void;
  onSave: (draft: GoalDraft) => void;
}) {
  const scorer = skaters.find((player) => player.id === draft.scorerId);
  const badges = Object.fromEntries([...inBox].map((id) => [id, 'In the box']));
  const title =
    draft.step === 'scorer' ? 'Who scored?' : draft.step === 'a1' ? 'First assist' : draft.step === 'a2' ? 'Second assist' : mode === 'plus' ? 'Plus / minus' : 'Save goal';

  function afterAssists(next: GoalDraft) {
    if (mode === 'plus') {
      const preset = [next.scorerId, next.a1, next.a2].filter((id): id is string => id != null && !inBox.has(id));
      onChange({ ...next, step: 'ice', onIce: [...new Set(preset)] });
    } else {
      onChange({ ...next, step: 'skip', onIce: [] });
    }
  }

  return (
    <Modal title={title} subtitle={`${strengthLabelText(strength)} · clock stays paused.`} onClose={onClose} wide>
      {draft.step === 'scorer' ? (
        <>
          <label className="check">
            <input type="checkbox" checked={draft.emptyNet} onChange={(event) => onChange({ ...draft, emptyNet: event.target.checked })} />
            Empty net
          </label>
          <PlayerGrid players={skaters} onPick={(scorerId) => onChange({ ...draft, scorerId, step: 'a1' })} />
        </>
      ) : null}
      {draft.step === 'a1' ? (
        <>
          <p className="muted">{scorer ? playerName(scorer) : 'Goal'} · first assist, if there was one.</p>
          <button type="button" className="btn btn-ghost" onClick={() => afterAssists({ ...draft, a1: null, a2: null })}>
            Unassisted
          </button>
          <PlayerGrid
            players={skaters.filter((player) => player.id !== draft.scorerId)}
            onPick={(a1) => onChange({ ...draft, a1, step: 'a2' })}
          />
        </>
      ) : null}
      {draft.step === 'a2' ? (
        <>
          <p className="muted">Second assist, if there was one.</p>
          <button type="button" className="btn btn-ghost" onClick={() => afterAssists({ ...draft, a2: null })}>
            No second assist
          </button>
          <PlayerGrid
            players={skaters.filter((player) => player.id !== draft.scorerId && player.id !== draft.a1)}
            onPick={(a2) => afterAssists({ ...draft, a2 })}
          />
        </>
      ) : null}
      {draft.step === 'ice' ? (
        <>
          <p>{pmCopy(true, mode, strength)} Usually {expected} skaters. Goalies are not included.</p>
          <p className="muted">{draft.onIce.length} selected</p>
          <PlayerGrid
            players={skaters}
            selected={draft.onIce}
            badges={badges}
            onPick={(id) =>
              onChange({
                ...draft,
                onIce: draft.onIce.includes(id) ? draft.onIce.filter((item) => item !== id) : [...draft.onIce, id],
              })
            }
          />
          <button type="button" className="btn btn-green" onClick={() => onSave(draft)}>
            Save goal
          </button>
        </>
      ) : null}
      {draft.step === 'skip' ? (
        <>
          <p>{pmCopy(true, mode, strength)}</p>
          <button type="button" className="btn btn-green" onClick={() => onSave(draft)}>
            Save goal
          </button>
        </>
      ) : null}
      {draft.step !== 'scorer' ? (
        <button
          type="button"
          className="text-btn"
          onClick={() => onChange({ ...draft, step: draft.step === 'a1' ? 'scorer' : draft.step === 'a2' ? 'a1' : 'a2' })}
        >
          Back
        </button>
      ) : null}
      <p className="muted">Period {ordinalPeriod(game.clock.period)} · {formatClock(game.clock.remainingMs)}</p>
    </Modal>
  );
}

function strengthLabelText(strength: Strength) {
  if (strength === 'PP') return 'Power play';
  if (strength === 'SH') return 'Shorthanded';
  return 'Even strength';
}

function OppGoalWindows({
  skaters,
  draft,
  mode,
  strength,
  expected,
  inBox,
  goalieName,
  onChange,
  onClose,
  onSave,
}: {
  game: Game;
  skaters: Player[];
  draft: OppGoalDraft;
  mode: PlusMinus;
  strength: Strength;
  expected: number;
  inBox: Set<string>;
  goalieName: string;
  onChange: (draft: OppGoalDraft) => void;
  onClose: () => void;
  onSave: (draft: OppGoalDraft) => void;
}) {
  const badges = Object.fromEntries([...inBox].map((id) => [id, 'In the box']));
  return (
    <Modal
      title={draft.step === 'info' ? 'Opponent goal' : mode === 'minus' ? 'Plus / minus' : 'Save goal against'}
      subtitle="Clock stays paused."
      onClose={onClose}
      wide
    >
      {draft.step === 'info' ? (
        <>
          <label className="field">
            Opponent number, if you have it
            <input value={draft.oppNumber} onChange={(event) => onChange({ ...draft, oppNumber: event.target.value })} inputMode="numeric" />
          </label>
          <label className="check">
            <input type="checkbox" checked={draft.emptyNet} onChange={(event) => onChange({ ...draft, emptyNet: event.target.checked })} />
            Empty net — do not charge {goalieName}
          </label>
          <p className="muted">{strengthLabelText(strength)}.</p>
          <button
            type="button"
            className="btn btn-green"
            onClick={() => onChange({ ...draft, step: mode === 'minus' ? 'ice' : 'skip' })}
          >
            Continue
          </button>
        </>
      ) : null}
      {draft.step === 'ice' ? (
        <>
          <p>{pmCopy(false, mode, strength)} Usually {expected} skaters.</p>
          <p className="muted">{draft.onIce.length} selected</p>
          <PlayerGrid
            players={skaters}
            selected={draft.onIce}
            badges={badges}
            onPick={(id) =>
              onChange({
                ...draft,
                onIce: draft.onIce.includes(id) ? draft.onIce.filter((item) => item !== id) : [...draft.onIce, id],
              })
            }
          />
          <button type="button" className="btn btn-green" onClick={() => onSave(draft)}>
            Save goal against
          </button>
        </>
      ) : null}
      {draft.step === 'skip' ? (
        <>
          <p>{pmCopy(false, mode, strength)}</p>
          <button type="button" className="btn btn-green" onClick={() => onSave(draft)}>
            Save goal against
          </button>
        </>
      ) : null}
    </Modal>
  );
}

function PenaltyWindow({
  game,
  players,
  draft,
  onChange,
  onClose,
  onSave,
}: {
  game: Game;
  players: Player[];
  draft: PenaltyDraft;
  onChange: (draft: PenaltyDraft) => void;
  onClose: () => void;
  onSave: (draft: PenaltyDraft) => void;
}) {
  const lengths = game.penaltyLengthsMs;
  const needsPlayer = draft.side === 'us' && draft.mode === 'box' && !draft.bench && !draft.playerId;
  const needsShooter = draft.side === 'us' && draft.mode === 'shot' && !draft.playerId;
  return (
    <Modal title={draft.side === 'us' ? 'Our penalty' : 'Opponent penalty'} subtitle="Clock stays paused." onClose={onClose} wide>
      <div className="choice-row">
        <button type="button" className={draft.mode === 'box' ? 'choice on' : 'choice'} onClick={() => onChange({ ...draft, mode: 'box' })}>
          Penalty box
        </button>
        <button type="button" className={draft.mode === 'shot' ? 'choice on' : 'choice'} onClick={() => onChange({ ...draft, mode: 'shot' })}>
          Penalty shot
        </button>
      </div>
      {draft.mode === 'shot' ? (
        <>
          <p className="muted">A penalty shot does not put anyone in the box, and a goal does not change plus/minus.</p>
          {draft.side === 'us' ? (
            <PlayerGrid players={players.filter((player) => player.position !== 'G')} selected={draft.playerId ? [draft.playerId] : []} onPick={(playerId) => onChange({ ...draft, playerId })} />
          ) : (
            <p>Their penalty shot. {game.goalieId ? 'A goal is charged to the goalie in net.' : 'The net is empty.'}</p>
          )}
          <div className="choice-row">
            {(['goal', 'save', 'miss'] as const).map((result) => (
              <button key={result} type="button" className={draft.result === result ? 'choice on' : 'choice'} onClick={() => onChange({ ...draft, result })}>
                {result === 'goal' ? 'Goal' : result === 'save' ? 'Save' : 'Miss'}
              </button>
            ))}
          </div>
        </>
      ) : (
        <>
          {draft.side === 'us' ? (
            <>
              <div className="choice-row">
                <button type="button" className={draft.bench ? 'choice on' : 'choice'} onClick={() => onChange({ ...draft, bench: true, playerId: null })}>
                  Bench
                </button>
              </div>
              <PlayerGrid
                players={players}
                selected={draft.playerId ? [draft.playerId] : []}
                onPick={(playerId) => onChange({ ...draft, playerId, bench: false })}
              />
            </>
          ) : null}
          <div className="picks compact">
            {INFRACTIONS.map((infraction) => (
              <button
                key={infraction}
                type="button"
                className={draft.infraction === infraction ? 'pick on' : 'pick'}
                onClick={() => onChange({ ...draft, infraction })}
              >
                <span>{infraction}</span>
              </button>
            ))}
          </div>
          {draft.infraction === 'Other' ? (
            <label className="field">
              Infraction
              <input value={draft.other} onChange={(event) => onChange({ ...draft, other: event.target.value })} />
            </label>
          ) : null}
          <div className="choice-row">
            <button type="button" className={draft.kind === 'minor' ? 'choice on' : 'choice'} onClick={() => onChange({ ...draft, kind: 'minor' })}>
              Minor {formatDurationLabel(lengths.minor)}
            </button>
            <button type="button" className={draft.kind === 'double-minor' ? 'choice on' : 'choice'} onClick={() => onChange({ ...draft, kind: 'double-minor' })}>
              Double minor
            </button>
            <button type="button" className={draft.kind === 'major' ? 'choice on' : 'choice'} onClick={() => onChange({ ...draft, kind: 'major' })}>
              Major {formatDurationLabel(lengths.major)}
            </button>
            <button type="button" className={draft.kind === 'misconduct' ? 'choice on' : 'choice'} onClick={() => onChange({ ...draft, kind: 'misconduct' })}>
              Misconduct {formatDurationLabel(lengths.misconduct)}
            </button>
          </div>
          {draft.kind === 'misconduct' ? <p className="muted">A misconduct does not change on-ice strength.</p> : null}
          {draft.kind === 'major' ? <p className="muted">A major stays on the clock when a goal is scored.</p> : null}
        </>
      )}
      <button type="button" className="btn btn-green" disabled={needsPlayer || needsShooter} onClick={() => onSave(draft)}>
        {draft.mode === 'shot' ? 'Save penalty shot' : 'Save penalty'}
      </button>
    </Modal>
  );
}

function EventEditor({
  game,
  roster,
  eventId,
  onClose,
}: {
  game: Game;
  roster: Player[];
  eventId: string;
  onClose: () => void;
}) {
  const app = useApp();
  const event = game.events.find((item) => item.id === eventId);
  if (!event) return null;
  return (
    <EventEditModal
      game={game}
      roster={roster}
      event={event}
      onClose={onClose}
      onSave={(edit) => {
        app.editEvent(game.id, eventId, edit);
        onClose();
      }}
      onRemove={() => {
        app.removeEvent(game.id, eventId);
        onClose();
      }}
    />
  );
}

function PenaltyEditWindow({
  game,
  players,
  side,
  draft,
  onChange,
  onClose,
  onSave,
  onClear,
}: {
  game: Game;
  players: Player[];
  side: 'us' | 'opp';
  draft: PenaltyEditDraft;
  onChange: (draft: PenaltyEditDraft) => void;
  onClose: () => void;
  onSave: (draft: PenaltyEditDraft) => void;
  onClear: () => void;
}) {
  const lengths = game.penaltyLengthsMs;
  const needsPlayer = side === 'us' && !draft.bench && !draft.playerId;
  return (
    <Modal title="Edit penalty" subtitle="The clock keeps running." onClose={onClose} wide>
      {side === 'us' ? (
        <>
          <div className="choice-row">
            <button type="button" className={draft.bench ? 'choice on' : 'choice'} onClick={() => onChange({ ...draft, bench: true, playerId: null })}>
              Bench
            </button>
          </div>
          <PlayerGrid
            players={players}
            selected={draft.playerId ? [draft.playerId] : []}
            onPick={(playerId) => onChange({ ...draft, playerId, bench: false })}
          />
        </>
      ) : (
        <p className="muted">Opponent penalty. Change the call or the time left.</p>
      )}
      <div className="picks compact">
        {INFRACTIONS.map((infraction) => (
          <button
            key={infraction}
            type="button"
            className={draft.infraction === infraction ? 'pick on' : 'pick'}
            onClick={() => onChange({ ...draft, infraction })}
          >
            <span>{infraction}</span>
          </button>
        ))}
      </div>
      {draft.infraction === 'Other' ? (
        <label className="field">
          Infraction
          <input value={draft.other} onChange={(event) => onChange({ ...draft, other: event.target.value })} />
        </label>
      ) : null}
      <div className="choice-row">
        {(['minor', 'major', 'misconduct'] as const).map((kind) => (
          <button
            key={kind}
            type="button"
            className={draft.kind === kind ? 'choice on' : 'choice'}
            onClick={() => {
              const total = Math.round(lengths[kind] / 1000);
              onChange({ ...draft, kind, minutes: Math.floor(total / 60), seconds: total % 60 });
            }}
          >
            {kind === 'minor' ? 'Minor' : kind === 'major' ? 'Major' : 'Misconduct'} {formatDurationLabel(lengths[kind])}
          </button>
        ))}
      </div>
      <div className="pair">
        <label className="field">
          Minutes left
          <input type="number" min={0} value={draft.minutes} onChange={(event) => onChange({ ...draft, minutes: Number(event.target.value) })} />
        </label>
        <label className="field">
          Seconds left
          <input
            type="number"
            min={0}
            max={59}
            value={draft.seconds}
            onChange={(event) => onChange({ ...draft, seconds: Number(event.target.value) })}
          />
        </label>
      </div>
      {draft.kind === 'misconduct' ? <p className="muted">A misconduct does not change on-ice strength.</p> : null}
      <button type="button" className="btn btn-green" disabled={needsPlayer} onClick={() => onSave(draft)}>
        Save penalty
      </button>
      <button type="button" className="btn btn-danger" onClick={onClear}>
        Clear penalty
      </button>
    </Modal>
  );
}

function LengthsWindow({
  lengths,
  onClose,
  onSave,
}: {
  lengths: PenaltyLengths;
  onClose: () => void;
  onSave: (lengths: PenaltyLengths) => void;
}) {
  const split = (ms: number) => {
    const total = Math.max(0, Math.round(ms / 1000));
    return { minutes: Math.floor(total / 60), seconds: total % 60 };
  };
  const [minor, setMinor] = useState(split(lengths.minor));
  const [major, setMajor] = useState(split(lengths.major));
  const [misconduct, setMisconduct] = useState(split(lengths.misconduct));
  const pack = (part: { minutes: number; seconds: number }) =>
    (Math.max(0, part.minutes) * 60 + Math.min(59, Math.max(0, part.seconds))) * 1000;
  return (
    <Modal title="Penalty lengths" subtitle="The clock keeps running." onClose={onClose}>
      <p className="muted">
        These are the lengths for the next penalty. A penalty already on the clock that still uses the old length moves with the new time.
      </p>
      {(
        [
          ['Minor', minor, setMinor],
          ['Major', major, setMajor],
          ['Misconduct', misconduct, setMisconduct],
        ] as const
      ).map(([label, value, setValue]) => (
        <div className="pair" key={label}>
          <label className="field">
            {label} minutes
            <input
              type="number"
              min={0}
              value={value.minutes}
              onChange={(event) => setValue({ ...value, minutes: Number(event.target.value) })}
            />
          </label>
          <label className="field">
            Seconds
            <input
              type="number"
              min={0}
              max={59}
              value={value.seconds}
              onChange={(event) => setValue({ ...value, seconds: Number(event.target.value) })}
            />
          </label>
        </div>
      ))}
      <button
        type="button"
        className="btn btn-green"
        onClick={() => onSave({ minor: pack(minor), major: pack(major), misconduct: pack(misconduct) })}
      >
        Save lengths
      </button>
    </Modal>
  );
}

function ClockWindow({ remainingMs, onClose, onSave }: { remainingMs: number; onClose: () => void; onSave: (ms: number) => void }) {
  const total = remainingMs === 0 ? 0 : Math.ceil(remainingMs / 1000);
  const [minutes, setMinutes] = useState(Math.floor(total / 60));
  const [seconds, setSeconds] = useState(total % 60);
  return (
    <Modal title="Set clock" subtitle="This corrects the game clock. It stays paused." onClose={onClose}>
      <div className="pair">
        <label className="field">
          Minutes
          <input type="number" min={0} value={minutes} onChange={(event) => setMinutes(Number(event.target.value))} />
        </label>
        <label className="field">
          Seconds
          <input type="number" min={0} max={59} value={seconds} onChange={(event) => setSeconds(Number(event.target.value))} />
        </label>
      </div>
      <button type="button" className="btn btn-green" onClick={() => onSave((minutes * 60 + Math.min(59, seconds)) * 1000)}>
        Set to {minutes}:{String(Math.min(59, Math.max(0, seconds))).padStart(2, '0')}
      </button>
    </Modal>
  );
}

function DressedWindow({
  roster,
  dressed,
  onClose,
  onSave,
}: {
  roster: Player[];
  dressed: string[];
  onClose: () => void;
  onSave: (ids: string[]) => void;
}) {
  const [ids, setIds] = useState(dressed);
  return (
    <Modal title="Dressed players" onClose={onClose} wide>
      <PlayerGrid
        players={roster}
        selected={ids}
        onPick={(id) => setIds((current) => (current.includes(id) ? current.filter((item) => item !== id) : [...current, id]))}
      />
      <button type="button" className="btn btn-green" onClick={() => onSave(ids)}>
        Save dressed list
      </button>
    </Modal>
  );
}
