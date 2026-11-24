// Shared pieces of Atelier's API: folders, prepared statements and helpers
// used by the route modules in routes/.
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const express = require('express');
const sharp = require('sharp');
const { db, DATA_DIR } = require('../db');
const { HttpError, wrap, parseId } = require('../http');
const { isSpicy } = require('../adult');
const { usersById } = require('../users');
const { notify } = require('../notify');
const activity = require('../activity');
const C = require('./curriculum');
const core = require('./core');
const stats = require('./stats');
const { studyPsd } = require('./psd');
const crit = require('./critique');
const { lessonMedia } = require('./media');
const { readClip } = require('./clip');

const DRAW_DIR = path.join(DATA_DIR, 'atelier', 'drawings');
const REF_DIR = path.join(DATA_DIR, 'atelier', 'refs');
fs.mkdirSync(DRAW_DIR, { recursive: true });
fs.mkdirSync(REF_DIR, { recursive: true });
const CLIP_DIR = path.join(DATA_DIR, 'atelier', 'clips');
const LAYER_DIR = path.join(DATA_DIR, 'atelier', 'layers');
fs.mkdirSync(CLIP_DIR, { recursive: true });
fs.mkdirSync(LAYER_DIR, { recursive: true });

const q = {
  insertBlock: db.prepare('INSERT INTO atelier_blocks (user_id, started_at, planned, kind, lesson_id, area, tree, stage, status, project_id) VALUES (@u, @at, @planned, @kind, @lesson, @area, @tree, @stage, @status, @project)'),
  ownProject: db.prepare('SELECT * FROM atelier_projects WHERE id = ? AND user_id = ?'),
  setProject: db.prepare('UPDATE atelier_drawings SET project_id = ? WHERE id = ?'),
  block: db.prepare('SELECT * FROM atelier_blocks WHERE id = ? AND user_id = ?'),
  finishBlock: db.prepare('UPDATE atelier_blocks SET status = ?, ended_at = ?, minutes = ? WHERE id = ?'),
  logBlock: db.prepare("INSERT INTO atelier_blocks (user_id, started_at, ended_at, planned, minutes, status, kind, area, tree, stage, poses) VALUES (@u, @start, @end, @planned, @minutes, 'done', @kind, @area, @tree, @stage, @poses)"),
  staleBlocks: db.prepare("UPDATE atelier_blocks SET status = 'done', ended_at = started_at + planned * 60000, minutes = planned WHERE user_id = ? AND status = 'running' AND started_at + planned * 60000 + 3600000 < ?"),
  insertDrawing: db.prepare(`INSERT INTO atelier_drawings (user_id, lesson_id, exercise_id, kind, skill, area, title, file, reference_file, reference_url, reference_post, check_round, adult, status, created_at)
    VALUES (@u, @lesson, @exercise, @kind, @skill, @area, @title, @file, @refFile, @refUrl, @refPost, @round, @adult, @status, @at)`),
  drawing: db.prepare('SELECT * FROM atelier_drawings WHERE id = ?'),
  myDrawings: db.prepare('SELECT * FROM atelier_drawings WHERE user_id = ? ORDER BY created_at DESC LIMIT 500'),
  sharedDrawings: db.prepare("SELECT * FROM atelier_drawings WHERE shared = 1 AND user_id != ? AND file IS NOT NULL ORDER BY created_at DESC LIMIT 200"),
  setFile: db.prepare("UPDATE atelier_drawings SET file = ?, status = 'done', created_at = ? WHERE id = ?"),
  setSelf: db.prepare('UPDATE atelier_drawings SET self_scores = ? WHERE id = ?'),
  setShared: db.prepare('UPDATE atelier_drawings SET shared = ? WHERE id = ?'),
  setTitle: db.prepare('UPDATE atelier_drawings SET title = ? WHERE id = ?'),
  setClip: db.prepare('UPDATE atelier_drawings SET clip_file = ?, clip_info = ? WHERE id = ?'),
  setCritique: db.prepare('UPDATE atelier_drawings SET critique = ?, critique_cost = COALESCE(critique_cost, 0) + ? WHERE id = ?'),
  deleteDrawing: db.prepare('DELETE FROM atelier_drawings WHERE id = ?'),
  checkRounds: db.prepare("SELECT * FROM atelier_drawings WHERE user_id = ? AND kind = 'check' AND file IS NOT NULL ORDER BY check_round, exercise_id"),
  myCharacterTags: db.prepare(`
    SELECT DISTINCT t.tag, e.name FROM entries e JOIN lists l ON l.id = e.list_id
    JOIN fanart_tags t ON t.character_id = e.anilist_id AND t.source = 'danbooru'
    WHERE l.kind = 'character' AND t.tag IS NOT NULL AND (l.owner_id = @me OR EXISTS (SELECT 1 FROM list_members m WHERE m.list_id = l.id AND m.user_id = @me))
    LIMIT 60`),
  reminderProfiles: db.prepare('SELECT user_id, reminder_at, tz, last_reminded, plan_when, plan_where, daily_minutes FROM atelier_profile WHERE reminder_at IS NOT NULL'),
  setReminded: db.prepare('UPDATE atelier_profile SET last_reminded = ? WHERE user_id = ?'),
};

// ---- Helpers ---------------------------------------------------------------------------------

const fileUrl = (name) => (name ? `/api/atelier/file/${name}` : null);
const randomName = (prefix) => `${prefix}-${crypto.randomBytes(10).toString('hex')}.jpg`;

// Adult-track level of a lesson: 2 for nude units (A1, A7), 1 for the rest of the track.
const adultLevel = (lesson) => (!lesson?.unit ? 0 : ['A1', 'A7'].includes(lesson.unit) ? 2 : 1);

function clipInfoOf(d) {
  try {
    return d.clip_info ? JSON.parse(d.clip_info) : null;
  } catch {
    return null;
  }
}

function drawingView(d, me, users) {
  let critique = null;
  try {
    critique = d.critique ? JSON.parse(d.critique) : null;
  } catch {
    // ignore
  }
  let selfScores = null;
  try {
    selfScores = d.self_scores ? JSON.parse(d.self_scores) : null;
  } catch {
    // ignore
  }
  const lesson = d.lesson_id ? C.LESSON.get(d.lesson_id) : null;
  return {
    id: d.id,
    mine: d.user_id === me,
    user: users?.get(d.user_id) ?? null,
    lessonId: d.lesson_id,
    lessonTitle: lesson?.title ?? null,
    exerciseId: d.exercise_id,
    exerciseTitle: lesson?.exercises.find((e) => e.id === d.exercise_id)?.title ?? null,
    kind: d.kind,
    area: d.area,
    title: d.title,
    file: fileUrl(d.file),
    reference: fileUrl(d.reference_file),
    referencePost: d.reference_post,
    checkRound: d.check_round,
    selfScores,
    critique,
    shared: !!d.shared,
    adult: d.adult,
    status: d.status,
    createdAt: d.created_at,
    projectId: d.project_id ?? null,
    reactions: d.shared ? activity.reactionSummary(`drawing:${d.id}`, me) : null,
    clip: (() => {
      const c = clipInfoOf(d);
      if (!c) return null;
      return { width: c.width, height: c.height, workMinutes: c.workMinutes, hasFile: !!d.clip_file && d.user_id === me, layers: c.layers.map(({ image, ...l }) => ({ ...l, image: fileUrl(image) })) };
    })(),
  };
}

function ownDrawing(id, userId) {
  const d = q.drawing.get(id);
  if (!d || d.user_id !== userId) throw new HttpError(404, 'Drawing not found');
  return d;
}

// Saves an uploaded picture (any common format) as a JPEG, max 4000 px.
async function saveImage(buffer, dir, prefix, max = 4000) {
  if (!buffer?.length) throw new HttpError(400, 'No picture uploaded');
  const name = randomName(prefix);
  try {
    await sharp(buffer, { failOn: 'none' }).rotate().resize({ width: max, height: max, fit: 'inside', withoutEnlargement: true }).flatten({ background: '#ffffff' }).jpeg({ quality: 90 }).toFile(path.join(dir, name));
  } catch {
    throw new HttpError(400, 'That file isn’t a picture Atelier can read (use PNG or JPEG).');
  }
  return name;
}

// A reference from the Art search (a site URL or a stored /images/ copy).
async function saveReference(url) {
  if (!url) return null;
  const { pictureBytes } = require('../studio');
  const buf = await pictureBytes(String(url));
  return saveImage(buf, REF_DIR, 'ref', 2400);
}

function treeFor(userId) {
  const stage = core.currentStage(userId);
  return { tree: C.STAGES[stage]?.tree ?? 'sapling', stage };
}


// Pictures up to 40 MB; Clip Studio files can be larger.
const raw = express.raw({ type: ['image/*', 'application/octet-stream'], limit: '150mb' });

module.exports = { crypto, fs, path, express, sharp, db, DATA_DIR, HttpError, wrap, parseId, isSpicy, usersById, notify, activity, C, core, stats, studyPsd, crit, lessonMedia, readClip, DRAW_DIR, REF_DIR, CLIP_DIR, LAYER_DIR, q, fileUrl, randomName, adultLevel, clipInfoOf, drawingView, ownDrawing, saveImage, saveReference, treeFor, raw };
