import type { ActivePenalty, Clock, EventType, Player, PlusMinus, Strength } from './types.ts';

export const FILM_TYPES = new Set<EventType>([
  'GOAL',
  'OPP_GOAL',
  'GREAT_PLAY',
  'PENALTY',
  'OPP_PENALTY',
  'PENALTY_SHOT',
  'OPP_PENALTY_SHOT',
]);

export type EventTone = 'goal' | 'penalty' | 'save' | 'shot' | 'play' | 'other';

export const EVENT_TONE_LABEL: Record<EventTone, string> = {
  goal: 'Goals',
  penalty: 'Penalties',
  save: 'Saves',
  shot: 'Shots',
  play: 'Great plays',
  other: 'Other',
};

const TONE_ORDER: EventTone[] = ['goal', 'penalty', 'save', 'shot', 'play', 'other'];

export function eventTone(event: { type: EventType; meta?: { result?: string } }): EventTone {
  if (event.type === 'GOAL' || event.type === 'OPP_GOAL') return 'goal';
  if (event.type === 'PENALTY' || event.type === 'OPP_PENALTY' || event.type === 'PENALTY_CLEAR') return 'penalty';
  if (event.type === 'OPP_SHOT') return 'save';
  if (event.type === 'SHOT') return 'shot';
  if (event.type === 'GREAT_PLAY') return 'play';
  if (event.type === 'PENALTY_SHOT' || event.type === 'OPP_PENALTY_SHOT') {
    if (event.meta?.result === 'save') return 'save';
    if (event.meta?.result === 'goal') return 'goal';
    return 'other';
  }
  return 'other';
}

export function eventTonesPresent(events: Array<{ type: EventType; meta?: { result?: string } }>) {
  const present = new Set(events.map((event) => eventTone(event)));
  return TONE_ORDER.filter((tone) => present.has(tone));
}

export const INFRACTIONS = [
  'Tripping',
  'Hooking',
  'Slashing',
  'Interference',
  'Holding',
  'Roughing',
  'Cross-checking',
  'High-sticking',
  'Boarding',
  'Charging',
  'Elbowing',
  'Checking from behind',
  'Unsportsmanlike',
  'Delay of game',
  'Too many men',
  'Other',
] as const;

export function uid(prefix: string) {
  return `${prefix}-${Math.random().toString(36).slice(2, 8)}${Date.now().toString(36).slice(-4)}`;
}

export function byNumber(a: Player, b: Player) {
  const an = Number(a.number);
  const bn = Number(b.number);
  if (Number.isFinite(an) && Number.isFinite(bn) && an !== bn) return an - bn;
  return a.number.localeCompare(b.number) || a.last.localeCompare(b.last);
}

export function playerName(p?: Pick<Player, 'number' | 'first' | 'last'> | null) {
  if (!p) return 'Unknown';
  return `#${p.number} ${p.first} ${p.last}`.replace(/\s+/g, ' ').trim();
}

export function clockElapsed(clock: Clock, t: number) {
  if (!clock.running || clock.anchorEpoch == null) return 0;
  return Math.max(0, t - clock.anchorEpoch);
}

/** Remaining time is always derived from the start anchor, so the clock does not drift. */
export function readRemaining(clock: Clock, t: number) {
  if (!clock.running || clock.anchorEpoch == null || clock.anchorRemainingMs == null) {
    return clock.remainingMs;
  }
  return Math.max(0, clock.anchorRemainingMs - (t - clock.anchorEpoch));
}

export function readPenaltyRemaining(penalty: ActivePenalty, clock: Clock, t: number) {
  return Math.max(0, penalty.remainingMs - clockElapsed(clock, t));
}

export function formatClock(ms: number) {
  const clamped = Math.max(0, ms);
  const totalSeconds = clamped === 0 ? 0 : Math.ceil(clamped / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}:${String(seconds).padStart(2, '0')}`;
}

export function formatClockLong(ms: number) {
  return `P ${formatClock(ms)}`;
}

export function formatDurationLabel(ms: number) {
  const total = Math.max(0, Math.round(ms / 1000));
  const minutes = Math.floor(total / 60);
  const seconds = total % 60;
  return `${minutes}:${String(seconds).padStart(2, '0')}`;
}

export function formatVideo(seconds: number) {
  const s = Math.max(0, Math.floor(seconds));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const r = s % 60;
  if (h > 0) return `${h}:${String(m).padStart(2, '0')}:${String(r).padStart(2, '0')}`;
  return `${m}:${String(r).padStart(2, '0')}`;
}

/** Always HH:MM:SS, matching the clock YouTube shows on a saved video. */
export function formatVideoClock(seconds: number) {
  const s = Math.max(0, Math.floor(seconds));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const r = s % 60;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(r).padStart(2, '0')}`;
}

/** Game clock consumed from the opening faceoff to this stamp. Later events have a larger value. */
export function gameElapsedMs(
  game: { periodLengthsMs: [number, number, number]; otLengthMs: number },
  period: number,
  clockMs: number,
) {
  let elapsed = 0;
  for (let index = 1; index < period; index += 1) elapsed += periodLength(game, index);
  return elapsed + Math.max(0, periodLength(game, period) - Math.max(0, clockMs));
}

/** Place every event on the YouTube timeline from one known stamp and the game clock between events. */
export function videoSecondsFromAnchor(
  game: { periodLengthsMs: [number, number, number]; otLengthMs: number },
  anchor: { period: number; clockMs: number },
  anchorVideoSeconds: number,
  event: { period: number; clockMs: number },
) {
  const deltaMs = gameElapsedMs(game, event.period, event.clockMs) - gameElapsedMs(game, anchor.period, anchor.clockMs);
  return Math.max(0, Math.round(anchorVideoSeconds + deltaMs / 1000));
}

export function formatPim(ms: number) {
  const minutes = ms / 60000;
  if (!Number.isFinite(minutes) || minutes === 0) return '0';
  return Number.isInteger(minutes) ? String(minutes) : minutes.toFixed(1);
}

export function formatMin(ms: number) {
  const total = Math.max(0, Math.round(ms / 1000));
  const m = Math.floor(total / 60);
  const s = total % 60;
  return `${m}:${String(s).padStart(2, '0')}`;
}

export function parseDuration(text: string): number | null {
  const trimmed = text.trim();
  if (!trimmed) return null;
  if (/^\d+(\.\d+)?$/.test(trimmed)) return Math.round(Number(trimmed) * 1000);
  const parts = trimmed.split(':').map((part) => Number(part));
  if (parts.some((n) => !Number.isFinite(n) || n < 0)) return null;
  if (parts.length === 2) return Math.round((parts[0] * 60 + parts[1]) * 1000);
  if (parts.length === 3) return Math.round((parts[0] * 3600 + parts[1] * 60 + parts[2]) * 1000);
  return null;
}

export function parseVideoClock(text: string): number | null {
  const ms = parseDuration(text);
  if (ms == null) return null;
  return Math.round(ms / 1000);
}

export function periodLength(game: { periodLengthsMs: [number, number, number]; otLengthMs: number }, period: number) {
  if (period >= 1 && period <= 3) return game.periodLengthsMs[period - 1];
  return game.otLengthMs;
}

export function manpower(penalties: ActivePenalty[]) {
  const our = penalties.filter((p) => p.side === 'us' && p.affectsStrength && p.remainingMs > 0).length;
  const opp = penalties.filter((p) => p.side === 'opp' && p.affectsStrength && p.remainingMs > 0).length;
  const offset = Math.min(our, opp);
  const ourBox = Math.min(2, our - offset);
  const oppBox = Math.min(2, opp - offset);
  return { our: 5 - ourBox, opp: 5 - oppBox, ourInBox: our, oppInBox: opp };
}

export function strengthOf(ourSkaters: number, oppSkaters: number): Strength {
  if (ourSkaters > oppSkaters) return 'PP';
  if (ourSkaters < oppSkaters) return 'SH';
  return 'EV';
}

export function strengthLabel(man: { our: number; opp: number }) {
  const tag = man.our > man.opp ? 'PP' : man.our < man.opp ? 'PK' : 'EV';
  return `${man.our}v${man.opp} ${tag}`;
}

/**
 * NHL-style plus/minus.
 * Even-strength and shorthanded goals count. Power-play goals and penalty shots do not.
 * `strength` is from the scoring team's point of view.
 */
export function plusMinusFor(goalForUs: boolean, strength: Strength, penaltyShot: boolean): PlusMinus {
  if (penaltyShot || strength === 'PP') return 'none';
  if (strength === 'EV' || strength === 'SH') return goalForUs ? 'plus' : 'minus';
  return 'none';
}

/** A power-play goal ends the shortest minor on the team that was scored on. */
export function minorToEnd(
  penalties: ActivePenalty[],
  scoredOn: 'us' | 'opp',
  scoringOnPowerPlay: boolean,
): ActivePenalty | null {
  if (!scoringOnPowerPlay) return null;
  const minors = penalties.filter((p) => p.side === scoredOn && p.endsOnGoal && p.remainingMs > 0);
  if (!minors.length) return null;
  return minors.reduce((best, penalty) => (penalty.remainingMs < best.remainingMs ? penalty : best));
}

export function situation(penalties: ActivePenalty[], clock: Clock, t: number) {
  const live = penalties.map((p) => ({ ...p, remainingMs: readPenaltyRemaining(p, clock, t) }));
  const man = manpower(live);
  return {
    penalties: live.filter((p) => p.remainingMs > 0),
    man,
    ourStrength: strengthOf(man.our, man.opp),
    theirStrength: strengthOf(man.opp, man.our),
  };
}

export function youtubeId(url: string): string | null {
  const trimmed = url.trim();
  if (!trimmed) return null;
  try {
    const parsed = new URL(trimmed);
    const host = parsed.hostname.replace(/^www\./, '');
    if (host === 'youtu.be') return parsed.pathname.split('/').filter(Boolean)[0] ?? null;
    const watch = parsed.searchParams.get('v');
    if (watch) return watch;
    const embed = parsed.pathname.match(/\/(?:embed|shorts|live)\/([^/]+)/);
    if (embed) return embed[1];
  } catch {
    const match = trimmed.match(/(?:v=|youtu\.be\/)([\w-]{6,})/);
    return match?.[1] ?? null;
  }
  return null;
}

export function filmHref(url: string, videoSeconds: number | null, leadSeconds: number) {
  if (videoSeconds == null) return null;
  const id = youtubeId(url);
  if (!id) return null;
  const start = Math.max(0, Math.floor(videoSeconds - Math.max(0, leadSeconds)));
  return `https://www.youtube.com/watch?v=${id}&t=${start}s`;
}

export function ordinalPeriod(period: number) {
  if (period === 1) return '1st';
  if (period === 2) return '2nd';
  if (period === 3) return '3rd';
  if (period === 4) return 'OT';
  return `P${period}`;
}

export function formatGameStamp(period: number, clockMs: number) {
  return `${ordinalPeriod(period)} ${formatClock(clockMs)}`;
}

export function formatDate(value: string) {
  if (!value) return '';
  const date = new Date(value.length === 10 ? `${value}T12:00:00` : value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
}
