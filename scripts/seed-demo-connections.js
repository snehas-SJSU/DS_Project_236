#!/usr/bin/env node
/**
 * Upserts 3 demo members and INSERT IGNORE connections with M-123 (for feed Send modal / network tests).
 * Requires MySQL (same env as shared/mysql). Run from repo root: npm run seed:connections
 */
const path = require('path');
const db = require(path.join(__dirname, '..', 'shared', 'mysql'));

function pairKey(a, b) {
  return a < b ? [a, b] : [b, a];
}

const DEMOS = [
  {
    id: 'M-DEMO-01',
    name: 'Alex Chen',
    title: 'Senior Engineer at Acme',
    email: 'alex.demo.linkedin-sim@example.com'
  },
  {
    id: 'M-DEMO-02',
    name: 'Priya Kapoor',
    title: 'Recruiter at Nova Labs',
    email: 'priya.demo.linkedin-sim@example.com'
  },
  {
    id: 'M-DEMO-03',
    name: 'Jordan Lee',
    title: 'Staff Engineer · Platform',
    email: 'jordan.demo.linkedin-sim@example.com'
  }
];
const ME = 'M-123';

async function main() {
  for (const d of DEMOS) {
    await db.query(
      `INSERT IGNORE INTO members (member_id, name, title, headline, location, email, status) VALUES (?, ?, ?, ?, ?, ?, 'active')`,
      [d.id, d.name, d.title, d.title, 'United States', d.email]
    );
  }
  for (const d of DEMOS) {
    const [a, b] = pairKey(ME, d.id);
    await db.query('INSERT IGNORE INTO connections (user_a, user_b) VALUES (?, ?)', [a, b]);
  }
  try {
    await db.query(
      `UPDATE connection_requests
       SET status = 'accepted'
       WHERE status = 'pending'
         AND ((requester_id = ? AND receiver_id IN (?,?,?)) OR (receiver_id = ? AND requester_id IN (?,?,?)))`,
      [ME, DEMOS[0].id, DEMOS[1].id, DEMOS[2].id, ME, DEMOS[0].id, DEMOS[1].id, DEMOS[2].id]
    );
  } catch (e) {
    if (e.code !== 'ER_NO_SUCH_TABLE') throw e;
  }
  console.log('seed:connections — demo members + 3 connections for', ME);
  process.exit(0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
