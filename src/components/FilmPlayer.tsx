import { forwardRef, useEffect, useImperativeHandle, useRef } from 'react';

export type FilmPlayerHandle = {
  seconds: () => number | null;
  time: () => number | null;
  seek: (seconds: number) => void;
};

type YtPlayer = {
  destroy: () => void;
  getCurrentTime: () => number;
  seekTo: (seconds: number, allowSeekAhead: boolean) => void;
};

type YtNamespace = {
  Player: new (
    element: HTMLElement,
    options: {
      videoId: string;
      playerVars?: Record<string, string | number>;
      events?: {
        onReady?: (event: { target: YtPlayer }) => void;
        onStateChange?: (event: { data: number }) => void;
      };
    },
  ) => YtPlayer;
};

type YtWindow = Window & {
  YT?: YtNamespace;
  onYouTubeIframeAPIReady?: () => void;
};

let apiReady: Promise<void> | null = null;

function loadYouTubeApi() {
  const host = window as YtWindow;
  if (host.YT?.Player) return Promise.resolve();
  if (!apiReady) {
    apiReady = new Promise((resolve) => {
      const previous = host.onYouTubeIframeAPIReady;
      host.onYouTubeIframeAPIReady = () => {
        previous?.();
        resolve();
      };
      const script = document.createElement('script');
      script.src = 'https://www.youtube.com/iframe_api';
      document.head.appendChild(script);
    });
  }
  return apiReady;
}

const PLAYING = 1;
const PAUSED = 2;

function readPlayerTime(player: YtPlayer | null) {
  if (!player) return null;
  try {
    const time = player.getCurrentTime();
    return typeof time === 'number' && Number.isFinite(time) ? time : null;
  } catch {
    return null;
  }
}

export const FilmPlayer = forwardRef<FilmPlayerHandle, { videoId: string; start: number; onPause?: () => void }>(
  function FilmPlayer({ videoId, start, onPause }, ref) {
  const hostRef = useRef<HTMLDivElement>(null);
  const playerRef = useRef<YtPlayer | null>(null);
  const onPauseRef = useRef(onPause);
  onPauseRef.current = onPause;

  useImperativeHandle(ref, () => ({
    seconds: () => {
      const time = readPlayerTime(playerRef.current);
      return time == null ? null : Math.round(time);
    },
    time: () => readPlayerTime(playerRef.current),
    seek: (seconds: number) => {
      const player = playerRef.current;
      if (!player || !Number.isFinite(seconds)) return;
      try {
        player.seekTo(Math.max(0, seconds), true);
      } catch {
        /* The player can reject a seek before it is ready. */
      }
    },
  }));

  useEffect(() => {
    const node = hostRef.current;
    if (!node) return;
    let cancelled = false;
    let playerState = -1;
    const startAt = Math.max(0, Math.floor(start));
    loadYouTubeApi().then(() => {
      if (cancelled || !node.isConnected) return;
      const YT = (window as YtWindow).YT;
      if (!YT) return;
      playerRef.current = new YT.Player(node, {
        videoId,
        playerVars: {
          start: startAt,
          rel: 0,
          modestbranding: 1,
          playsinline: 1,
          origin: window.location.origin,
        },
        events: {
          onReady: (event) => {
            playerRef.current = event.target;
          },
          onStateChange: (event) => {
            if (playerState === PLAYING && event.data === PAUSED) onPauseRef.current?.();
            playerState = event.data;
          },
        },
      });
    });
    return () => {
      cancelled = true;
      const player = playerRef.current;
      playerRef.current = null;
      try {
        player?.destroy();
      } catch {
        /* The player can already be gone when the page changes. */
      }
    };
  }, [videoId]);

  return (
    <div className="player-frame">
      <div ref={hostRef} />
    </div>
  );
  },
);
