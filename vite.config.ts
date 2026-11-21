import fs from 'node:fs';
import path from 'node:path';
import { defineConfig, type Plugin } from 'vite';
import react from '@vitejs/plugin-react';

const HISTORY_LIMIT = 40;
const HISTORY_NAME = /^scorekeeper-\d{4}-\d{2}-\d{2}T\d{2}-\d{2}-\d{2}-\d{3}Z\.json$/;

function bookSignature(text: string) {
  const state = JSON.parse(text) as {
    teamName?: string;
    roster?: unknown;
    filmLeadSeconds?: number;
    games?: Array<Record<string, unknown>>;
  };
  return JSON.stringify({
    teamName: state.teamName,
    roster: state.roster,
    filmLeadSeconds: state.filmLeadSeconds,
    games: (state.games ?? []).map((game) => ({
      id: game.id,
      status: game.status,
      opponent: game.opponent,
      date: game.date,
      scoreUs: game.scoreUs,
      scoreOpp: game.scoreOpp,
      sogUs: game.sogUs,
      sogOpp: game.sogOpp,
      events: game.events,
      youtubeUrl: game.youtubeUrl,
      dressedIds: game.dressedIds,
      penalties: Array.isArray(game.penalties)
        ? game.penalties.map((penalty) => {
            const item = penalty as Record<string, unknown>;
            return { ...item, remainingMs: 0 };
          })
        : game.penalties,
      goalieId: game.goalieId,
      starterGoalieId: game.starterGoalieId,
    })),
  });
}

function scorebookApi(): Plugin {
  const file = path.resolve(process.cwd(), 'data/scorekeeper.json');
  const historyDir = path.resolve(process.cwd(), 'data/history');

  function readHistory() {
    if (!fs.existsSync(historyDir)) return [];
    return fs
      .readdirSync(historyDir)
      .filter((name) => HISTORY_NAME.test(name))
      .map((name) => {
        const full = path.join(historyDir, name);
        return { name, savedAt: fs.statSync(full).mtime.toISOString() };
      })
      .sort((a, b) => b.savedAt.localeCompare(a.savedAt));
  }

  function archivePrevious(previous: string) {
    fs.mkdirSync(historyDir, { recursive: true });
    const stamp = new Date().toISOString().replace(/[:.]/g, '-');
    fs.writeFileSync(path.join(historyDir, `scorekeeper-${stamp}.json`), previous);
    const stale = readHistory().slice(HISTORY_LIMIT);
    for (const copy of stale) fs.unlinkSync(path.join(historyDir, copy.name));
  }

  return {
    name: 'scorebook-api',
    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        const url = req.url?.split('?')[0];
        if (url === '/api/history' && req.method === 'GET') {
          res.setHeader('Content-Type', 'application/json');
          res.end(JSON.stringify(readHistory()));
          return;
        }
        if (url === '/api/history/restore' && req.method === 'POST') {
          const chunks: Buffer[] = [];
          req.on('data', (chunk) => chunks.push(Buffer.from(chunk)));
          req.on('end', () => {
            let name = '';
            try {
              name = String(JSON.parse(Buffer.concat(chunks).toString('utf8')).name ?? '');
            } catch {
              name = '';
            }
            const full = path.resolve(historyDir, name);
            if (!HISTORY_NAME.test(name) || path.dirname(full) !== historyDir || !fs.existsSync(full)) {
              res.statusCode = 404;
              res.end('{"ok":false}');
              return;
            }
            const restored = fs.readFileSync(full, 'utf8');
            if (fs.existsSync(file)) {
              const current = fs.readFileSync(file, 'utf8');
              if (bookSignature(current) !== bookSignature(restored)) archivePrevious(current);
            }
            fs.writeFileSync(file, restored);
            res.setHeader('Content-Type', 'application/json');
            res.end(restored);
          });
          return;
        }
        if (url !== '/api/state') {
          next();
          return;
        }
        if (req.method === 'GET') {
          fs.readFile(file, 'utf8', (err, text) => {
            if (err) {
              res.statusCode = 404;
              res.setHeader('Content-Type', 'application/json');
              res.end('null');
              return;
            }
            res.setHeader('Content-Type', 'application/json');
            res.end(text);
          });
          return;
        }
        if (req.method === 'PUT') {
          const chunks: Buffer[] = [];
          req.on('data', (chunk) => chunks.push(Buffer.from(chunk)));
          req.on('end', () => {
            const next = Buffer.concat(chunks).toString('utf8');
            fs.mkdirSync(path.dirname(file), { recursive: true });
            if (fs.existsSync(file)) {
              const previous = fs.readFileSync(file, 'utf8');
              try {
                if (bookSignature(previous) !== bookSignature(next)) archivePrevious(previous);
              } catch {
                archivePrevious(previous);
              }
            }
            fs.writeFileSync(file, next);
            res.setHeader('Content-Type', 'application/json');
            res.end('{"ok":true}');
          });
          return;
        }
        next();
      });
    },
    generateBundle() {
      if (!fs.existsSync(file)) return;
      this.emitFile({
        type: 'asset',
        fileName: 'scorebook.json',
        source: fs.readFileSync(file, 'utf8'),
      });
    },
  };
}

export default defineConfig({
  base: process.env.BASE_PATH || '/',
  plugins: [react(), scorebookApi()],
  server: { port: 5173, strictPort: true },
});
