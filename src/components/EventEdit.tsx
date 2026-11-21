import { useState } from 'react';
import { INFRACTIONS, formatVideo, parseVideoClock } from '../hockey.ts';
import type { EventEdit, Game, GameEvent, Player, ShotResult } from '../types.ts';
import { Modal } from './Modal.tsx';
import { PlayerGrid } from './PlayerGrid.tsx';

const REMOVABLE = new Set<GameEvent['type']>([
  'SHOT',
  'OPP_SHOT',
  'GOAL',
  'OPP_GOAL',
  'PENALTY',
  'OPP_PENALTY',
  'PENALTY_SHOT',
  'OPP_PENALTY_SHOT',
  'GREAT_PLAY',
]);

function splitClock(ms: number) {
  const total = ms === 0 ? 0 : Math.ceil(ms / 1000);
  return { minutes: Math.floor(total / 60), seconds: total % 60 };
}

export function EventEditModal({
  game,
  roster,
  event,
  onClose,
  onSave,
  onRemove,
}: {
  game: Game;
  roster: Player[];
  event: GameEvent;
  onClose: () => void;
  onSave: (edit: EventEdit) => void;
  onRemove: () => void;
}) {
  const clock = splitClock(event.clockMs);
  const [period, setPeriod] = useState(event.period);
  const [minutes, setMinutes] = useState(clock.minutes);
  const [seconds, setSeconds] = useState(clock.seconds);
  const [video, setVideo] = useState(event.videoSeconds == null ? '' : formatVideo(event.videoSeconds));
  const [playerId, setPlayerId] = useState(event.meta.playerId ?? null);
  const [scorerId, setScorerId] = useState(event.meta.scorerId ?? null);
  const [assist1Id, setAssist1Id] = useState(event.meta.assist1Id ?? null);
  const [assist2Id, setAssist2Id] = useState(event.meta.assist2Id ?? null);
  const [onIce, setOnIce] = useState(event.meta.onIceIds ?? []);
  const [oppNumber, setOppNumber] = useState(event.meta.oppNumber ?? '');
  const [emptyNet, setEmptyNet] = useState(Boolean(event.meta.emptyNet));
  const known = (INFRACTIONS as readonly string[]).includes(event.meta.infraction ?? '');
  const [infraction, setInfraction] = useState(known ? event.meta.infraction ?? 'Tripping' : 'Other');
  const [other, setOther] = useState(known ? '' : event.meta.infraction ?? '');
  const [note, setNote] = useState(event.meta.note ?? '');
  const [result, setResult] = useState<ShotResult>(event.meta.result ?? 'save');
  const skaters = roster
    .filter((player) => game.dressedIds.includes(player.id) && player.position !== 'G')
    .sort((a, b) => Number(a.number) - Number(b.number));
  const showIce = event.meta.plusMinus === 'plus' || event.meta.plusMinus === 'minus';

  function save() {
    const parsed = video.trim() ? parseVideoClock(video) : null;
    onSave({
      period,
      clockMs: (Math.max(0, minutes) * 60 + Math.min(59, Math.max(0, seconds))) * 1000,
      videoSeconds: parsed,
      playerId,
      scorerId,
      assist1Id,
      assist2Id,
      onIceIds: onIce,
      oppNumber,
      emptyNet,
      infraction: infraction === 'Other' ? other.trim() || 'Other' : infraction,
      note,
      result,
    });
  }

  return (
    <Modal title="Edit event" subtitle={event.detail} onClose={onClose} wide>
      <div className="pair">
        <label className="field">
          Period
          <select value={period} onChange={(item) => setPeriod(Number(item.target.value))}>
            <option value={1}>1st</option>
            <option value={2}>2nd</option>
            <option value={3}>3rd</option>
            <option value={4}>Overtime</option>
          </select>
        </label>
        <label className="field">
          Minutes left
          <input type="number" min={0} value={minutes} onChange={(item) => setMinutes(Number(item.target.value))} />
        </label>
        <label className="field">
          Seconds
          <input type="number" min={0} max={59} value={seconds} onChange={(item) => setSeconds(Number(item.target.value))} />
        </label>
      </div>
      <label className="field">
        YouTube time
        <input value={video} placeholder="12:34" onChange={(item) => setVideo(item.target.value)} />
      </label>

      {event.type === 'SHOT' || event.type === 'PENALTY' || event.type === 'PENALTY_SHOT' ? (
        <>
          <p className="muted">{event.type === 'SHOT' ? 'Shooter' : 'Player'}</p>
          {event.type === 'PENALTY' ? (
            <div className="choice-row">
              <button type="button" className={!playerId ? 'choice on' : 'choice'} onClick={() => setPlayerId(null)}>
                Bench
              </button>
            </div>
          ) : null}
          <PlayerGrid players={skaters} selected={playerId ? [playerId] : []} onPick={setPlayerId} />
        </>
      ) : null}

      {event.type === 'GOAL' ? (
        <>
          <p className="muted">Scorer</p>
          <PlayerGrid players={skaters} selected={scorerId ? [scorerId] : []} onPick={setScorerId} />
          <p className="muted">First assist</p>
          <div className="choice-row">
            <button type="button" className={!assist1Id ? 'choice on' : 'choice'} onClick={() => { setAssist1Id(null); setAssist2Id(null); }}>
              Unassisted
            </button>
          </div>
          <PlayerGrid
            players={skaters.filter((player) => player.id !== scorerId)}
            selected={assist1Id ? [assist1Id] : []}
            onPick={(id) => setAssist1Id(id)}
          />
          {assist1Id ? (
            <>
              <p className="muted">Second assist</p>
              <div className="choice-row">
                <button type="button" className={!assist2Id ? 'choice on' : 'choice'} onClick={() => setAssist2Id(null)}>
                  No second assist
                </button>
              </div>
              <PlayerGrid
                players={skaters.filter((player) => player.id !== scorerId && player.id !== assist1Id)}
                selected={assist2Id ? [assist2Id] : []}
                onPick={setAssist2Id}
              />
            </>
          ) : null}
        </>
      ) : null}

      {event.type === 'OPP_GOAL' ? (
        <>
          <label className="field">
            Opponent number
            <input value={oppNumber} onChange={(item) => setOppNumber(item.target.value)} />
          </label>
          <label className="check">
            <input type="checkbox" checked={emptyNet} onChange={(item) => setEmptyNet(item.target.checked)} />
            Empty net
          </label>
        </>
      ) : null}

      {showIce ? (
        <>
          <p className="muted">{event.meta.plusMinus === 'plus' ? 'On the ice for the plus' : 'On the ice for the minus'}</p>
          <PlayerGrid
            players={skaters}
            selected={onIce}
            onPick={(id) => setOnIce((current) => (current.includes(id) ? current.filter((item) => item !== id) : [...current, id]))}
          />
        </>
      ) : null}

      {event.type === 'PENALTY' || event.type === 'OPP_PENALTY' ? (
        <>
          <div className="picks compact">
            {INFRACTIONS.map((name) => (
              <button key={name} type="button" className={infraction === name ? 'pick on' : 'pick'} onClick={() => setInfraction(name)}>
                <span>{name}</span>
              </button>
            ))}
          </div>
          {infraction === 'Other' ? (
            <label className="field">
              Infraction
              <input value={other} onChange={(item) => setOther(item.target.value)} />
            </label>
          ) : null}
        </>
      ) : null}

      {event.type === 'PENALTY_SHOT' || event.type === 'OPP_PENALTY_SHOT' ? (
        <div className="choice-row">
          {(['goal', 'save', 'miss'] as const).map((value) => (
            <button key={value} type="button" className={result === value ? 'choice on' : 'choice'} onClick={() => setResult(value)}>
              {value === 'goal' ? 'Goal' : value === 'save' ? 'Save' : 'Miss'}
            </button>
          ))}
        </div>
      ) : null}

      {event.type === 'GREAT_PLAY' ? (
        <label className="field">
          Note
          <input value={note} placeholder="Great play" onChange={(item) => setNote(item.target.value)} />
        </label>
      ) : null}

      <button type="button" className="btn btn-green" disabled={event.type === 'GOAL' && !scorerId} onClick={save}>
        Save event
      </button>
      {REMOVABLE.has(event.type) ? (
        <button type="button" className="btn btn-danger" onClick={onRemove}>
          Remove event
        </button>
      ) : null}
      {event.type === 'GOAL' || event.type === 'OPP_GOAL' ? (
        <p className="muted">Removing a goal takes it off the score. A minor that goal ended goes back on the clock.</p>
      ) : null}
    </Modal>
  );
}
