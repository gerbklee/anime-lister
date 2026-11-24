// Atelier: the daily drawing reminder (push).
/* eslint-disable no-unused-vars */
const { crypto, fs, path, express, sharp, db, DATA_DIR, HttpError, wrap, parseId, isSpicy, usersById, notify, activity, C, core, stats, studyPsd, crit, lessonMedia, readClip, DRAW_DIR, REF_DIR, CLIP_DIR, LAYER_DIR, q, fileUrl, randomName, adultLevel, clipInfoOf, drawingView, ownDrawing, saveImage, saveReference, treeFor, raw } = require('../shared');

// ---- Reminders ------------------------------------------------------------------------------

// At your planned time, a gentle reminder if you haven't drawn yet today.
function reminderTick() {
  const now = Date.now();
  for (const p of q.reminderProfiles.all()) {
    const today = core.dayKey(now, p.tz);
    if (p.last_reminded === today) continue;
    const [h, m] = p.reminder_at.split(':').map(Number);
    const t = core.localTime(now, p.tz);
    if (t.hour * 60 + t.minute < h * 60 + m) continue;
    const drawn = db.prepare('SELECT COALESCE(SUM(minutes), 0) AS m FROM atelier_blocks WHERE user_id = ? AND started_at >= ?').get(p.user_id, core.startOfDay(now, p.tz)).m;
    q.setReminded.run(today, p.user_id);
    if (drawn > 0) continue;
    const plan = p.plan_when ? `${p.plan_when}${p.plan_where ? `, ${p.plan_where}` : ''}` : 'Your drawing time';
    notify([p.user_id], 'drawing', { title: '✏️ Time to draw', body: `${plan}: ${p.daily_minutes} minutes today. Your valley is waiting.`, url: '#/atelier', tag: 'atelier-reminder' });
  }
}
function startReminders() {
  setInterval(() => {
    try {
      reminderTick();
    } catch (err) {
      console.warn('Atelier reminders failed:', err.message);
    }
  }, 5 * 60 * 1000);
}


module.exports = { startReminders };
