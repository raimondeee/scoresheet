import assert from 'node:assert/strict';
import test from 'node:test';
import { shouldArchiveScorebook } from './backup.ts';
import { cleanDigits, eventTone, filmHref, formatClock, gameElapsedMs, manpower, plusMinusFor, readPenaltyRemaining, readRemaining, situation, videoSecondsFromAnchor, youtubeTimestamps } from './hockey.ts';
import { buildBox } from './stats.ts';
import {
  addOppGoal,
  addOppPenalty,
  addGreatPlay,
  addOppShot,
  addOurGoal,
  addOurShot,
  addOurPenalty,
  editEvent,
  addOurPenaltyShot,
  alignFilm,
  clearPenalty,
  createGame,
  finalizeGame,
  freeze,
  pauseClock,
  nextPeriod,
  removeEvent,
  renameGame,
  returnToEvent,
  setClock,
  setLengths,
  setPenaltyLengths,
  startClock,
  undo,
  updatePenalty,
} from './reducer.ts';
import type { NewGame, Player } from './types.ts';

const roster: Player[] = [
  { id: 'a', number: '3', first: 'Carson', last: 'Bader', position: 'F' },
  { id: 'b', number: '16', first: 'Sutter', last: 'Robinson', position: 'D' },
  { id: 'c', number: '71', first: 'Declan', last: 'Rayner', position: 'F' },
  { id: 'g', number: '1', first: 'Emmett', last: 'Sawchuk', position: 'G' },
];

function fresh() {
  const input: NewGame = {
    opponent: 'Seattle Jr. Kraken',
    date: '2026-11-20',
    homeAway: 'home',
    youtubeUrl: 'https://www.youtube.com/watch?v=tKJepKB0pjw',
    periodLengthsMs: [900000, 900000, 900000],
    otLengthMs: 300000,
    penaltyLengthsMs: { minor: 120000, major: 240000, misconduct: 600000 },
    goalieId: 'g',
    dressedIds: roster.map((player) => player.id),
  };
  return createGame(roster, input, 0);
}

test('clock remaining is anchored and does not drift', () => {
  let game = startClock(fresh(), 1_000);
  assert.equal(readRemaining(game.clock, 1_000), 900_000);
  assert.equal(readRemaining(game.clock, 3_500), 897_500);
  game = pauseClock(game, 3_500);
  assert.equal(game.clock.running, false);
  assert.equal(game.clock.remainingMs, 897_500);
  game = startClock(game, 4_000);
  assert.equal(readRemaining(game.clock, 6_000), 895_500);
  game = freeze(game, 6_000, true);
  assert.equal(game.clock.remainingMs, 895_500);
  assert.equal(readRemaining(game.clock, 9_000), 892_500);
  assert.equal(formatClock(900_000), '15:00');
  assert.equal(formatClock(899_001), '15:00');
  assert.equal(formatClock(899_000), '14:59');
  assert.equal(formatClock(1), '0:01');
  assert.equal(formatClock(0), '0:00');
});

test('penalties tick with the same anchor as the clock', () => {
  let game = addOppPenalty(fresh(), roster, { playerId: null, infraction: 'Tripping', kind: 'minor' }, 0);
  game = startClock(game, 10_000);
  assert.equal(readPenaltyRemaining(game.penalties[0], game.clock, 15_000), 115_000);
  game = pauseClock(game, 15_000);
  assert.equal(game.penalties[0].remainingMs, 115_000);
});

test('even-strength goal records a plus and coincidental minors stay', () => {
  let game = addOurPenalty(fresh(), roster, { playerId: 'a', infraction: 'Tripping', kind: 'minor' }, 0);
  game = addOppPenalty(game, roster, { playerId: null, infraction: 'Hooking', kind: 'minor' }, 0);
  assert.deepEqual(manpower(game.penalties), { our: 5, opp: 5, ourInBox: 1, oppInBox: 1 });
  game = addOurGoal(game, roster, { scorerId: 'a', assist1Id: 'b', assist2Id: null, onIceIds: ['a', 'b', 'c'], emptyNet: false }, 0);
  assert.equal(game.scoreUs, 1);
  assert.equal(game.sogUs, 1);
  assert.equal(game.events.at(-1)?.meta.strength, 'EV');
  assert.equal(game.events.at(-1)?.meta.plusMinus, 'plus');
  assert.equal(game.penalties.length, 2);
});

test('power-play goal has no plus/minus and ends one opposing minor', () => {
  let game = addOppPenalty(fresh(), roster, { playerId: null, infraction: 'Tripping', kind: 'minor' }, 0);
  game = addOppPenalty(game, roster, { playerId: null, infraction: 'Roughing', kind: 'minor' }, 0);
  assert.equal(manpower(game.penalties).our, 5);
  assert.equal(manpower(game.penalties).opp, 3);
  game = addOurGoal(game, roster, { scorerId: 'b', assist1Id: null, assist2Id: null, onIceIds: ['a', 'b'], emptyNet: false }, 0);
  assert.equal(game.events.at(-1)?.meta.plusMinus, 'none');
  assert.deepEqual(game.events.at(-1)?.meta.onIceIds, []);
  assert.equal(game.penalties.length, 1);
  assert.equal(game.scoreUs, 1);
});

test('shorthanded goal is a plus and does not end our minor', () => {
  let game = addOurPenalty(fresh(), roster, { playerId: 'c', infraction: 'Hooking', kind: 'minor' }, 0);
  game = addOurGoal(game, roster, { scorerId: 'a', assist1Id: null, assist2Id: null, onIceIds: ['a', 'b'], emptyNet: false }, 0);
  assert.equal(game.events.at(-1)?.meta.strength, 'SH');
  assert.equal(game.events.at(-1)?.meta.plusMinus, 'plus');
  assert.equal(game.penalties.length, 1);
});

test('opponent power-play goal ends our minor and skips plus/minus', () => {
  let game = addOurPenalty(fresh(), roster, { playerId: 'a', infraction: 'Slashing', kind: 'minor' }, 0);
  game = addOppGoal(game, roster, { oppNumber: '12', onIceIds: ['a', 'b'], emptyNet: false }, 0);
  assert.equal(game.events.at(-1)?.meta.strength, 'PP');
  assert.equal(game.events.at(-1)?.meta.plusMinus, 'none');
  assert.equal(game.penalties.length, 0);
  assert.equal(game.scoreOpp, 1);
});

test('shorthanded goal against is a minus and the power play stays alive', () => {
  let game = addOppPenalty(fresh(), roster, { playerId: null, infraction: 'Tripping', kind: 'minor' }, 0);
  game = addOppGoal(game, roster, { oppNumber: '', onIceIds: ['a', 'b', 'c'], emptyNet: false }, 0);
  assert.equal(game.events.at(-1)?.meta.strength, 'SH');
  assert.equal(game.events.at(-1)?.meta.plusMinus, 'minus');
  assert.equal(game.penalties.length, 1);
});

test('penalty-shot goal scores without plus/minus or a boxed player', () => {
  let game = addOurPenaltyShot(fresh(), roster, { playerId: 'a', result: 'goal' }, 0);
  assert.equal(game.scoreUs, 1);
  assert.equal(game.sogUs, 1);
  assert.equal(game.penalties.length, 0);
  assert.equal(game.events[0].meta.plusMinus, 'none');
  assert.equal(plusMinusFor(true, 'EV', true), 'none');
  assert.equal(plusMinusFor(true, 'PP', false), 'none');
  assert.equal(plusMinusFor(true, 'SH', false), 'plus');
  assert.equal(plusMinusFor(false, 'SH', false), 'minus');
});

test('undo restores a minor that a power-play goal ended', () => {
  let game = addOppPenalty(fresh(), roster, { playerId: null, infraction: 'Tripping', kind: 'minor' }, 0);
  game = addOurGoal(game, roster, { scorerId: 'a', assist1Id: null, assist2Id: null, onIceIds: [], emptyNet: false }, 0);
  assert.equal(game.penalties.length, 0);
  game = undo(game, 5);
  assert.equal(game.scoreUs, 0);
  assert.equal(game.penalties.length, 1);
  assert.equal(game.events.length, 1);
});

test('an opponent shot does not stop a running clock', () => {
  let game = startClock(fresh(), 1_000);
  game = addOppShot(game, roster, 2_000);
  assert.equal(game.clock.running, true);
  assert.equal(readRemaining(game.clock, 2_000), 899_000);
  assert.equal(game.sogOpp, 1);
});

test('our shots and great plays do not stop a running clock', () => {
  let game = startClock(fresh(), 1_000);
  game = addOurShot(game, roster, 'a', 2_000);
  game = addGreatPlay(game, 'Zone entry', 3_000);
  assert.equal(game.clock.running, true);
  assert.equal(readRemaining(game.clock, 3_000), 898_000);
  assert.equal(game.sogUs, 1);
  assert.equal(game.events.at(-1)?.type, 'GREAT_PLAY');
});

test('editing a penalty or its default length keeps the clock running', () => {
  let game = startClock(fresh(), 1_000);
  game = addOurPenalty(game, roster, { playerId: 'a', infraction: 'Hooking', kind: 'minor' }, 1_000);
  const penaltyId = game.penalties[0].id;
  game = updatePenalty(game, roster, penaltyId, { playerId: 'b', infraction: 'Tripping', kind: 'minor', remainingMs: 60_000 }, 4_000);
  assert.equal(game.clock.running, true);
  assert.equal(readRemaining(game.clock, 4_000), 897_000);
  assert.equal(game.penalties[0].remainingMs, 60_000);
  assert.equal(game.penalties[0].playerId, 'b');
  assert.match(game.events[0].detail, /Tripping/);
  game = setPenaltyLengths(game, { minor: 90_000, major: 240_000, misconduct: 600_000 }, 5_000);
  assert.equal(game.clock.running, true);
  assert.equal(game.penaltyLengthsMs.minor, 90_000);
  assert.equal(game.penalties[0].durationMs, 90_000);
  assert.equal(game.penalties[0].remainingMs, 29_000);
  game = clearPenalty(game, roster, penaltyId, 6_000);
  assert.equal(game.clock.running, true);
  assert.equal(game.penalties.length, 0);
  game = undo(game, 7_000);
  assert.equal(game.penalties.length, 1);
});

test('return to a tag restores the clock, film time, and penalty', () => {
  let game = setClock(fresh(), 470_000, 1_000);
  game = { ...game, videoSeconds: 100 };
  game = addOurPenalty(game, roster, { playerId: 'a', infraction: 'Tripping', kind: 'minor' }, 1_500);
  const penalty = game.events.find((event) => event.type === 'PENALTY')!;
  assert.equal(penalty.clockMs, 470_000);
  assert.equal(penalty.videoSeconds, 100);
  assert.equal(penalty.meta.board?.penalties[0]?.remainingMs, 120_000);

  game = startClock(game, 2_000);
  game = freeze(game, 32_000, true);
  game = { ...game, videoSeconds: 160 };
  game = addOppShot(game, roster, 62_000);
  game = { ...game, videoSeconds: 220 };
  game = addOppShot(game, roster, 92_000);
  const firstShot = game.events.find((event) => event.type === 'OPP_SHOT')!;
  assert.equal(firstShot.clockMs, 410_000);
  assert.equal(firstShot.meta.board?.penalties[0]?.remainingMs, 60_000);

  const restored = returnToEvent(game, penalty.id, 120_000);
  assert.equal(restored.clock.running, false);
  assert.equal(restored.clock.remainingMs, 470_000);
  assert.equal(restored.penalties.length, 1);
  assert.equal(restored.penalties[0].remainingMs, 120_000);
  assert.equal(restored.videoSeconds, 100);
  assert.equal(restored.sogOpp, 0);
  assert.equal(restored.goalieMs.g ?? 0, 0);
  assert.equal(restored.events.some((event) => event.type === 'OPP_SHOT'), false);

  const atShot = returnToEvent(game, firstShot.id, 120_000);
  assert.equal(atShot.clock.remainingMs, 410_000);
  assert.equal(atShot.penalties[0].remainingMs, 60_000);
  assert.equal(atShot.videoSeconds, 160);
  assert.equal(atShot.sogOpp, 1);
  assert.equal(atShot.goalieMs.g, 60_000);
  assert.equal(atShot.events.length, game.events.length - 1);

  const legacy = {
    ...game,
    events: game.events.map((event) =>
      event.id === penalty.id ? { ...event, meta: { ...event.meta, board: undefined } } : event,
    ),
  };
  const replayed = returnToEvent(legacy, penalty.id, 120_000);
  assert.equal(replayed.clock.remainingMs, 470_000);
  assert.equal(replayed.penalties[0].remainingMs, 120_000);
  assert.equal(replayed.videoSeconds, 100);
});

test('shortening the period in progress pulls the live clock back', () => {
  let game = startClock(fresh(), 1_000);
  game = { ...game, videoSeconds: 50 };
  game = setLengths(
    game,
    {
      periodLengthsMs: [780_000, 900_000, 900_000],
      otLengthMs: game.otLengthMs,
      penaltyLengthsMs: game.penaltyLengthsMs,
    },
    301_000,
  );
  assert.equal(game.clock.running, true);
  assert.equal(readRemaining(game.clock, 301_000), 480_000);
  assert.equal(game.videoSeconds, 50);
});

test('a shorter period pulls the game clock and stamps back and leaves YouTube time alone', () => {
  let game = setClock(fresh(), 600_000, 1_000);
  game = {
    ...game,
    videoSeconds: 1_000,
    events: game.events.map((event) => ({ ...event, videoSeconds: 125 })),
  };
  game = addOurShot(game, roster, 'a', 1_000);
  const shot = game.events.find((event) => event.type === 'SHOT')!;
  game = {
    ...game,
    events: game.events.map((event) => (event.id === shot.id ? { ...event, videoSeconds: 200, clockMs: 600_000 } : event)),
  };
  game = nextPeriod(game, 2_000);
  const beforeOt = game.otLengthMs;
  game = setLengths(
    game,
    {
      periodLengthsMs: [780_000, 900_000, 900_000],
      otLengthMs: beforeOt,
      penaltyLengthsMs: game.penaltyLengthsMs,
    },
    3_000,
  );
  assert.equal(game.periodLengthsMs[0], 780_000);
  assert.equal(game.clock.period, 2);
  assert.equal(game.clock.remainingMs, 900_000);
  const clockEvent = game.events.find((event) => event.type === 'CLOCK')!;
  assert.equal(clockEvent.clockMs, 480_000);
  assert.equal(clockEvent.videoSeconds, 125);
  assert.match(clockEvent.detail, /8:00/);
  const shiftedShot = game.events.find((event) => event.type === 'SHOT')!;
  assert.equal(shiftedShot.clockMs, 480_000);
  assert.equal(shiftedShot.videoSeconds, 200);
  assert.equal(game.videoSeconds, 1_000);
  assert.equal(gameElapsedMs(game, 1, shiftedShot.clockMs), 300_000);
  const periodEvent = game.events.find((event) => event.type === 'PERIOD')!;
  assert.equal(periodEvent.period, 2);
  assert.equal(periodEvent.clockMs, 900_000);
  assert.equal(periodEvent.videoSeconds, 1_000);

  game = startClock(game, 4_000);
  game = setLengths(
    game,
    {
      periodLengthsMs: game.periodLengthsMs,
      otLengthMs: 180_000,
      penaltyLengthsMs: game.penaltyLengthsMs,
    },
    4_000,
  );
  assert.equal(game.clock.running, true);
  assert.equal(game.otLengthMs, 180_000);
  assert.equal(readRemaining(game.clock, 4_000), 900_000);
});

test('a running penalty shares the game clock and is not counted twice', () => {
  let game = startClock(fresh(), 1_000);
  game = addOurPenalty(game, roster, { playerId: 'a', infraction: 'Hooking', kind: 'minor' }, 1_000);
  const at = 6_000;
  const raw = game.penalties[0];
  const shown = readPenaltyRemaining(raw, game.clock, at);
  assert.equal(readRemaining(game.clock, at), 895_000);
  assert.equal(shown, 115_000);
  const live = situation(game.penalties, game.clock, at).penalties[0];
  assert.equal(live.remainingMs, shown);
});

test('editing and removing an event keeps the score in step', () => {
  let game = addOppPenalty(fresh(), roster, { playerId: null, infraction: 'Tripping', kind: 'minor' }, 0);
  game = addOurGoal(game, roster, { scorerId: 'a', assist1Id: 'b', assist2Id: null, onIceIds: ['a', 'b'], emptyNet: false }, 0);
  const goal = game.events.at(-1)!;
  assert.equal(game.scoreUs, 1);
  assert.equal(game.penalties.length, 0);
  game = editEvent(
    game,
    roster,
    goal.id,
    {
      period: 1,
      clockMs: 840_000,
      videoSeconds: 90,
      playerId: null,
      scorerId: 'c',
      assist1Id: null,
      assist2Id: null,
      onIceIds: ['c'],
      oppNumber: '',
      emptyNet: false,
      infraction: '',
      note: '',
      result: 'save',
    },
    1_000,
  );
  assert.equal(game.scoreUs, 1);
  assert.equal(game.events.at(-1)?.meta.scorerId, 'c');
  assert.equal(game.events.at(-1)?.clockMs, 840_000);
  assert.match(game.events.at(-1)?.detail ?? '', /Unassisted/);
  game = removeEvent(game, goal.id, 2_000);
  assert.equal(game.scoreUs, 0);
  assert.equal(game.penalties.length, 1);
});

test('one YouTube stamp lines the other events up by the game clock', () => {
  const lengths = { periodLengthsMs: [900_000, 900_000, 900_000] as [number, number, number], otLengthMs: 300_000 };
  assert.equal(gameElapsedMs(lengths, 1, 840_000), 60_000);
  assert.equal(gameElapsedMs(lengths, 2, 900_000), 900_000);
  const anchor = { period: 1, clockMs: 840_000 };
  assert.equal(videoSecondsFromAnchor(lengths, anchor, 3723, { period: 1, clockMs: 780_000 }), 3723 + 60);
  assert.equal(videoSecondsFromAnchor(lengths, anchor, 10, { period: 1, clockMs: 870_000 }), 0);

  let game = addOurShot(fresh(), roster, 'a', 0);
  game = { ...game, events: game.events.map((event, index) => (index === 0 ? { ...event, period: 1, clockMs: 840_000 } : event)) };
  game = addOurGoal(
    game,
    roster,
    { scorerId: 'a', assist1Id: null, assist2Id: null, onIceIds: ['a'], emptyNet: false },
    1_000,
  );
  game = { ...game, events: game.events.map((event) => (event.type === 'GOAL' ? { ...event, period: 1, clockMs: 780_000 } : event)) };
  const shot = game.events[0];
  game = alignFilm(game, shot.id, 3_723, 2_000);
  assert.equal(game.events[0].videoSeconds, 3_723);
  assert.equal(game.events.find((event) => event.type === 'GOAL')?.videoSeconds, 3_783);

  const goal = game.events.find((event) => event.type === 'GOAL')!;
  game = {
    ...game,
    events: [...game.events, { ...goal, id: 'later', clockMs: 720_000, videoSeconds: 1 }],
  };
  game = alignFilm(game, goal.id, 5_000, 3_000, true);
  assert.equal(game.events[0].videoSeconds, 3_723);
  assert.equal(game.events.find((event) => event.id === goal.id)?.videoSeconds, 5_000);
  assert.equal(game.events.find((event) => event.id === 'later')?.videoSeconds, 5_060);
});

test('aligning below a tag leaves earlier stamps and stops at the next aligned tag', () => {
  let game = addOurShot(fresh(), roster, 'a', 0);
  const early = game.events[0];
  game = {
    ...game,
    events: [
      { ...early, clockMs: 840_000 },
      { ...early, id: 'mid', clockMs: 780_000 },
      { ...early, id: 'late', clockMs: 720_000 },
    ],
  };
  game = alignFilm(game, early.id, 100, 1_000, true);
  assert.equal(game.events[1].videoSeconds, 160);
  game = alignFilm(game, 'late', 400, 2_000, true);
  game = alignFilm(game, early.id, 80, 3_000, true);
  assert.equal(game.events[0].videoSeconds, 80);
  assert.equal(game.events[0].meta.videoPinned, true);
  assert.equal(game.events[1].videoSeconds, 140);
  assert.equal(game.events[1].meta.videoPinned, false);
  assert.equal(game.events[2].videoSeconds, 400);
  assert.equal(game.events[2].meta.videoPinned, true);
});

test('a time field can be cleared without keeping a leading zero', () => {
  assert.equal(cleanDigits('013'), '13');
  assert.equal(cleanDigits(''), '');
  assert.equal(cleanDigits('0'), '0');
  assert.equal(cleanDigits('99', 2, 59), '59');
});

test('renaming a game keeps the score and updates the name and date', () => {
  const game = fresh();
  const next = renameGame(game, '  Everett Selects  ', '2026-09-26', 5_000);
  assert.equal(next.opponent, 'Everett Selects');
  assert.equal(next.date, '2026-09-26');
  assert.equal(next.scoreUs, game.scoreUs);
  assert.equal(next.events.length, game.events.length);
  assert.equal(renameGame(game, '   ', '2026-01-01', 5_000), game);
  assert.equal(renameGame(game, 'Everett', 'September', 1).date, game.date);
});

test('youtube timestamps list goals and can add penalties and shots', () => {
  const names = [
    { id: 'p77', number: '77', first: 'Alex', last: 'Poulin' },
    { id: 'p3', number: '3', first: 'Carson', last: 'Bader' },
  ];
  const game = { opponent: 'Montana Wolves' };
  const events = [
    { type: 'SHOT' as const, period: 1, videoSeconds: 400, meta: { playerId: 'p3' } },
    { type: 'GOAL' as const, period: 1, videoSeconds: 999, meta: { scorerId: 'p77' } },
    { type: 'GOAL' as const, period: 1, videoSeconds: null, meta: { scorerId: 'p3' } },
    { type: 'OPP_GOAL' as const, period: 1, videoSeconds: 1446, meta: {} },
    { type: 'PERIOD' as const, period: 2, videoSeconds: 1701, meta: {} },
    { type: 'PENALTY' as const, period: 2, videoSeconds: 1800, meta: { playerId: 'p3', infraction: 'Tripping' } },
    { type: 'GOAL' as const, period: 2, videoSeconds: 1977, meta: { scorerId: 'p3' } },
    { type: 'OPP_SHOT' as const, period: 2, videoSeconds: 2000, meta: {} },
    { type: 'PENALTY_SHOT' as const, period: 2, videoSeconds: 2100, meta: { playerId: 'p77', result: 'goal' } },
    { type: 'PENALTY_SHOT' as const, period: 2, videoSeconds: 2200, meta: { playerId: 'p77', result: 'miss' } },
  ];
  const goals = youtubeTimestamps(game, names, events, { goals: true, penalties: false, shots: false });
  assert.equal(goals.missing, 1);
  assert.equal(
    goals.text,
    [
      '00:00:00',
      '',
      '00:16:39 #77 Alex Poulin',
      '00:24:06 Montana Wolves',
      '',
      `00:28:21${' '.repeat(20)}— period 2 —`,
      '',
      '00:32:57 #3 Carson Bader',
      '00:35:00 #77 Alex Poulin',
    ].join('\n'),
  );
  const full = youtubeTimestamps(game, names, events, { goals: true, penalties: true, shots: true });
  assert.match(full.text, /00:06:40 #3 Carson Bader — shot/);
  assert.match(full.text, /00:30:00 #3 Carson Bader — Tripping/);
  assert.match(full.text, /00:33:20 Montana Wolves — shot/);
  assert.equal(full.text.includes('00:36:40'), false);
  assert.equal(youtubeTimestamps(game, names, events, { goals: false, penalties: false, shots: false }).text, '');
});

test('event colors follow the kind of play', () => {
  assert.equal(eventTone({ type: 'GOAL' }), 'goal');
  assert.equal(eventTone({ type: 'OPP_GOAL' }), 'goal');
  assert.equal(eventTone({ type: 'PENALTY' }), 'penalty');
  assert.equal(eventTone({ type: 'OPP_PENALTY' }), 'penalty');
  assert.equal(eventTone({ type: 'OPP_SHOT' }), 'save');
  assert.equal(eventTone({ type: 'PENALTY_SHOT', meta: { result: 'save' } }), 'save');
  assert.equal(eventTone({ type: 'PENALTY_SHOT', meta: { result: 'goal' } }), 'goal');
  assert.equal(eventTone({ type: 'SHOT' }), 'shot');
  assert.equal(eventTone({ type: 'GREAT_PLAY' }), 'play');
});

test('film links open the lead time before the tag', () => {
  assert.equal(
    filmHref('https://www.youtube.com/watch?v=tKJepKB0pjw', 100, 10),
    'https://www.youtube.com/watch?v=tKJepKB0pjw&t=90s',
  );
  assert.equal(filmHref('https://youtu.be/abc123XYZ', 5, 10), 'https://www.youtube.com/watch?v=abc123XYZ&t=0s');
  assert.equal(filmHref('', 20, 5), null);
});

test('scorebook copies are kept at a new game, a new period, and the final', () => {
  const book = (games: unknown[]) => JSON.stringify({ version: 1, games });
  const game = { id: 'g1', status: 'live', clock: { period: 1 } };
  assert.equal(shouldArchiveScorebook(book([]), book([game])), true);
  assert.equal(shouldArchiveScorebook(book([game]), book([{ ...game, scoreUs: 1 }])), false);
  assert.equal(shouldArchiveScorebook(book([game]), book([{ ...game, clock: { period: 2 } }])), true);
  assert.equal(
    shouldArchiveScorebook(book([{ ...game, clock: { period: 3 } }]), book([{ ...game, status: 'final', clock: { period: 3 } }])),
    true,
  );
  assert.equal(shouldArchiveScorebook(book([game]), book([game])), false);
});

test('extra skater columns follow power-play, shorthanded, and game-winning goals', () => {
  let game = addOurGoal(fresh(), roster, { scorerId: 'a', assist1Id: 'b', assist2Id: null, onIceIds: ['a', 'b'], emptyNet: false }, 0);
  game = addOppGoal(game, roster, { oppNumber: '', onIceIds: ['a'], emptyNet: false }, 0);
  game = addOurGoal(game, roster, { scorerId: 'c', assist1Id: null, assist2Id: null, onIceIds: ['c'], emptyNet: false }, 0);
  game = addOppPenalty(game, roster, { playerId: null, infraction: 'Tripping', kind: 'minor' }, 0);
  game = addOurGoal(game, roster, { scorerId: 'b', assist1Id: null, assist2Id: null, onIceIds: [], emptyNet: false }, 0);
  game = addOurPenalty(game, roster, { playerId: 'c', infraction: 'Hooking', kind: 'minor' }, 0);
  game = addOurGoal(game, roster, { scorerId: 'a', assist1Id: null, assist2Id: null, onIceIds: ['a'], emptyNet: false }, 0);
  game = addOurPenaltyShot(game, roster, { playerId: 'c', result: 'goal' }, 0);
  game = finalizeGame(game, 1);
  const box = buildBox(game, roster);
  const line = (id: string) => box.skaters.find((skater) => skater.id === id);
  assert.equal(line('c')?.gwg, 1);
  assert.equal(line('a')?.gwg, 0);
  assert.equal(line('b')?.ppg, 1);
  assert.equal(line('a')?.shg, 1);
  assert.equal(line('a')?.highlights, 2);
  assert.equal(line('b')?.highlights, 2);
  assert.equal(line('c')?.highlights, 1);
  assert.equal(line('c')?.g, 2);
});
