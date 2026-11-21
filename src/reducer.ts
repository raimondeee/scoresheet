import {
  formatClock,
  formatDurationLabel,
  formatGameStamp,
  gameElapsedMs,
  manpower,
  videoSecondsFromAnchor,
  minorToEnd,
  playerName,
  plusMinusFor,
  readRemaining,
  strengthOf,
  uid,
} from './hockey.ts';
import type {
  ActivePenalty,
  AppState,
  BoxPenaltyInput,
  EventEdit,
  Game,
  GameEvent,
  GoalInput,
  NewGame,
  OppGoalInput,
  PenaltyEdit,
  PenaltyKind,
  PenaltyLengths,
  PenaltyShotInput,
  Player,
  PlayerSnapshot,
} from './types.ts';

function stampEvent(
  game: Game,
  t: number,
  partial: Omit<GameEvent, 'id' | 'period' | 'clockMs' | 'at' | 'videoSeconds'>,
): GameEvent {
  return {
    id: uid('e'),
    period: game.clock.period,
    clockMs: readRemaining(game.clock, t),
    at: new Date(t).toISOString(),
    videoSeconds: game.videoSeconds,
    ...partial,
  };
}

function touch(game: Game, t: number, roster: Player[], ids: Array<string | null | undefined>): Game {
  const playerSnapshots: Record<string, PlayerSnapshot> = { ...game.playerSnapshots };
  for (const id of ids) {
    if (!id) continue;
    const player = roster.find((item) => item.id === id);
    if (!player) continue;
    playerSnapshots[id] = {
      number: player.number,
      first: player.first,
      last: player.last,
      position: player.position,
    };
  }
  return { ...game, updatedAt: new Date(t).toISOString(), playerSnapshots };
}

export function freeze(game: Game, t: number, keepRunning: boolean): Game {
  const runningBefore = game.clock.running && game.clock.anchorEpoch != null && game.clock.anchorRemainingMs != null;
  const dt = runningBefore ? Math.max(0, t - game.clock.anchorEpoch!) : 0;
  const baseRemaining = runningBefore ? game.clock.anchorRemainingMs! : game.clock.remainingMs;
  const remaining = Math.max(0, baseRemaining - dt);
  const running = Boolean(keepRunning && game.clock.running && remaining > 0);
  const penalties = game.penalties
    .map((penalty) => ({ ...penalty, remainingMs: Math.max(0, penalty.remainingMs - dt) }))
    .filter((penalty) => penalty.remainingMs > 0);
  const goalieMs = { ...game.goalieMs };
  if (dt > 0 && game.goalieId) goalieMs[game.goalieId] = (goalieMs[game.goalieId] || 0) + dt;
  return {
    ...game,
    updatedAt: new Date(t).toISOString(),
    clock: {
      period: game.clock.period,
      running,
      remainingMs: remaining,
      anchorEpoch: running ? t : null,
      anchorRemainingMs: running ? remaining : null,
    },
    penalties,
    goalieMs,
  };
}

export function startClock(game: Game, t: number): Game {
  if (game.status === 'final') return game;
  if (game.clock.running) return freeze(game, t, true);
  const paused = freeze(game, t, false);
  if (paused.clock.remainingMs <= 0) return paused;
  return {
    ...paused,
    clock: {
      ...paused.clock,
      running: true,
      anchorEpoch: t,
      anchorRemainingMs: paused.clock.remainingMs,
    },
  };
}

export function pauseClock(game: Game, t: number): Game {
  if (!game.clock.running) return game;
  return freeze(game, t, false);
}

export function createGame(roster: Player[], input: NewGame, t: number): Game {
  const id = uid('g');
  const createdAt = new Date(t).toISOString();
  const playerSnapshots: Record<string, PlayerSnapshot> = {};
  for (const playerId of input.dressedIds) {
    const player = roster.find((item) => item.id === playerId);
    if (!player) continue;
    playerSnapshots[player.id] = {
      number: player.number,
      first: player.first,
      last: player.last,
      position: player.position,
    };
  }
  return {
    id,
    opponent: input.opponent.trim(),
    date: input.date,
    homeAway: input.homeAway,
    youtubeUrl: input.youtubeUrl.trim(),
    status: 'live',
    createdAt,
    updatedAt: createdAt,
    finalizedAt: null,
    periodLengthsMs: input.periodLengthsMs,
    otLengthMs: input.otLengthMs,
    penaltyLengthsMs: input.penaltyLengthsMs,
    clock: {
      period: 1,
      running: false,
      remainingMs: input.periodLengthsMs[0],
      anchorEpoch: null,
      anchorRemainingMs: null,
    },
    starterGoalieId: input.goalieId,
    goalieId: input.goalieId,
    lastGoalieId: input.goalieId,
    goalieMs: {},
    dressedIds: [...input.dressedIds],
    playerSnapshots,
    scoreUs: 0,
    scoreOpp: 0,
    sogUs: 0,
    sogOpp: 0,
    penalties: [],
    events: [],
    videoSeconds: null,
  };
}

function findPlayer(roster: Player[], game: Game, id: string | null | undefined) {
  if (!id) return undefined;
  return roster.find((player) => player.id === id) ?? game.playerSnapshots[id];
}

export function addOurShot(game: Game, roster: Player[], playerId: string, t: number): Game {
  const player = findPlayer(roster, game, playerId);
  const next = touch(game, t, roster, [playerId]);
  const event = stampEvent(next, t, {
    type: 'SHOT',
    detail: `${playerName(player)} — On goal`,
    meta: { playerId },
  });
  return { ...next, sogUs: next.sogUs + 1, events: [...next.events, event] };
}

export function addOppShot(game: Game, roster: Player[], t: number): Game {
  const goalie = findPlayer(roster, game, game.goalieId);
  const next = touch(game, t, roster, [game.goalieId]);
  const detail = goalie ? `Save — ${playerName(goalie)}` : 'Opp shot — empty net';
  const event = stampEvent(next, t, {
    type: 'OPP_SHOT',
    detail,
    meta: { goalieId: game.goalieId },
  });
  return { ...next, sogOpp: next.sogOpp + 1, events: [...next.events, event] };
}

export function addOurGoal(game: Game, roster: Player[], input: GoalInput, t: number): Game {
  const man = manpower(game.penalties);
  const strength = strengthOf(man.our, man.opp);
  const plusMinus = plusMinusFor(true, strength, false);
  const onIceIds = plusMinus === 'plus' ? [...new Set(input.onIceIds)] : [];
  const ended = minorToEnd(game.penalties, 'opp', strength === 'PP');
  const penalties = ended ? game.penalties.filter((penalty) => penalty.id !== ended.id) : game.penalties;
  const scorer = findPlayer(roster, game, input.scorerId);
  const a1 = findPlayer(roster, game, input.assist1Id);
  const a2 = findPlayer(roster, game, input.assist2Id);
  const assistText = a1 ? `A: ${playerName(a1)}${a2 ? `, ${playerName(a2)}` : ''}` : 'Unassisted';
  const endedText = ended ? ' · minor ended' : '';
  const next = touch(game, t, roster, [input.scorerId, input.assist1Id, input.assist2Id, ...onIceIds, game.goalieId]);
  const event = stampEvent(next, t, {
    type: 'GOAL',
    detail: `${playerName(scorer)} — ${assistText} · ${strength}${endedText}`,
    meta: {
      scorerId: input.scorerId,
      assist1Id: input.assist1Id,
      assist2Id: input.assist2Id,
      onIceIds,
      strength,
      plusMinus,
      goalieId: game.goalieId,
      emptyNet: input.emptyNet,
      endedPenalty: ended,
    },
  });
  return {
    ...next,
    penalties,
    scoreUs: next.scoreUs + 1,
    sogUs: next.sogUs + 1,
    events: [...next.events, event],
  };
}

export function addOppGoal(game: Game, roster: Player[], input: OppGoalInput, t: number): Game {
  const man = manpower(game.penalties);
  const strength = strengthOf(man.opp, man.our);
  const plusMinus = plusMinusFor(false, strength, false);
  const onIceIds = plusMinus === 'minus' ? [...new Set(input.onIceIds)] : [];
  const ended = minorToEnd(game.penalties, 'us', strength === 'PP');
  const penalties = ended ? game.penalties.filter((penalty) => penalty.id !== ended.id) : game.penalties;
  const emptyNet = input.emptyNet || !game.goalieId;
  const who = input.oppNumber.trim() ? `Opponent #${input.oppNumber.trim()}` : 'Opponent';
  const endedText = ended ? ' · minor ended' : '';
  const next = touch(game, t, roster, [...onIceIds, emptyNet ? null : game.goalieId]);
  const event = stampEvent(next, t, {
    type: 'OPP_GOAL',
    detail: `${who} · ${strength}${emptyNet ? ' · empty net' : ''}${endedText}`,
    meta: {
      oppNumber: input.oppNumber.trim(),
      onIceIds,
      strength,
      plusMinus,
      goalieId: emptyNet ? null : game.goalieId,
      emptyNet,
      endedPenalty: ended,
    },
  });
  return {
    ...next,
    penalties,
    scoreOpp: next.scoreOpp + 1,
    sogOpp: next.sogOpp + 1,
    events: [...next.events, event],
  };
}

function penaltyLength(game: Game, kind: PenaltyKind) {
  return game.penaltyLengthsMs[kind];
}

function makePenalty(
  game: Game,
  side: 'us' | 'opp',
  playerId: string | null,
  infraction: string,
  kind: PenaltyKind,
): ActivePenalty {
  const durationMs = penaltyLength(game, kind);
  const affectsStrength = kind !== 'misconduct';
  return {
    id: uid('pen'),
    side,
    playerId,
    infraction,
    kind,
    durationMs,
    remainingMs: durationMs,
    affectsStrength,
    endsOnGoal: kind === 'minor',
  };
}

function addBoxedPenalty(
  game: Game,
  roster: Player[],
  side: 'us' | 'opp',
  input: BoxPenaltyInput,
  t: number,
): Game {
  const kinds: PenaltyKind[] = input.kind === 'double-minor' ? ['minor', 'minor'] : [input.kind];
  const created = kinds.map((kind) => makePenalty(game, side, input.playerId, input.infraction, kind));
  const before = manpower(game.penalties);
  const after = manpower([...game.penalties, ...created]);
  const openedPp = before.our <= before.opp && after.our > after.opp;
  const openedPk = before.our >= before.opp && after.our < after.opp;
  const player = findPlayer(roster, game, input.playerId);
  const who = side === 'opp' ? 'Opponent' : input.playerId ? playerName(player) : 'Bench';
  const lengthText =
    input.kind === 'double-minor'
      ? `${formatDurationLabel(game.penaltyLengthsMs.minor)} + ${formatDurationLabel(game.penaltyLengthsMs.minor)}`
      : formatDurationLabel(created[0].durationMs);
  const next = touch(game, t, roster, [input.playerId]);
  const event = stampEvent(next, t, {
    type: side === 'us' ? 'PENALTY' : 'OPP_PENALTY',
    detail: `${who} — ${input.infraction} (${lengthText})`,
    meta: {
      playerId: input.playerId,
      infraction: input.infraction,
      kind: input.kind,
      pimMs: created.reduce((sum, penalty) => sum + penalty.durationMs, 0),
      penaltyIds: created.map((penalty) => penalty.id),
      openedPp,
      openedPk,
    },
  });
  return { ...next, penalties: [...next.penalties, ...created], events: [...next.events, event] };
}

export function addOurPenalty(game: Game, roster: Player[], input: BoxPenaltyInput, t: number) {
  return addBoxedPenalty(game, roster, 'us', input, t);
}

export function addOppPenalty(game: Game, roster: Player[], input: BoxPenaltyInput, t: number) {
  return addBoxedPenalty(game, roster, 'opp', input, t);
}

export function addOurPenaltyShot(game: Game, roster: Player[], input: PenaltyShotInput, t: number): Game {
  const player = findPlayer(roster, game, input.playerId);
  const next = touch(game, t, roster, [input.playerId]);
  const resultLabel = input.result === 'goal' ? 'Goal' : input.result === 'save' ? 'Save' : 'Miss';
  const counts = input.result === 'goal' || input.result === 'save';
  const event = stampEvent(next, t, {
    type: 'PENALTY_SHOT',
    detail: `Penalty shot — ${playerName(player)} — ${resultLabel}`,
    meta: { playerId: input.playerId, result: input.result, plusMinus: 'none', strength: 'EV' },
  });
  return {
    ...next,
    scoreUs: next.scoreUs + (input.result === 'goal' ? 1 : 0),
    sogUs: next.sogUs + (counts ? 1 : 0),
    events: [...next.events, event],
  };
}

export function addOppPenaltyShot(game: Game, roster: Player[], input: PenaltyShotInput, t: number): Game {
  const goalie = findPlayer(roster, game, game.goalieId);
  const next = touch(game, t, roster, [game.goalieId]);
  const resultLabel = input.result === 'goal' ? 'Goal' : input.result === 'save' ? 'Save' : 'Miss';
  const counts = input.result === 'goal' || input.result === 'save';
  const goalieText = input.result === 'save' && goalie ? ` — ${playerName(goalie)}` : '';
  const event = stampEvent(next, t, {
    type: 'OPP_PENALTY_SHOT',
    detail: `Opp penalty shot — ${resultLabel}${goalieText}`,
    meta: {
      result: input.result,
      goalieId: counts && input.result !== 'miss' ? game.goalieId : game.goalieId,
      plusMinus: 'none',
      strength: 'EV',
      emptyNet: !game.goalieId,
    },
  });
  return {
    ...next,
    scoreOpp: next.scoreOpp + (input.result === 'goal' ? 1 : 0),
    sogOpp: next.sogOpp + (counts ? 1 : 0),
    events: [...next.events, event],
  };
}

export function addGreatPlay(game: Game, note: string, t: number): Game {
  const clean = note.trim();
  const event = stampEvent(game, t, {
    type: 'GREAT_PLAY',
    detail: clean || 'Great play',
    meta: { note: clean },
  });
  return { ...game, updatedAt: new Date(t).toISOString(), events: [...game.events, event] };
}

export function switchGoalie(game: Game, roster: Player[], goalieId: string | null, t: number): Game {
  if (goalieId === game.goalieId) return game;
  const frozen = game.clock.running ? freeze(game, t, true) : game;
  const nextGoalie = findPlayer(roster, frozen, goalieId);
  const next = touch(frozen, t, roster, [goalieId]);
  const event = stampEvent(next, t, {
    type: 'GOALIE',
    detail: nextGoalie ? `Goalie — ${playerName(nextGoalie)}` : 'Empty net',
    meta: { previousGoalieId: game.goalieId, nextGoalieId: goalieId },
  });
  return {
    ...next,
    goalieId,
    lastGoalieId: goalieId ?? next.lastGoalieId,
    events: [...next.events, event],
  };
}

export function setClock(game: Game, remainingMs: number, t: number): Game {
  const paused = pauseClock(game, t);
  const nextRemaining = Math.max(0, Math.round(remainingMs));
  if (nextRemaining === paused.clock.remainingMs) return paused;
  const event = stampEvent(paused, t, {
    type: 'CLOCK',
    detail: `Clock set to ${formatClock(nextRemaining)}`,
    meta: { previousRemainingMs: paused.clock.remainingMs },
  });
  event.clockMs = nextRemaining;
  return {
    ...paused,
    clock: { ...paused.clock, remainingMs: nextRemaining, running: false, anchorEpoch: null, anchorRemainingMs: null },
    events: [...paused.events, event],
  };
}

export function nextPeriod(game: Game, t: number): Game {
  const paused = pauseClock(game, t);
  if (paused.clock.period >= 4) return paused;
  const period = paused.clock.period + 1;
  const length = period <= 3 ? paused.periodLengthsMs[period - 1] : paused.otLengthMs;
  const event = stampEvent(
    { ...paused, clock: { ...paused.clock, period, remainingMs: length } },
    t,
    {
      type: 'PERIOD',
      detail: `${period === 4 ? 'Overtime' : `${['', '1st', '2nd', '3rd'][period]} period`} — ${formatClock(length)}`,
      meta: { previousPeriod: paused.clock.period, previousRemainingMs: paused.clock.remainingMs },
    },
  );
  event.period = period;
  event.clockMs = length;
  return {
    ...paused,
    clock: { period, running: false, remainingMs: length, anchorEpoch: null, anchorRemainingMs: null },
    events: [...paused.events, event],
  };
}

export function setVideoSeconds(game: Game, videoSeconds: number | null, t: number): Game {
  return { ...game, videoSeconds, updatedAt: new Date(t).toISOString() };
}

export function setEventVideo(game: Game, eventId: string, videoSeconds: number | null, t: number): Game {
  return {
    ...game,
    updatedAt: new Date(t).toISOString(),
    events: game.events.map((event) => (event.id === eventId ? { ...event, videoSeconds } : event)),
  };
}

export function alignFilm(
  game: Game,
  anchorEventId: string,
  anchorVideoSeconds: number,
  t: number,
  laterOnly = false,
): Game {
  const anchor = game.events.find((event) => event.id === anchorEventId);
  if (!anchor) return game;
  const video = Math.max(0, Math.round(anchorVideoSeconds));
  const anchorElapsed = gameElapsedMs(game, anchor.period, anchor.clockMs);
  return {
    ...game,
    updatedAt: new Date(t).toISOString(),
    videoSeconds: video,
    events: game.events.map((event) => {
      if (laterOnly && gameElapsedMs(game, event.period, event.clockMs) < anchorElapsed) return event;
      return { ...event, videoSeconds: videoSecondsFromAnchor(game, anchor, video, event) };
    }),
  };
}

export function setYoutube(game: Game, youtubeUrl: string, t: number): Game {
  return { ...game, youtubeUrl: youtubeUrl.trim(), updatedAt: new Date(t).toISOString() };
}

export function setDressed(game: Game, roster: Player[], dressedIds: string[], t: number): Game {
  const next = touch({ ...game, dressedIds }, t, roster, dressedIds);
  const goalieStillDressed = !next.goalieId || dressedIds.includes(next.goalieId);
  return goalieStillDressed ? next : { ...next, goalieId: null };
}

export function finalizeGame(game: Game, t: number): Game {
  const paused = pauseClock(game, t);
  if (paused.status === 'final') return paused;
  return { ...paused, status: 'final', finalizedAt: new Date(t).toISOString() };
}

export function undo(game: Game, t: number): Game {
  const last = game.events[game.events.length - 1];
  if (!last) return game;
  const events = game.events.slice(0, -1);
  const base: Game = { ...game, events, updatedAt: new Date(t).toISOString() };
  switch (last.type) {
    case 'SHOT':
      return { ...base, sogUs: Math.max(0, base.sogUs - 1) };
    case 'OPP_SHOT':
      return { ...base, sogOpp: Math.max(0, base.sogOpp - 1) };
    case 'GOAL':
      return {
        ...base,
        scoreUs: Math.max(0, base.scoreUs - 1),
        sogUs: Math.max(0, base.sogUs - 1),
        penalties: last.meta.endedPenalty ? [...base.penalties, last.meta.endedPenalty] : base.penalties,
      };
    case 'OPP_GOAL':
      return {
        ...base,
        scoreOpp: Math.max(0, base.scoreOpp - 1),
        sogOpp: Math.max(0, base.sogOpp - 1),
        penalties: last.meta.endedPenalty ? [...base.penalties, last.meta.endedPenalty] : base.penalties,
      };
    case 'PENALTY':
    case 'OPP_PENALTY': {
      const ids = new Set(last.meta.penaltyIds ?? []);
      return { ...base, penalties: base.penalties.filter((penalty) => !ids.has(penalty.id)) };
    }
    case 'PENALTY_SHOT':
      return {
        ...base,
        scoreUs: base.scoreUs - (last.meta.result === 'goal' ? 1 : 0),
        sogUs: base.sogUs - (last.meta.result === 'miss' ? 0 : 1),
      };
    case 'OPP_PENALTY_SHOT':
      return {
        ...base,
        scoreOpp: base.scoreOpp - (last.meta.result === 'goal' ? 1 : 0),
        sogOpp: base.sogOpp - (last.meta.result === 'miss' ? 0 : 1),
      };
    case 'GOALIE':
      return { ...base, goalieId: last.meta.previousGoalieId ?? null };
    case 'PERIOD':
      return {
        ...base,
        clock: {
          period: last.meta.previousPeriod ?? base.clock.period,
          running: false,
          remainingMs: last.meta.previousRemainingMs ?? base.clock.remainingMs,
          anchorEpoch: null,
          anchorRemainingMs: null,
        },
      };
    case 'CLOCK':
      return {
        ...base,
        clock: {
          ...base.clock,
          running: false,
          remainingMs: last.meta.previousRemainingMs ?? base.clock.remainingMs,
          anchorEpoch: null,
          anchorRemainingMs: null,
        },
      };
    case 'PENALTY_CLEAR': {
      const restored = last.meta.endedPenalty;
      if (!restored || base.penalties.some((penalty) => penalty.id === restored.id)) return base;
      return { ...base, penalties: [...base.penalties, restored] };
    }
    default:
      return base;
  }
}

function penaltyWho(roster: Player[], game: Game, penalty: ActivePenalty) {
  if (penalty.side === 'opp') return 'Opponent';
  if (!penalty.playerId) return 'Bench';
  return playerName(findPlayer(roster, game, penalty.playerId));
}

function penaltyDetail(who: string, infraction: string, penalties: ActivePenalty[]) {
  const lengthText = penalties.map((penalty) => formatDurationLabel(penalty.durationMs)).join(' + ');
  return `${who} — ${infraction} (${lengthText})`;
}

export function updatePenalty(game: Game, roster: Player[], penaltyId: string, edit: PenaltyEdit, t: number): Game {
  const frozen = freeze(game, t, true);
  const current = frozen.penalties.find((penalty) => penalty.id === penaltyId);
  if (!current) return frozen;
  if (edit.remainingMs <= 0) return clearPenalty(frozen, roster, penaltyId, t);
  const durationMs = edit.kind === current.kind ? current.durationMs : frozen.penaltyLengthsMs[edit.kind];
  const nextPenalty: ActivePenalty = {
    ...current,
    playerId: current.side === 'us' ? edit.playerId : null,
    infraction: edit.infraction,
    kind: edit.kind,
    durationMs,
    remainingMs: Math.max(0, Math.round(edit.remainingMs)),
    affectsStrength: edit.kind !== 'misconduct',
    endsOnGoal: edit.kind === 'minor',
  };
  const penalties = frozen.penalties.map((penalty) => (penalty.id === penaltyId ? nextPenalty : penalty));
  const events = frozen.events.map((event) => {
    const ids = event.meta.penaltyIds;
    if (!ids?.includes(penaltyId)) return event;
    const group = ids
      .map((id) => penalties.find((penalty) => penalty.id === id))
      .filter((penalty): penalty is ActivePenalty => Boolean(penalty));
    if (!group.length) return event;
    const subject = group.find((penalty) => penalty.id === penaltyId) ?? group[0];
    return {
      ...event,
      detail: penaltyDetail(penaltyWho(roster, frozen, subject), subject.infraction, group),
      meta: {
        ...event.meta,
        playerId: subject.playerId,
        infraction: subject.infraction,
        kind: group.length > 1 ? event.meta.kind : subject.kind,
        pimMs: group.reduce((sum, penalty) => sum + penalty.durationMs, 0),
      },
    };
  });
  return { ...touch(frozen, t, roster, [nextPenalty.playerId]), penalties, events };
}

export function clearPenalty(game: Game, roster: Player[], penaltyId: string, t: number): Game {
  const frozen = freeze(game, t, true);
  const current = frozen.penalties.find((penalty) => penalty.id === penaltyId);
  if (!current) return frozen;
  const next = touch(frozen, t, roster, [current.playerId]);
  const event = stampEvent(next, t, {
    type: 'PENALTY_CLEAR',
    detail: `Penalty cleared — ${penaltyWho(roster, next, current)} ${current.infraction}`,
    meta: { penaltyIds: [current.id], endedPenalty: current, infraction: current.infraction, playerId: current.playerId },
  });
  return {
    ...next,
    penalties: next.penalties.filter((penalty) => penalty.id !== penaltyId),
    events: [...next.events, event],
  };
}

export function setPenaltyLengths(game: Game, lengths: PenaltyLengths, t: number): Game {
  const frozen = freeze(game, t, true);
  const nextLengths: PenaltyLengths = {
    minor: Math.max(0, Math.round(lengths.minor)),
    major: Math.max(0, Math.round(lengths.major)),
    misconduct: Math.max(0, Math.round(lengths.misconduct)),
  };
  const adjusted = new Set<string>();
  const penalties = frozen.penalties.flatMap((penalty) => {
    const previous = frozen.penaltyLengthsMs[penalty.kind];
    const updated = nextLengths[penalty.kind];
    if (penalty.durationMs !== previous || previous === updated) return [penalty];
    adjusted.add(penalty.id);
    const remainingMs = penalty.remainingMs + (updated - previous);
    if (remainingMs <= 0) return [];
    return [{ ...penalty, durationMs: updated, remainingMs }];
  });
  const events = frozen.events.map((event) => {
    const ids = event.meta.penaltyIds;
    if (!ids?.some((id) => adjusted.has(id))) return event;
    const parts = ids.map((id) => {
      const live = penalties.find((penalty) => penalty.id === id);
      if (live) return formatDurationLabel(live.durationMs);
      const before = frozen.penalties.find((penalty) => penalty.id === id);
      if (!before) return null;
      const previous = frozen.penaltyLengthsMs[before.kind];
      const duration = before.durationMs === previous ? nextLengths[before.kind] : before.durationMs;
      return formatDurationLabel(duration);
    });
    const pimMs = ids.reduce((sum, id) => {
      const live = penalties.find((penalty) => penalty.id === id);
      if (live) return sum + live.durationMs;
      const before = frozen.penalties.find((penalty) => penalty.id === id);
      if (!before) return sum;
      const previous = frozen.penaltyLengthsMs[before.kind];
      return sum + (before.durationMs === previous ? nextLengths[before.kind] : before.durationMs);
    }, 0);
    return {
      ...event,
      detail: event.detail.replace(/\s*\([^)]*\)\s*$/, ` (${parts.filter(Boolean).join(' + ')})`),
      meta: { ...event.meta, pimMs },
    };
  });
  return { ...frozen, penaltyLengthsMs: nextLengths, penalties, events, updatedAt: new Date(t).toISOString() };
}

function eventStamp(edit: EventEdit) {
  return {
    period: Math.min(4, Math.max(1, Math.round(edit.period))),
    clockMs: Math.max(0, Math.round(edit.clockMs)),
    videoSeconds: edit.videoSeconds,
  };
}

export function editEvent(game: Game, roster: Player[], eventId: string, edit: EventEdit, t: number): Game {
  const event = game.events.find((item) => item.id === eventId);
  if (!event) return game;
  const stamp = eventStamp(edit);
  let scoreUs = game.scoreUs;
  let scoreOpp = game.scoreOpp;
  let sogUs = game.sogUs;
  let sogOpp = game.sogOpp;
  let penalties = game.penalties;
  let next = { ...event, ...stamp };
  const ids: Array<string | null> = [];

  if (event.type === 'SHOT') {
    const player = findPlayer(roster, game, edit.playerId);
    ids.push(edit.playerId);
    next = { ...next, detail: `${playerName(player)} — On goal`, meta: { ...event.meta, playerId: edit.playerId } };
  } else if (event.type === 'GOAL') {
    const scorerId = edit.scorerId;
    const assist1Id = edit.assist1Id && edit.assist1Id !== scorerId ? edit.assist1Id : null;
    const assist2Id = edit.assist2Id && edit.assist2Id !== scorerId && edit.assist2Id !== assist1Id ? edit.assist2Id : null;
    const scorer = findPlayer(roster, game, scorerId);
    const a1 = findPlayer(roster, game, assist1Id);
    const a2 = findPlayer(roster, game, assist2Id);
    const assistText = a1 ? `A: ${playerName(a1)}${a2 ? `, ${playerName(a2)}` : ''}` : 'Unassisted';
    const endedText = event.meta.endedPenalty ? ' · minor ended' : '';
    const onIceIds = event.meta.plusMinus === 'plus' ? [...new Set(edit.onIceIds)] : [];
    ids.push(scorerId, assist1Id, assist2Id, ...onIceIds);
    next = {
      ...next,
      detail: `${playerName(scorer)} — ${assistText} · ${event.meta.strength ?? 'EV'}${endedText}`,
      meta: { ...event.meta, scorerId, assist1Id, assist2Id, onIceIds },
    };
  } else if (event.type === 'OPP_GOAL') {
    const number = edit.oppNumber.trim();
    const who = number ? `Opponent #${number}` : 'Opponent';
    const endedText = event.meta.endedPenalty ? ' · minor ended' : '';
    const onIceIds = event.meta.plusMinus === 'minus' ? [...new Set(edit.onIceIds)] : [];
    ids.push(...onIceIds);
    next = {
      ...next,
      detail: `${who} · ${event.meta.strength ?? 'EV'}${edit.emptyNet ? ' · empty net' : ''}${endedText}`,
      meta: {
        ...event.meta,
        oppNumber: number,
        emptyNet: edit.emptyNet,
        onIceIds,
        goalieId: edit.emptyNet ? null : event.meta.goalieId,
      },
    };
  } else if (event.type === 'PENALTY' || event.type === 'OPP_PENALTY') {
    const playerId = event.type === 'PENALTY' ? edit.playerId : null;
    const infraction = edit.infraction.trim() || event.meta.infraction || 'Penalty';
    const penaltyIds = new Set(event.meta.penaltyIds ?? []);
    penalties = game.penalties.map((penalty) =>
      penaltyIds.has(penalty.id) ? { ...penalty, playerId, infraction } : penalty,
    );
    const who = event.type === 'OPP_PENALTY' ? 'Opponent' : playerId ? playerName(findPlayer(roster, game, playerId)) : 'Bench';
    const length = event.detail.match(/\(([^)]+)\)\s*$/)?.[1];
    ids.push(playerId);
    next = {
      ...next,
      detail: `${who} — ${infraction}${length ? ` (${length})` : ''}`,
      meta: { ...event.meta, playerId, infraction },
    };
  } else if (event.type === 'PENALTY_SHOT' || event.type === 'OPP_PENALTY_SHOT') {
    const before = event.meta.result ?? 'miss';
    const after = edit.result;
    const goalDelta = (after === 'goal' ? 1 : 0) - (before === 'goal' ? 1 : 0);
    const sogDelta = (after === 'miss' ? 0 : 1) - (before === 'miss' ? 0 : 1);
    if (event.type === 'PENALTY_SHOT') {
      scoreUs += goalDelta;
      sogUs += sogDelta;
      const player = findPlayer(roster, game, edit.playerId);
      const resultLabel = after === 'goal' ? 'Goal' : after === 'save' ? 'Save' : 'Miss';
      ids.push(edit.playerId);
      next = {
        ...next,
        detail: `Penalty shot — ${playerName(player)} — ${resultLabel}`,
        meta: { ...event.meta, playerId: edit.playerId, result: after },
      };
    } else {
      scoreOpp += goalDelta;
      sogOpp += sogDelta;
      const resultLabel = after === 'goal' ? 'Goal' : after === 'save' ? 'Save' : 'Miss';
      next = {
        ...next,
        detail: `Opp penalty shot — ${resultLabel}`,
        meta: { ...event.meta, result: after },
      };
    }
  } else if (event.type === 'GREAT_PLAY') {
    const note = edit.note.trim();
    next = { ...next, detail: note || 'Great play', meta: { ...event.meta, note } };
  }

  const touched = touch(
    {
      ...game,
      scoreUs: Math.max(0, scoreUs),
      scoreOpp: Math.max(0, scoreOpp),
      sogUs: Math.max(0, sogUs),
      sogOpp: Math.max(0, sogOpp),
      penalties,
    },
    t,
    roster,
    ids,
  );
  return { ...touched, events: game.events.map((item) => (item.id === eventId ? next : item)) };
}

export function removeEvent(game: Game, eventId: string, t: number): Game {
  const event = game.events.find((item) => item.id === eventId);
  if (!event) return game;
  const events = game.events.filter((item) => item.id !== eventId);
  const next: Game = { ...game, events, updatedAt: new Date(t).toISOString() };
  if (event.type === 'SHOT') return { ...next, sogUs: Math.max(0, next.sogUs - 1) };
  if (event.type === 'OPP_SHOT') return { ...next, sogOpp: Math.max(0, next.sogOpp - 1) };
  if (event.type === 'GOAL' || event.type === 'OPP_GOAL') {
    const restored = event.meta.endedPenalty;
    const penalties =
      restored && !next.penalties.some((penalty) => penalty.id === restored.id)
        ? [...next.penalties, restored]
        : next.penalties;
    return event.type === 'GOAL'
      ? { ...next, penalties, scoreUs: Math.max(0, next.scoreUs - 1), sogUs: Math.max(0, next.sogUs - 1) }
      : { ...next, penalties, scoreOpp: Math.max(0, next.scoreOpp - 1), sogOpp: Math.max(0, next.sogOpp - 1) };
  }
  if (event.type === 'PENALTY' || event.type === 'OPP_PENALTY') {
    const ids = new Set(event.meta.penaltyIds ?? []);
    return { ...next, penalties: next.penalties.filter((penalty) => !ids.has(penalty.id)) };
  }
  if (event.type === 'PENALTY_SHOT') {
    return {
      ...next,
      scoreUs: Math.max(0, next.scoreUs - (event.meta.result === 'goal' ? 1 : 0)),
      sogUs: Math.max(0, next.sogUs - (event.meta.result === 'miss' ? 0 : 1)),
    };
  }
  if (event.type === 'OPP_PENALTY_SHOT') {
    return {
      ...next,
      scoreOpp: Math.max(0, next.scoreOpp - (event.meta.result === 'goal' ? 1 : 0)),
      sogOpp: Math.max(0, next.sogOpp - (event.meta.result === 'miss' ? 0 : 1)),
    };
  }
  return next;
}

export function gameClockLabel(game: Game, t = Date.now()) {
  return formatGameStamp(game.clock.period, readRemaining(game.clock, t));
}

export function replaceGame(state: AppState, game: Game): AppState {
  return { ...state, games: state.games.map((item) => (item.id === game.id ? game : item)) };
}
