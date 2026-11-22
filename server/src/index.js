const fs = require('fs');
const path = require('path');
const express = require('express');
const { IMAGE_DIR } = require('./db');
const { HttpError, wrap } = require('./http');
const { authRouter, loadUser, requireUser } = require('./auth');
const { listsRouter, setCharacterAddedHook } = require('./lists');
const { compareRouter } = require('./compare');
const { catalogueRouter } = require('./catalogue');
const { socialRouter } = require('./social');
const { picturesRouter } = require('./pictures');
const { discoverRouter } = require('./discover');
const { charactersRouter } = require('./characters');
const { traitsRouter, enqueueTraits, startTraitBackfill } = require('./traits');
const { themesRouter } = require('./themes');
const { homeRouter, startAiringJob } = require('./home');
const { statsRouter } = require('./stats');
const { gamesRouter } = require('./games');
const { shipsRouter } = require('./ships');
const { pushRouter } = require('./notify');
const { searchCharacters } = require('./anilist');
const { retryMissingImages } = require('./images');
const { backfillCharacterLinks } = require('./anime');
const { allUsers } = require('./users');

const PORT = Number(process.env.PORT) || 3000;
const PUBLIC_DIR = path.join(__dirname, '..', 'public');

// New characters in categorised lists get their traits worked out in the background.
setCharacterAddedHook((id) => enqueueTraits([id]));

const app = express();
app.disable('x-powered-by');
// Behind Tailscale's HTTPS proxy (another container on the Docker network),
// use the real visitor address for the login throttle.
app.set('trust proxy', 'loopback, linklocal, uniquelocal');
app.use(express.json({ limit: '100kb' }));

// ---- Public API -------------------------------------------------------------

app.get('/api/health', (req, res) => res.json({ ok: true }));

app.use('/api', loadUser);
app.use('/api/auth', authRouter);

// ---- Logged-in API ----------------------------------------------------------

app.use('/api', requireUser);

app.get('/api/users', (req, res) => res.json(allUsers()));

app.get('/api/search', wrap(async (req, res) => {
  const term = String(req.query.q ?? '').trim();
  if (term.length < 2) return res.json({ results: [] });
  if (term.length > 100) throw new HttpError(400, 'Search term is too long');
  res.json({ results: await searchCharacters(term) });
}));

app.use('/api', listsRouter);
app.use('/api', shipsRouter);
app.use('/api', compareRouter);
app.use('/api', themesRouter);
app.use('/api', catalogueRouter);
app.use('/api', socialRouter);
app.use('/api', picturesRouter);
app.use('/api', discoverRouter);
app.use('/api', charactersRouter);
app.use('/api', traitsRouter);
app.use('/api', homeRouter);
app.use('/api', statsRouter);
app.use('/api', gamesRouter);
app.use('/api', pushRouter);

app.use('/api', (req, res) => res.status(404).json({ error: 'Not found' }));

// ---- Static files -------------------------------------------------------------

app.use('/images', express.static(IMAGE_DIR, { maxAge: '30d', fallthrough: false }));

if (fs.existsSync(PUBLIC_DIR)) {
  // The app shell and service worker must not be cached, so updates arrive.
  const noCache = (res) => res.setHeader('Cache-Control', 'no-cache');
  app.use(
    express.static(PUBLIC_DIR, {
      setHeaders: (res, file) => {
        if (/(index\.html|sw\.js|manifest\.webmanifest)$/.test(file)) noCache(res);
        else if (file.includes(`${path.sep}assets${path.sep}`)) res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
      },
    }),
  );
  app.get('*', (req, res) => {
    noCache(res);
    res.sendFile(path.join(PUBLIC_DIR, 'index.html'));
  });
}

// ---- Errors -------------------------------------------------------------------

// eslint-disable-next-line no-unused-vars
app.use((err, req, res, next) => {
  const status = err.status || err.statusCode || 500;
  // Unexpected errors get a stack trace; expected ones (e.g. an external
  // service being down) just a one-line warning.
  if (status >= 500 && !err.status) console.error(err);
  else if (status >= 500) console.warn(`${req.method} ${req.path}: ${err.message}`);
  const message = status >= 500 && !err.status ? 'Internal server error' : err.message;
  if (req.path.startsWith('/images/')) return res.status(status).end();
  res.status(status).json({ error: message });
});

app.listen(PORT, '0.0.0.0', () => {
  console.log(`Anime Hub running on http://0.0.0.0:${PORT}`);
  startAiringJob();
  retryMissingImages()
    .catch((err) => console.warn('Image retry failed:', err.message))
    .then(() => backfillCharacterLinks())
    .then(() => startTraitBackfill())
    .catch((err) => console.warn('Character linking failed:', err.message));
});
