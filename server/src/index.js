const fs = require('fs');
const path = require('path');
const express = require('express');
const { IMAGE_DIR } = require('./db');
const { HttpError, wrap } = require('./http');
const { authRouter, loadUser, requireUser } = require('./auth');
const { listsRouter } = require('./lists');
const { compareRouter } = require('./compare');
const { catalogueRouter } = require('./catalogue');
const { socialRouter } = require('./social');
const { picturesRouter } = require('./pictures');
const { discoverRouter } = require('./discover');
const { searchCharacters } = require('./anilist');
const { retryMissingImages } = require('./images');
const { backfillCharacterLinks } = require('./anime');
const { allUsers } = require('./users');

const PORT = Number(process.env.PORT) || 3000;
const PUBLIC_DIR = path.join(__dirname, '..', 'public');

const app = express();
app.disable('x-powered-by');
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
app.use('/api', compareRouter);
app.use('/api', catalogueRouter);
app.use('/api', socialRouter);
app.use('/api', picturesRouter);
app.use('/api', discoverRouter);

app.use('/api', (req, res) => res.status(404).json({ error: 'Not found' }));

// ---- Static files -------------------------------------------------------------

app.use('/images', express.static(IMAGE_DIR, { maxAge: '30d', fallthrough: false }));

if (fs.existsSync(PUBLIC_DIR)) {
  app.use(express.static(PUBLIC_DIR));
  app.get('*', (req, res) => res.sendFile(path.join(PUBLIC_DIR, 'index.html')));
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
  console.log(`Anime Lister running on http://0.0.0.0:${PORT}`);
  retryMissingImages()
    .catch((err) => console.warn('Image retry failed:', err.message))
    .then(() => backfillCharacterLinks())
    .catch((err) => console.warn('Character linking failed:', err.message));
});
