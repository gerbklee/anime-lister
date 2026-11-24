// Atelier's API (under /api/atelier): plan, path, lessons, today's session,
// reviews, focus blocks (the timer), your valley, stats, projects, the
// portfolio review, the sketchbook (uploads incl. Clip Studio files,
// self-ratings, sharing), study files and critiques.
// Each topic lives in routes/; shared helpers in shared.js.
const express = require('express');

const router = express.Router();
require('./routes/learn')(router);
require('./routes/time')(router);
require('./routes/projects')(router);
require('./routes/drawings')(router);
const { startReminders } = require('./routes/reminders');

module.exports = { atelierRouter: router, startReminders };
