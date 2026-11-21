import type { AppState, Player } from './types.ts';

export const TEAM_NAME = 'Portland Jr. Winterhawks 12U A1 Black';

export const SEED_PLAYERS: Player[] = [
  { id: 'p-1', number: '1', first: 'Emmett', last: 'Sawchuk', position: 'G' },
  { id: 'p-3', number: '3', first: 'Carson', last: 'Bader', position: 'F' },
  { id: 'p-10', number: '10', first: 'Kaden', last: 'Lasota', position: 'F' },
  { id: 'p-13', number: '13', first: 'Blake', last: 'Youngen', position: 'F' },
  { id: 'p-14', number: '14', first: 'Curtis', last: 'Moyer', position: 'F' },
  { id: 'p-16', number: '16', first: 'Sutter', last: 'Robinson', position: 'D' },
  { id: 'p-17', number: '17', first: 'Christopher', last: 'Mahan', position: 'G' },
  { id: 'p-18', number: '18', first: 'Andrew', last: 'Raimondi', position: 'D' },
  { id: 'p-19', number: '19', first: 'Leo', last: 'Krebsbach', position: 'F' },
  { id: 'p-44', number: '44', first: 'Everett', last: 'Lee', position: 'F' },
  { id: 'p-71', number: '71', first: 'Declan', last: 'Rayner', position: 'F' },
  { id: 'p-73', number: '73', first: 'Calvin', last: 'Lind', position: 'D' },
  { id: 'p-77', number: '77', first: 'Alex', last: 'Poulin', position: 'F' },
  { id: 'p-86', number: '86', first: 'Jeremy', last: 'Brown', position: 'D' },
  { id: 'p-88', number: '88', first: 'Boston', last: 'Smith', position: 'D' },
  { id: 'p-89', number: '89', first: 'Dellas', last: 'Potter', position: 'F' },
  { id: 'p-98', number: '98', first: 'Hudson', last: 'Bauer', position: 'F' },
];

export function initialState(): AppState {
  return {
    version: 1,
    teamName: TEAM_NAME,
    roster: SEED_PLAYERS.map((player) => ({ ...player })),
    filmLeadSeconds: 10,
    games: [],
  };
}
