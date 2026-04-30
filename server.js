// Custom Next.js server adds:
//   - WebSocket endpoint at /api/terminal-ws for shell sessions (node-pty).
//   - Filesystem watcher that broadcasts saved-workflows/ changes so the
//     canvas can reload after Claude Code saves new graph JSON.
//
// Start with `npm run dev`, which now runs `node server.js` instead of
// `next dev` so we own the HTTP listener.

const path = require('node:path');
const http = require('node:http');
const fs = require('node:fs');
const os = require('node:os');
const { parse } = require('node:url');
const { randomUUID } = require('node:crypto');

const next = require('next');
const { WebSocketServer } = require('ws');
const chokidar = require('chokidar');

let pty;
try {
  pty = require('node-pty');
} catch (error) {
  console.error('[server] node-pty failed to load:', error.message);
  console.error('[server] terminal panel will be disabled');
}

const PORT = Number(process.env.PORT || 3002);
const dev = process.env.NODE_ENV !== 'production';
const projectRoot = path.resolve(__dirname);
const savedDir = path.join(projectRoot, 'saved-workflows');

const app = next({ dev, dir: projectRoot });
const handle = app.getRequestHandler();

// terminalId -> { pty, cwd, history, subscribers }
const terminals = new Map();

function spawnTerminal({ cols = 100, rows = 30, cwd } = {}) {
  if (!pty) throw new Error('node-pty unavailable on this host');
  const id = randomUUID();
  const shell = process.env.SHELL || (os.platform() === 'win32' ? 'powershell.exe' : '/bin/zsh');
  const startDir = cwd && fs.existsSync(cwd) ? cwd : projectRoot;

  const ptyProcess = pty.spawn(shell, [], {
    name: 'xterm-256color',
    cols,
    rows,
    cwd: startDir,
    env: {
      ...process.env,
      TERM: 'xterm-256color',
      FORCE_COLOR: '1',
      COLORTERM: 'truecolor',
    },
  });

  const term = {
    id,
    pty: ptyProcess,
    cwd: startDir,
    history: '',
    subscribers: new Set(),
    createdAt: new Date().toISOString(),
  };

  ptyProcess.onData((data) => {
    term.history += data;
    if (term.history.length > 200_000) {
      term.history = term.history.slice(-200_000);
    }
    const payload = JSON.stringify({ type: 'output', terminalId: id, data });
    for (const ws of term.subscribers) {
      if (ws.readyState === ws.OPEN) ws.send(payload);
    }
  });

  ptyProcess.onExit(({ exitCode }) => {
    const payload = JSON.stringify({ type: 'exit', terminalId: id, exitCode });
    for (const ws of term.subscribers) {
      if (ws.readyState === ws.OPEN) ws.send(payload);
    }
    terminals.delete(id);
  });

  terminals.set(id, term);
  return term;
}

function killTerminal(id) {
  const term = terminals.get(id);
  if (!term) return;
  try { term.pty.kill(); } catch { /* ignore */ }
  terminals.delete(id);
}

// ─── Workflow watcher ──────────────────────────────────────────────
const watcherClients = new Set();
function broadcastWatcher(payload) {
  const msg = JSON.stringify(payload);
  for (const ws of watcherClients) {
    if (ws.readyState === ws.OPEN) ws.send(msg);
  }
}

if (!fs.existsSync(savedDir)) fs.mkdirSync(savedDir, { recursive: true });

const watcher = chokidar.watch(savedDir, {
  ignored: /(^|[\/\\])\../,
  ignoreInitial: true,
  awaitWriteFinish: { stabilityThreshold: 250, pollInterval: 50 },
});

watcher
  .on('add', (filePath) => broadcastWatcher({ type: 'workflow:add', filePath }))
  .on('change', (filePath) => broadcastWatcher({ type: 'workflow:change', filePath }))
  .on('unlink', (filePath) => broadcastWatcher({ type: 'workflow:remove', filePath }));

// ─── Boot Next + HTTP + WS ────────────────────────────────────────
app.prepare().then(() => {
  const httpServer = http.createServer((req, res) => {
    const parsedUrl = parse(req.url, true);
    handle(req, res, parsedUrl);
  });

  // Two distinct WS endpoints multiplexed via the upgrade pathname.
  const terminalWss = new WebSocketServer({ noServer: true });
  const watcherWss = new WebSocketServer({ noServer: true });

  httpServer.on('upgrade', (req, socket, head) => {
    const { pathname } = parse(req.url || '');
    if (pathname === '/api/terminal-ws') {
      terminalWss.handleUpgrade(req, socket, head, (ws) => {
        terminalWss.emit('connection', ws, req);
      });
    } else if (pathname === '/api/workflow-watch') {
      watcherWss.handleUpgrade(req, socket, head, (ws) => {
        watcherWss.emit('connection', ws, req);
      });
    } else {
      socket.destroy();
    }
  });

  terminalWss.on('connection', (ws) => {
    let activeTerminalId = null;

    ws.on('message', (raw) => {
      let msg;
      try { msg = JSON.parse(raw.toString()); } catch { return; }

      if (msg.type === 'create') {
        try {
          const term = spawnTerminal({
            cols: msg.cols,
            rows: msg.rows,
            cwd: msg.cwd,
          });
          term.subscribers.add(ws);
          activeTerminalId = term.id;
          ws.send(JSON.stringify({
            type: 'ready',
            terminalId: term.id,
            cwd: term.cwd,
          }));
        } catch (error) {
          ws.send(JSON.stringify({ type: 'error', error: error.message }));
        }
        return;
      }

      if (msg.type === 'attach' && msg.terminalId) {
        const term = terminals.get(msg.terminalId);
        if (!term) {
          ws.send(JSON.stringify({ type: 'error', error: 'terminal not found' }));
          return;
        }
        term.subscribers.add(ws);
        activeTerminalId = term.id;
        if (term.history) {
          ws.send(JSON.stringify({ type: 'output', terminalId: term.id, data: term.history }));
        }
        ws.send(JSON.stringify({ type: 'ready', terminalId: term.id, cwd: term.cwd }));
        return;
      }

      if (msg.type === 'input' && msg.terminalId) {
        const term = terminals.get(msg.terminalId);
        if (term) term.pty.write(msg.data);
        return;
      }

      if (msg.type === 'resize' && msg.terminalId) {
        const term = terminals.get(msg.terminalId);
        if (term) {
          const cols = Math.max(10, Math.min(500, msg.cols || 80));
          const rows = Math.max(2, Math.min(200, msg.rows || 24));
          try { term.pty.resize(cols, rows); } catch { /* ignore */ }
        }
        return;
      }

      if (msg.type === 'kill' && msg.terminalId) {
        killTerminal(msg.terminalId);
        if (msg.terminalId === activeTerminalId) activeTerminalId = null;
        return;
      }
    });

    ws.on('close', () => {
      for (const term of terminals.values()) {
        term.subscribers.delete(ws);
      }
    });
  });

  watcherWss.on('connection', (ws) => {
    watcherClients.add(ws);
    ws.send(JSON.stringify({ type: 'ready', dir: savedDir }));
    ws.on('close', () => watcherClients.delete(ws));
  });

  httpServer.listen(PORT, () => {
    console.log(`▶ Zoral Clone — http://localhost:${PORT}`);
    console.log(`  cwd:        ${projectRoot}`);
    console.log(`  terminal:   ${pty ? 'enabled (node-pty)' : 'disabled (node-pty failed to load)'}`);
    console.log(`  watching:   ${savedDir}`);
  });
});

// ─── Cleanup ──────────────────────────────────────────────────────
function shutdown() {
  console.log('\n[server] shutting down');
  for (const term of terminals.values()) {
    try { term.pty.kill(); } catch { /* ignore */ }
  }
  watcher.close().catch(() => {});
  process.exit(0);
}
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
