// Test helpers: start the real server on random ports with an empty, temporary
// data folder, and talk to it like the browser does (cookies included).
const { spawn } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');

const SERVER_DIR = path.join(__dirname, '..');

async function startServer() {
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'atelier-test-'));
  const port = 20000 + Math.floor(Math.random() * 20000);
  const atelierPort = port + 1;
  const proc = spawn(process.execPath, ['src/index.js'], {
    cwd: SERVER_DIR,
    env: { ...process.env, DATA_DIR: dataDir, PORT: String(port), ATELIER_PORT: String(atelierPort), ANTHROPIC_API_KEY: '', YOUTUBE_API_KEY: '' },
    stdio: ['ignore', 'ignore', 'pipe'],
  });
  let stderr = '';
  proc.stderr.on('data', (d) => (stderr += d));
  const base = `http://127.0.0.1:${atelierPort}`;
  for (let i = 0; i < 80; i++) {
    try {
      const r = await fetch(`${base}/api/health`);
      if (r.ok) break;
    } catch {
      // not up yet
    }
    await new Promise((r) => setTimeout(r, 250));
    if (i === 79) throw new Error(`Server didn't start:\n${stderr}`);
  }
  const close = () =>
    new Promise((resolve) => {
      proc.once('exit', resolve);
      proc.kill();
    }).then(() => fs.rmSync(dataDir, { recursive: true, force: true }));
  return { base, dataDir, close };
}

// A logged-in user (registers on first use).
async function user(server, username) {
  let cookie = '';
  const call = async (method, p, body, raw) => {
    const headers = { cookie };
    let payload;
    if (raw) {
      headers['content-type'] = 'application/octet-stream';
      payload = raw;
    } else if (body !== undefined) {
      headers['content-type'] = 'application/json';
      payload = JSON.stringify(body);
    }
    const r = await fetch(server.base + p, { method, headers, body: payload });
    const sc = r.headers.get('set-cookie');
    if (sc) cookie = sc.split(';')[0];
    const type = r.headers.get('content-type') || '';
    const data = type.includes('json') ? await r.json() : Buffer.from(await r.arrayBuffer());
    return { status: r.status, data, type };
  };
  const reg = await call('POST', '/api/auth/register', { username, password: 'secret-password-1' });
  if (reg.status !== 201) throw new Error(`Couldn't register ${username}: ${reg.status} ${JSON.stringify(reg.data)}`);
  return { call };
}

// Direct database access (for setting up history, e.g. sessions on past days).
function database(server) {
  const Database = require(path.join(SERVER_DIR, 'node_modules', 'better-sqlite3'));
  return new Database(path.join(server.dataDir, 'anime-lister.db'));
}

// A small PNG.
async function png(w = 400, h = 500) {
  const sharp = require(path.join(SERVER_DIR, 'node_modules', 'sharp'));
  return sharp({ create: { width: w, height: h, channels: 3, background: '#f0f0ea' } }).png().toBuffer();
}

module.exports = { startServer, user, database, png };
