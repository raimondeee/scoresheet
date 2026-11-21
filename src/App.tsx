import { useEffect } from 'react';
import { Shell } from './components/Shell.tsx';
import { StoreProvider, useApp } from './store.tsx';
import { Film } from './views/Film.tsx';
import { GameDetail, Games } from './views/Games.tsx';
import { Home } from './views/Home.tsx';
import { Live } from './views/Live.tsx';
import { Roster } from './views/Roster.tsx';
import { Setup } from './views/Setup.tsx';
import { Stats } from './views/Stats.tsx';
import type { View } from './types.ts';

function Root() {
  const app = useApp();
  const game = app.state.games.find((item) => item.id === app.gameId);
  const tone = app.view === 'live' ? (game?.clock.running ? 'running' : 'paused') : 'neutral';

  useEffect(() => {
    document.body.dataset.tone = tone;
    const label = app.view === 'live' && game ? `${game.scoreUs}–${game.scoreOpp} ${game.opponent}` : 'Winterhawks Scorekeeper';
    document.title = label;
    return () => {
      delete document.body.dataset.tone;
    };
  }, [tone, app.view, game]);

  if (!app.ready) return <div className="boot">Opening the scorebook…</div>;

  const go = (view: View) => {
    if (view === 'live') {
      const current = app.state.games.find((item) => item.id === app.gameId && item.status === 'live');
      const live = current ?? app.state.games.find((item) => item.status === 'live');
      if (!live) {
        app.open('home');
        return;
      }
      app.open('live', live.id);
      return;
    }
    if (view === 'film') app.open('film', null);
    else app.open(view);
  };

  return (
    <Shell
      tone={tone}
      view={app.view === 'setup' ? 'home' : app.view === 'game' ? 'games' : app.view}
      teamName={app.state.teamName}
      saveStatus={app.saveStatus}
      hasLive={app.state.games.some((item) => item.status === 'live')}
      onNav={go}
    >
      {app.view === 'home' ? <Home /> : null}
      {app.view === 'setup' ? <Setup /> : null}
      {app.view === 'live' ? <Live /> : null}
      {app.view === 'roster' ? <Roster /> : null}
      {app.view === 'games' ? <Games /> : null}
      {app.view === 'game' ? <GameDetail /> : null}
      {app.view === 'stats' ? <Stats /> : null}
      {app.view === 'film' ? <Film /> : null}
    </Shell>
  );
}

export function App() {
  return (
    <StoreProvider>
      <Root />
    </StoreProvider>
  );
}
