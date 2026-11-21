type SavedGame = {
  id?: string;
  status?: string;
  clock?: { period?: number };
};

function gamesIn(text: string): SavedGame[] {
  const state = JSON.parse(text) as { games?: SavedGame[] };
  return Array.isArray(state.games) ? state.games : [];
}

/** Keep a copy only when a game is added, a period starts, or a game is finalized. */
export function shouldArchiveScorebook(previousText: string, nextText: string) {
  const before = new Map(gamesIn(previousText).map((game) => [game.id, game]));
  for (const game of gamesIn(nextText)) {
    if (!game.id) continue;
    const prior = before.get(game.id);
    if (!prior) return true;
    const period = game.clock?.period ?? 1;
    const priorPeriod = prior.clock?.period ?? 1;
    if (period > priorPeriod) return true;
    if (prior.status !== 'final' && game.status === 'final') return true;
  }
  return false;
}
