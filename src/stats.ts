import { clockElapsed } from './hockey.ts';
import type { Game, Player, Position } from './types.ts';

export type SkaterLine = {
  id: string;
  number: string;
  name: string;
  position: Position;
  gp: number;
  g: number;
  a: number;
  pts: number;
  sog: number;
  pimMs: number;
  plusMinus: number;
  ppg: number;
  shg: number;
  gwg: number;
  highlights: number;
};

export type GoalieLine = {
  id: string;
  number: string;
  name: string;
  gp: number;
  minMs: number;
  w: number;
  l: number;
  t: number;
  sa: number;
  sv: number;
  ga: number;
};

export type TeamLine = {
  games: number;
  wins: number;
  losses: number;
  ties: number;
  gf: number;
  ga: number;
  sog: number;
  oppSog: number;
  ppOpps: number;
  ppGoals: number;
  shGoals: number;
  pkOpps: number;
  ppAgainst: number;
  shAgainst: number;
};

function blankSkater(player: Player): SkaterLine {
  return {
    id: player.id,
    number: player.number,
    name: `${player.first} ${player.last}`.trim(),
    position: player.position,
    gp: 0,
    g: 0,
    a: 0,
    pts: 0,
    sog: 0,
    pimMs: 0,
    plusMinus: 0,
    ppg: 0,
    shg: 0,
    gwg: 0,
    highlights: 0,
  };
}

function blankGoalie(player: Player): GoalieLine {
  return {
    id: player.id,
    number: player.number,
    name: `${player.first} ${player.last}`.trim(),
    gp: 0,
    minMs: 0,
    w: 0,
    l: 0,
    t: 0,
    sa: 0,
    sv: 0,
    ga: 0,
  };
}

export function resolvePlayer(game: Game, roster: Player[], id: string): Player {
  const live = roster.find((player) => player.id === id);
  if (live) return live;
  const snap = game.playerSnapshots[id];
  if (snap) return { id, ...snap };
  return { id, number: '?', first: 'Unknown', last: 'player', position: 'F' };
}

export function buildBox(game: Game, roster: Player[], now = Date.now()) {
  const skaterMap = new Map<string, SkaterLine>();
  const goalieMap = new Map<string, GoalieLine>();

  const ensureSkater = (id: string) => {
    let line = skaterMap.get(id);
    if (!line) {
      line = blankSkater(resolvePlayer(game, roster, id));
      skaterMap.set(id, line);
    }
    return line;
  };
  const ensureGoalie = (id: string) => {
    let line = goalieMap.get(id);
    if (!line) {
      line = blankGoalie(resolvePlayer(game, roster, id));
      goalieMap.set(id, line);
    }
    return line;
  };

  for (const id of game.dressedIds) {
    const player = resolvePlayer(game, roster, id);
    if (player.position === 'G') ensureGoalie(id);
    else ensureSkater(id);
  }

  for (const event of game.events) {
    const meta = event.meta;
    if (event.type === 'SHOT' && meta.playerId) ensureSkater(meta.playerId).sog += 1;
    if (event.type === 'GOAL' && meta.scorerId) {
      const line = ensureSkater(meta.scorerId);
      line.g += 1;
      line.sog += 1;
      line.highlights += 1;
      if (meta.strength === 'PP') line.ppg += 1;
      if (meta.strength === 'SH') line.shg += 1;
      if (meta.assist1Id) {
        const assist = ensureSkater(meta.assist1Id);
        assist.a += 1;
        assist.highlights += 1;
      }
      if (meta.assist2Id) {
        const assist = ensureSkater(meta.assist2Id);
        assist.a += 1;
        assist.highlights += 1;
      }
      if (meta.plusMinus === 'plus') {
        for (const id of meta.onIceIds ?? []) ensureSkater(id).plusMinus += 1;
      }
    }
    if (event.type === 'OPP_GOAL' && meta.plusMinus === 'minus') {
      for (const id of meta.onIceIds ?? []) ensureSkater(id).plusMinus -= 1;
    }
    if (event.type === 'OPP_GOAL' && meta.goalieId && !meta.emptyNet) {
      const goalie = ensureGoalie(meta.goalieId);
      goalie.sa += 1;
      goalie.ga += 1;
    }
    if (event.type === 'OPP_SHOT' && meta.goalieId) {
      const goalie = ensureGoalie(meta.goalieId);
      goalie.sa += 1;
      goalie.sv += 1;
    }
    if ((event.type === 'PENALTY' || event.type === 'OPP_PENALTY') && meta.playerId && event.type === 'PENALTY') {
      ensureSkater(meta.playerId).pimMs += meta.pimMs ?? 0;
    }
    if (event.type === 'PENALTY_SHOT' && meta.playerId && meta.result !== 'miss') {
      const line = ensureSkater(meta.playerId);
      line.sog += 1;
      if (meta.result === 'goal') line.g += 1;
    }
    if (event.type === 'OPP_PENALTY_SHOT' && meta.goalieId && meta.result !== 'miss') {
      const goalie = ensureGoalie(meta.goalieId);
      goalie.sa += 1;
      if (meta.result === 'save') goalie.sv += 1;
      if (meta.result === 'goal') goalie.ga += 1;
    }
  }

  for (const [id, ms] of Object.entries(game.goalieMs)) {
    ensureGoalie(id).minMs += ms;
  }
  if (game.clock.running && game.goalieId) {
    ensureGoalie(game.goalieId).minMs += clockElapsed(game.clock, now);
  }

  if (game.status === 'final' && game.scoreUs > game.scoreOpp) {
    const decidingGoal = game.scoreOpp + 1;
    let ourGoals = 0;
    for (const event of game.events) {
      const scored = event.type === 'GOAL' || (event.type === 'PENALTY_SHOT' && event.meta.result === 'goal');
      if (!scored) continue;
      ourGoals += 1;
      if (ourGoals !== decidingGoal) continue;
      const scorerId = event.type === 'GOAL' ? event.meta.scorerId : event.meta.playerId;
      if (scorerId) ensureSkater(scorerId).gwg += 1;
      break;
    }
  }

  for (const line of skaterMap.values()) line.pts = line.g + line.a;

  const playedGoalies = new Set<string>();
  if (game.starterGoalieId) playedGoalies.add(game.starterGoalieId);
  for (const line of goalieMap.values()) {
    if (line.minMs > 0 || line.sa > 0) playedGoalies.add(line.id);
  }
  for (const line of goalieMap.values()) {
    line.gp = playedGoalies.has(line.id) ? 1 : 0;
    if (game.status === 'final' && game.lastGoalieId === line.id) {
      if (game.scoreUs > game.scoreOpp) line.w = 1;
      else if (game.scoreUs < game.scoreOpp) line.l = 1;
      else line.t = 1;
    }
  }
  for (const line of skaterMap.values()) {
    if (game.dressedIds.includes(line.id)) line.gp = 1;
  }

  const skaters = [...skaterMap.values()].sort((a, b) => Number(a.number) - Number(b.number));
  const goalies = [...goalieMap.values()].sort((a, b) => Number(a.number) - Number(b.number));
  return { skaters, goalies };
}

export function buildSeason(games: Game[], roster: Player[]) {
  const finals = games.filter((game) => game.status === 'final');
  const skaterMap = new Map<string, SkaterLine>();
  const goalieMap = new Map<string, GoalieLine>();
  const team: TeamLine = {
    games: finals.length,
    wins: 0,
    losses: 0,
    ties: 0,
    gf: 0,
    ga: 0,
    sog: 0,
    oppSog: 0,
    ppOpps: 0,
    ppGoals: 0,
    shGoals: 0,
    pkOpps: 0,
    ppAgainst: 0,
    shAgainst: 0,
  };

  for (const game of finals) {
    if (game.scoreUs > game.scoreOpp) team.wins += 1;
    else if (game.scoreUs < game.scoreOpp) team.losses += 1;
    else team.ties += 1;
    team.gf += game.scoreUs;
    team.ga += game.scoreOpp;
    team.sog += game.sogUs;
    team.oppSog += game.sogOpp;
    const box = buildBox(game, roster);
    for (const line of box.skaters) {
      const current = skaterMap.get(line.id) ?? {
        ...line,
        gp: 0,
        g: 0,
        a: 0,
        pts: 0,
        sog: 0,
        pimMs: 0,
        plusMinus: 0,
        ppg: 0,
        shg: 0,
        gwg: 0,
        highlights: 0,
      };
      current.gp += line.gp;
      current.g += line.g;
      current.a += line.a;
      current.pts += line.pts;
      current.sog += line.sog;
      current.pimMs += line.pimMs;
      current.plusMinus += line.plusMinus;
      current.ppg += line.ppg;
      current.shg += line.shg;
      current.gwg += line.gwg;
      current.highlights += line.highlights;
      current.name = line.name;
      current.number = line.number;
      current.position = line.position;
      skaterMap.set(line.id, current);
    }
    for (const line of box.goalies) {
      const current = goalieMap.get(line.id) ?? { ...line, gp: 0, minMs: 0, w: 0, l: 0, t: 0, sa: 0, sv: 0, ga: 0 };
      current.gp += line.gp;
      current.minMs += line.minMs;
      current.w += line.w;
      current.l += line.l;
      current.t += line.t;
      current.sa += line.sa;
      current.sv += line.sv;
      current.ga += line.ga;
      current.name = line.name;
      current.number = line.number;
      goalieMap.set(line.id, current);
    }
    for (const event of game.events) {
      if (event.meta.openedPp) team.ppOpps += 1;
      if (event.meta.openedPk) team.pkOpps += 1;
      if (event.type === 'GOAL' && event.meta.strength === 'PP') team.ppGoals += 1;
      if (event.type === 'GOAL' && event.meta.strength === 'SH') team.shGoals += 1;
      if (event.type === 'OPP_GOAL' && event.meta.strength === 'PP') team.ppAgainst += 1;
      if (event.type === 'OPP_GOAL' && event.meta.strength === 'SH') team.shAgainst += 1;
    }
  }

  const skaters = [...skaterMap.values()].sort((a, b) => b.pts - a.pts || b.g - a.g || Number(a.number) - Number(b.number));
  const goalies = [...goalieMap.values()].sort((a, b) => b.sv - a.sv || Number(a.number) - Number(b.number));
  return { team, skaters, goalies };
}

export function perGame(points: number, games: number) {
  if (!games) return '—';
  return (points / games).toFixed(2);
}

export function pct(part: number, whole: number) {
  if (!whole) return '—';
  return `${Math.round((part / whole) * 1000) / 10}%`;
}

export function shootPct(goals: number, shots: number) {
  if (!shots) return '—';
  return `${((goals / shots) * 100).toFixed(1)}%`;
}

export function svPct(sv: number, sa: number) {
  if (!sa) return '—';
  return `${((sv / sa) * 100).toFixed(1)}%`;
}

export function gaa(ga: number, minMs: number) {
  if (!minMs) return '—';
  return ((ga * 3600000) / minMs).toFixed(2);
}
