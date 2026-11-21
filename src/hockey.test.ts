import assert from 'node:assert/strict';
import test from 'node:test';
import { filmHref, formatClock, gameElapsedMs, manpower, plusMinusFor, readPenaltyRemaining, readRemaining, situation, videoSecondsFromAnchor } from './hockey.ts';
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
  removeEvent,
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
});

test('film links open the lead time before the tag', () => {
  assert.equal(
    filmHref('https://www.youtube.com/watch?v=tKJepKB0pjw', 100, 10),
    'https://www.youtube.com/watch?v=tKJepKB0pjw&t=90s',
  );
  assert.equal(filmHref('https://youtu.be/abc123XYZ', 5, 10), 'https://www.youtube.com/watch?v=abc123XYZ&t=0s');
  assert.equal(filmHref('', 20, 5), null);
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
