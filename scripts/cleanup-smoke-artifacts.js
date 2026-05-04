/**
 * Removes artifacts created by scripts/smoke-test.sh:
 * - Known smoke-test jobs (and related applications / saved rows / tracker tables)
 * - Feed posts created as author "Smoke" with body `smoke post <timestamp>` (plus likes, comments, reposts, sends)
 *
 *   npm run cleanup:smoke
 *
 * Requires MySQL (same env as scripts/lib/mysql.js).
 */
'use strict';

const pool = require('./lib/mysql.js');

async function removeSmokeJobs(conn) {
  const [rows] = await conn.query(
    `SELECT job_id FROM jobs WHERE
      title IN ('Smoke Duplicate Apply Job', 'Smoke Closed Job')
      OR description = 'Smoke duplicate apply check'
      OR description = 'Smoke closed job check'`
  );
  const ids = rows.map((r) => r.job_id).filter(Boolean);
  if (!ids.length) {
    console.log('No smoke-test jobs found.');
    return;
  }
  const ph = ids.map(() => '?').join(',');
  await conn.query(`DELETE FROM applications WHERE job_id IN (${ph})`, ids);
  await conn.query(`DELETE FROM saved_jobs WHERE job_id IN (${ph})`, ids);
  for (const tbl of ['job_tracker_notes', 'job_tracker_archives']) {
    try {
      await conn.query(`DELETE FROM ${tbl} WHERE job_id IN (${ph})`, ids);
    } catch (_) {
      /* table may not exist on older DBs */
    }
  }
  const [del] = await conn.query(`DELETE FROM jobs WHERE job_id IN (${ph})`, ids);
  console.log(`Removed ${ids.length} smoke job(s) and related applications/notes (${del.affectedRows ?? 0} job rows).`);
}

async function removeSmokePosts(conn) {
  const [rows] = await conn.query(
    `SELECT post_id FROM posts WHERE author_name = 'Smoke' AND body LIKE 'smoke post %'`
  );
  const pids = rows.map((r) => r.post_id).filter(Boolean);
  if (!pids.length) {
    console.log('No smoke-test posts found.');
    return;
  }
  const ph = pids.map(() => '?').join(',');
  for (const tbl of ['post_likes', 'post_comments', 'post_reposts', 'post_sends']) {
    try {
      await conn.query(`DELETE FROM ${tbl} WHERE post_id IN (${ph})`, pids);
    } catch (e) {
      console.warn(`Warning: could not delete from ${tbl}:`, e.message);
    }
  }
  const [del] = await conn.query(`DELETE FROM posts WHERE post_id IN (${ph})`, pids);
  console.log(`Removed ${pids.length} smoke post(s) and engagement rows (${del.affectedRows ?? 0} post rows).`);
}

async function main() {
  const conn = await pool.getConnection();
  try {
    await removeSmokeJobs(conn);
    await removeSmokePosts(conn);
  } finally {
    conn.release();
    await pool.end();
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
