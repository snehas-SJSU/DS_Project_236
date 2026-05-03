/**
 * Removes jobs created by scripts/smoke-test.sh so the Jobs board shows real listings again.
 *
 * Matches known smoke titles / descriptions (not heuristic "Smoke%" in arbitrary titles).
 *
 *   npm run cleanup:smoke
 *
 * Requires MySQL (same env as scripts/lib/mysql.js).
 */
'use strict';

const pool = require('./lib/mysql.js');

async function main() {
  const conn = await pool.getConnection();
  try {
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
  } finally {
    conn.release();
    await pool.end();
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
