export type Position = 'F' | 'D' | 'G';

export type Player = {
  id: string;
  number: string;
  first: string;
  last: string;
  position: Position;
};

export type PlayerSnapshot = {
  number: string;
  first: string;
  last: string;
  position: Position;
};

export type Strength = 'EV' | 'PP' | 'SH';
export type PlusMinus = 'plus' | 'minus' | 'none';
export type PenaltyKind = 'minor' | 'major' | 'misconduct';
export type ShotResult = 'goal' | 'save' | 'miss';

export type ActivePenalty = {
  id: string;
  side: 'us' | 'opp';
  playerId: string | null;
  infraction: string;
  kind: PenaltyKind;
  durationMs: number;
  remainingMs: number;
  affectsStrength: boolean;
  endsOnGoal: boolean;
};

export type EventType =
  | 'SHOT'
  | 'OPP_SHOT'
  | 'GOAL'
  | 'OPP_GOAL'
  | 'PENALTY'
  | 'OPP_PENALTY'
  | 'PENALTY_SHOT'
  | 'OPP_PENALTY_SHOT'
  | 'GREAT_PLAY'
  | 'GOALIE'
  | 'PERIOD'
  | 'CLOCK'
  | 'PENALTY_CLEAR';

export type EventMeta = {
  playerId?: string | null;
  scorerId?: string | null;
  assist1Id?: string | null;
  assist2Id?: string | null;
  onIceIds?: string[];
  strength?: Strength;
  plusMinus?: PlusMinus;
  goalieId?: string | null;
  emptyNet?: boolean;
  endedPenalty?: ActivePenalty | null;
  infraction?: string;
  kind?: string;
  pimMs?: number;
  penaltyIds?: string[];
  openedPp?: boolean;
  openedPk?: boolean;
  result?: ShotResult;
  oppNumber?: string;
  note?: string;
  previousGoalieId?: string | null;
  nextGoalieId?: string | null;
  previousPeriod?: number;
  previousRemainingMs?: number;
  /** Score, shots, goalie, penalties, and goalie time immediately after this tag. */
  board?: BoardMark;
};

export type BoardMark = {
  scoreUs: number;
  scoreOpp: number;
  sogUs: number;
  sogOpp: number;
  goalieId: string | null;
  penalties: ActivePenalty[];
  goalieMs?: Record<string, number>;
};

export type GameEvent = {
  id: string;
  type: EventType;
  period: number;
  clockMs: number;
  at: string;
  detail: string;
  videoSeconds: number | null;
  meta: EventMeta;
};

export type Clock = {
  period: number;
  running: boolean;
  remainingMs: number;
  anchorEpoch: number | null;
  anchorRemainingMs: number | null;
};

export type PenaltyLengths = {
  minor: number;
  major: number;
  misconduct: number;
};

export type Game = {
  id: string;
  opponent: string;
  date: string;
  homeAway: 'home' | 'away';
  youtubeUrl: string;
  status: 'live' | 'final';
  createdAt: string;
  updatedAt: string;
  finalizedAt: string | null;
  periodLengthsMs: [number, number, number];
  otLengthMs: number;
  penaltyLengthsMs: PenaltyLengths;
  clock: Clock;
  starterGoalieId: string | null;
  goalieId: string | null;
  lastGoalieId: string | null;
  goalieMs: Record<string, number>;
  dressedIds: string[];
  playerSnapshots: Record<string, PlayerSnapshot>;
  scoreUs: number;
  scoreOpp: number;
  sogUs: number;
  sogOpp: number;
  penalties: ActivePenalty[];
  events: GameEvent[];
  videoSeconds: number | null;
};

export type AppState = {
  version: 1;
  teamName: string;
  roster: Player[];
  filmLeadSeconds: number;
  games: Game[];
};

export type NewGame = {
  opponent: string;
  date: string;
  homeAway: 'home' | 'away';
  youtubeUrl: string;
  periodLengthsMs: [number, number, number];
  otLengthMs: number;
  penaltyLengthsMs: PenaltyLengths;
  goalieId: string | null;
  dressedIds: string[];
};

export type GoalInput = {
  scorerId: string;
  assist1Id: string | null;
  assist2Id: string | null;
  onIceIds: string[];
  emptyNet: boolean;
};

export type OppGoalInput = {
  oppNumber: string;
  onIceIds: string[];
  emptyNet: boolean;
};

export type BoxPenaltyInput = {
  playerId: string | null;
  infraction: string;
  kind: PenaltyKind | 'double-minor';
};

export type PenaltyShotInput = {
  playerId: string | null;
  result: ShotResult;
};

export type PenaltyEdit = {
  playerId: string | null;
  infraction: string;
  kind: PenaltyKind;
  remainingMs: number;
};

export type EventEdit = {
  period: number;
  clockMs: number;
  videoSeconds: number | null;
  playerId: string | null;
  scorerId: string | null;
  assist1Id: string | null;
  assist2Id: string | null;
  onIceIds: string[];
  oppNumber: string;
  emptyNet: boolean;
  infraction: string;
  note: string;
  result: ShotResult;
};

export type View = 'home' | 'setup' | 'live' | 'roster' | 'games' | 'game' | 'stats' | 'film';
