import { createContext, useContext, useEffect, useRef, useState, type ReactNode } from 'react';
import { uid } from './hockey.ts';
import {
  addGreatPlay,
  alignFilm,
  addOppGoal,
  addOppPenalty,
  addOppPenaltyShot,
  addOppShot,
  addOurGoal,
  addOurPenalty,
  addOurPenaltyShot,
  addOurShot,
  clearPenalty,
  createGame,
  editEvent,
  finalizeGame,
  freeze,
  nextPeriod,
  pauseClock,
  removeEvent,
  setClock,
  setDressed,
  setPenaltyLengths,
  updatePenalty,
  setEventVideo,
  setVideoSeconds,
  setYoutube,
  startClock,
  switchGoalie,
  undo,
} from './reducer.ts';
import { downloadState, loadState, normalize, persistState } from './storage.ts';
import type {
  AppState,
  BoxPenaltyInput,
  Game,
  EventEdit,
  GoalInput,
  NewGame,
  OppGoalInput,
  PenaltyEdit,
  PenaltyLengths,
  PenaltyShotInput,
  Player,
  View,
} from './types.ts';

type SaveStatus = 'saving' | 'saved' | 'local';

type Store = {
  state: AppState;
  ready: boolean;
  saveStatus: SaveStatus;
  view: View;
  gameId: string | null;
  open: (view: View, gameId?: string | null) => void;
  download: () => void;
  replaceBook: (state: AppState) => void;
  setTeamName: (name: string) => void;
  savePlayer: (player: Omit<Player, 'id'> & { id?: string }) => void;
  deletePlayer: (id: string) => void;
  setLead: (seconds: number) => void;
  create: (input: NewGame) => void;
  discard: (id: string) => void;
  pause: (id: string) => void;
  start: (id: string) => void;
  expire: (id: string) => void;
  ourShot: (id: string, playerId: string, video: number | null) => void;
  oppShot: (id: string, video: number | null) => void;
  ourGoal: (id: string, input: GoalInput, video: number | null) => void;
  oppGoal: (id: string, input: OppGoalInput, video: number | null) => void;
  ourPenalty: (id: string, input: BoxPenaltyInput, video: number | null) => void;
  oppPenalty: (id: string, input: BoxPenaltyInput, video: number | null) => void;
  ourPenaltyShot: (id: string, input: PenaltyShotInput, video: number | null) => void;
  oppPenaltyShot: (id: string, input: PenaltyShotInput, video: number | null) => void;
  greatPlay: (id: string, note: string, video: number | null) => void;
  editPenalty: (id: string, penaltyId: string, edit: PenaltyEdit) => void;
  clearPenalty: (id: string, penaltyId: string) => void;
  setPenaltyLengths: (id: string, lengths: PenaltyLengths) => void;
  changeGoalie: (id: string, goalieId: string | null) => void;
  setRemaining: (id: string, remainingMs: number) => void;
  advancePeriod: (id: string) => void;
  stampVideo: (id: string, video: number | null) => void;
  editEventVideo: (id: string, eventId: string, video: number | null) => void;
  editEvent: (id: string, eventId: string, edit: EventEdit) => void;
  removeEvent: (id: string, eventId: string) => void;
  editYoutube: (id: string, url: string) => void;
  alignFilm: (id: string, anchorEventId: string, videoSeconds: number, laterOnly?: boolean) => void;
  editDressed: (id: string, dressedIds: string[]) => void;
  finish: (id: string) => void;
  undoLast: (id: string) => void;
};

const Ctx = createContext<Store | null>(null);

function withVideo(game: Game, video: number | null, t: number) {
  return setVideoSeconds(pauseClock(game, t), video, t);
}

export function StoreProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<AppState | null>(null);
  const [ready, setReady] = useState(false);
  const [saveStatus, setSaveStatus] = useState<SaveStatus>('saved');
  const [view, setView] = useState<View>('home');
  const [gameId, setGameId] = useState<string | null>(null);
  const stateRef = useRef<AppState | null>(null);
  stateRef.current = state;

  useEffect(() => {
    let cancelled = false;
    loadState().then((loaded) => {
      if (cancelled) return;
      setState(loaded);
      setReady(true);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!ready || !state) return;
    setSaveStatus('saving');
    const handle = window.setTimeout(() => {
      persistState(state).then((status) => setSaveStatus(status));
    }, 250);
    return () => window.clearTimeout(handle);
  }, [state, ready]);

  useEffect(() => {
    const commit = () => {
      const t = Date.now();
      setState((current) => {
        if (!current || !current.games.some((game) => game.clock.running)) return current;
        return { ...current, games: current.games.map((game) => (game.clock.running ? freeze(game, t, true) : game)) };
      });
    };
    const interval = window.setInterval(commit, 5000);
    const onHide = () => {
      if (document.visibilityState === 'hidden') commit();
    };
    document.addEventListener('visibilitychange', onHide);
    return () => {
      window.clearInterval(interval);
      document.removeEventListener('visibilitychange', onHide);
    };
  }, []);

  const update = (id: string, fn: (game: Game, roster: Player[], t: number) => Game) => {
    const t = Date.now();
    setState((current) => {
      if (!current) return current;
      return {
        ...current,
        games: current.games.map((game) => (game.id === id ? fn(game, current.roster, t) : game)),
      };
    });
  };

  const api: Store = {
    state: state ?? { version: 1, teamName: '', roster: [], filmLeadSeconds: 10, games: [] },
    ready,
    saveStatus,
    view,
    gameId,
    open: (next, id) => {
      setView(next);
      if (id !== undefined) setGameId(id);
    },
    download: () => {
      if (stateRef.current) downloadState(stateRef.current);
    },
    replaceBook: (next) => {
      const normalized = normalize(next);
      if (!normalized) return;
      setState(normalized);
      setGameId(null);
      setView('home');
    },
    setTeamName: (name) => setState((current) => (current ? { ...current, teamName: name } : current)),
    savePlayer: (player) =>
      setState((current) => {
        if (!current) return current;
        if (player.id) {
          return {
            ...current,
            roster: current.roster.map((item) => (item.id === player.id ? { ...item, ...player, id: item.id } : item)),
          };
        }
        return { ...current, roster: [...current.roster, { ...player, id: uid('p') }] };
      }),
    deletePlayer: (id) =>
      setState((current) => (current ? { ...current, roster: current.roster.filter((player) => player.id !== id) } : current)),
    setLead: (seconds) =>
      setState((current) =>
        current ? { ...current, filmLeadSeconds: Math.max(0, Math.min(120, Math.round(seconds))) } : current,
      ),
    create: (input) => {
      const current = stateRef.current;
      if (!current) return;
      const game = createGame(current.roster, input, Date.now());
      setState((latest) => (latest ? { ...latest, games: [game, ...latest.games] } : latest));
      setGameId(game.id);
      setView('live');
    },
    discard: (id) => {
      setState((current) => (current ? { ...current, games: current.games.filter((game) => game.id !== id) } : current));
      setGameId((current) => (current === id ? null : current));
      setView('home');
    },
    pause: (id) => update(id, (game, _roster, t) => pauseClock(game, t)),
    start: (id) => update(id, (game, _roster, t) => startClock(game, t)),
    expire: (id) => update(id, (game, _roster, t) => (game.clock.running ? pauseClock(game, t) : game)),
    ourShot: (id, playerId, video) =>
      update(id, (game, roster, t) => addOurShot(setVideoSeconds(game, video, t), roster, playerId, t)),
    oppShot: (id, video) => update(id, (game, roster, t) => addOppShot(setVideoSeconds(game, video, t), roster, t)),
    ourGoal: (id, input, video) =>
      update(id, (game, roster, t) => addOurGoal(withVideo(game, video, t), roster, input, t)),
    oppGoal: (id, input, video) =>
      update(id, (game, roster, t) => addOppGoal(withVideo(game, video, t), roster, input, t)),
    ourPenalty: (id, input, video) =>
      update(id, (game, roster, t) => addOurPenalty(withVideo(game, video, t), roster, input, t)),
    oppPenalty: (id, input, video) =>
      update(id, (game, roster, t) => addOppPenalty(withVideo(game, video, t), roster, input, t)),
    ourPenaltyShot: (id, input, video) =>
      update(id, (game, roster, t) => addOurPenaltyShot(withVideo(game, video, t), roster, input, t)),
    oppPenaltyShot: (id, input, video) =>
      update(id, (game, roster, t) => addOppPenaltyShot(withVideo(game, video, t), roster, input, t)),
    greatPlay: (id, note, video) =>
      update(id, (game, _roster, t) => addGreatPlay(setVideoSeconds(game, video, t), note, t)),
    editPenalty: (id, penaltyId, edit) =>
      update(id, (game, roster, t) => updatePenalty(game, roster, penaltyId, edit, t)),
    clearPenalty: (id, penaltyId) => update(id, (game, roster, t) => clearPenalty(game, roster, penaltyId, t)),
    setPenaltyLengths: (id, lengths) => update(id, (game, _roster, t) => setPenaltyLengths(game, lengths, t)),
    changeGoalie: (id, goalieId) => update(id, (game, roster, t) => switchGoalie(game, roster, goalieId, t)),
    setRemaining: (id, remainingMs) => update(id, (game, _roster, t) => setClock(game, remainingMs, t)),
    advancePeriod: (id) => update(id, (game, _roster, t) => nextPeriod(game, t)),
    stampVideo: (id, video) => update(id, (game, _roster, t) => setVideoSeconds(game, video, t)),
    editEventVideo: (id, eventId, video) => update(id, (game, _roster, t) => setEventVideo(game, eventId, video, t)),
    editEvent: (id, eventId, edit) => update(id, (game, roster, t) => editEvent(game, roster, eventId, edit, t)),
    removeEvent: (id, eventId) => update(id, (game, _roster, t) => removeEvent(game, eventId, t)),
    editYoutube: (id, url) => update(id, (game, _roster, t) => setYoutube(game, url, t)),
    alignFilm: (id, anchorEventId, videoSeconds, laterOnly) =>
      update(id, (game, _roster, t) => alignFilm(game, anchorEventId, videoSeconds, t, laterOnly)),
    editDressed: (id, dressedIds) => update(id, (game, roster, t) => setDressed(game, roster, dressedIds, t)),
    finish: (id) => update(id, (game, _roster, t) => finalizeGame(game, t)),
    undoLast: (id) => update(id, (game, _roster, t) => undo(game, t)),
  };

  return <Ctx.Provider value={api}>{children}</Ctx.Provider>;
}

export function useApp() {
  const store = useContext(Ctx);
  if (!store) throw new Error('useApp must be used inside StoreProvider');
  return store;
}
