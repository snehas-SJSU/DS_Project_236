const express = require('express');
const crypto = require('crypto');
const db = require('../../shared/mysql');

const app = express();
app.use(express.json({ limit: '15mb' }));

async function ensureTables() {
  await db.query(`
    CREATE TABLE IF NOT EXISTS posts (
      post_id VARCHAR(50) PRIMARY KEY,
      member_id VARCHAR(50) NOT NULL,
      author_name VARCHAR(255),
      author_headline VARCHAR(255) NULL,
      body TEXT NOT NULL,
      image_data LONGTEXT NULL,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      INDEX idx_posts_member (member_id),
      INDEX idx_posts_created (created_at)
    )
  `);
  const ensurePostCol = async (columnName, ddl) => {
    const [rows] = await db.query('SHOW COLUMNS FROM posts LIKE ?', [columnName]);
    if (!rows.length) {
      try {
        await db.query(`ALTER TABLE posts ADD COLUMN ${ddl}`);
      } catch (e) {
        // Concurrent startup can double-ALTER; column may already exist.
        if (e.code !== 'ER_DUP_FIELDNAME' && e.errno !== 1060) throw e;
      }
    }
  };
  await ensurePostCol('author_headline', 'author_headline VARCHAR(255) NULL');
  await ensurePostCol('quoted_post_id', 'quoted_post_id VARCHAR(50) NULL');
  await db.query(`
    CREATE TABLE IF NOT EXISTS post_likes (
      post_id VARCHAR(50) NOT NULL,
      member_id VARCHAR(50) NOT NULL,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      PRIMARY KEY (post_id, member_id),
      INDEX idx_likes_member (member_id)
    )
  `);
  await db.query(`
    CREATE TABLE IF NOT EXISTS post_comments (
      comment_id VARCHAR(50) PRIMARY KEY,
      post_id VARCHAR(50) NOT NULL,
      member_id VARCHAR(50) NOT NULL,
      author_name VARCHAR(255),
      body TEXT NOT NULL,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      INDEX idx_comments_post (post_id)
    )
  `);
  await db.query(`
    CREATE TABLE IF NOT EXISTS post_reposts (
      post_id VARCHAR(50) NOT NULL,
      member_id VARCHAR(50) NOT NULL,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      PRIMARY KEY (post_id, member_id),
      INDEX idx_reposts_member (member_id)
    )
  `);
  await db.query(`
    CREATE TABLE IF NOT EXISTS post_sends (
      send_id VARCHAR(50) PRIMARY KEY,
      post_id VARCHAR(50) NOT NULL,
      member_id VARCHAR(50) NOT NULL,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      INDEX idx_sends_post (post_id)
    )
  `);
  await ensureDemoSeedPosts();
}

/** Fixed IDs so we can INSERT IGNORE without clobbering user-created posts. Runs once per process. */
let demoSeedPostsRan = false;
const DEMO_SEED_POSTS = [
  {
    post_id: 'P-SEED-ALEX',
    member_id: 'M-DEMO-01',
    author_name: 'Alex Chen',
    author_headline: 'Senior Engineer at Acme',
    body:
      'Shipped a Kafka retry strategy that cut duplicate writes by 92%. Sharing a quick architecture sketch soon.',
    image_data:
      'https://images.unsplash.com/photo-1518773553398-650c184e0bb3?auto=format&fit=crop&w=1200&q=80'
  },
  {
    post_id: 'P-SEED-PRIYA',
    member_id: 'M-DEMO-02',
    author_name: 'Priya Kapoor',
    author_headline: 'Recruiter at Nova Labs',
    body:
      'Hiring for distributed systems and backend interns. Strong fundamentals in data pipelines are a plus.',
    image_data: null
  },
  {
    post_id: 'P-SEED-JORDAN',
    member_id: 'M-DEMO-03',
    author_name: 'Jordan Lee',
    author_headline: 'Staff Engineer · Platform',
    body:
      'Tip: idempotent consumers + dead-letter topics saved us more than “retry three times” ever could. Happy to share our runbook.',
    image_data:
      'https://images.unsplash.com/photo-1555066931-4365d14bab8c?auto=format&fit=crop&w=1200&q=80'
  },
  {
    post_id: 'P-SEED-MARIA',
    member_id: 'M-DEMO-04',
    author_name: 'Maria Santos',
    author_headline: 'Product Design Lead',
    body:
      'We’re polishing the job application flow—faster uploads, clearer status, fewer dead ends. Feedback welcome from hiring managers.',
    image_data: null
  },
  {
    post_id: 'P-SEED-RAHUL',
    member_id: 'M-DEMO-05',
    author_name: 'Rahul Verma',
    author_headline: 'Data Infra @ Northwind',
    body:
      'Interesting read on stream-table duality this week. If you’re modeling events in MySQL + Kafka, worth a skim before your next schema change.',
    image_data:
      'https://images.unsplash.com/photo-1544383835-bda2bc66a55d?auto=format&fit=crop&w=1200&q=80'
  }
];

async function ensureDemoSeedPosts() {
  if (demoSeedPostsRan) return;
  try {
    for (const s of DEMO_SEED_POSTS) {
      await db.query(
        'INSERT IGNORE INTO posts (post_id, member_id, author_name, author_headline, body, image_data) VALUES (?, ?, ?, ?, ?, ?)',
        [s.post_id, s.member_id, s.author_name, s.author_headline, s.body, s.image_data]
      );
    }
    demoSeedPostsRan = true;
    console.log('post-service: ensured demo seed posts (INSERT IGNORE, idempotent)');
  } catch (e) {
    console.error('post-service: demo seed failed (feed may be empty):', e.message);
  }
}

function newId(prefix) {
  return `${prefix}-${crypto.randomUUID().substring(0, 8)}`;
}

function quotedPayloadFromRow(r) {
  if (!r.quoted_post_id || !r.qp_post_id) return null;
  return {
    post_id: r.qp_post_id,
    member_id: r.qp_member_id,
    author_name: r.qp_author_name,
    author_headline: r.qp_author_headline,
    body: r.qp_body,
    image_data: r.qp_image_data,
    author_profile_photo_url: r.qp_author_profile_photo_url || null
  };
}

/** POST /posts/create */
app.post('/posts/create', async (req, res) => {
  try {
    await ensureTables();
    const { member_id, author_name, body, image_data, author_headline, quoted_post_id } = req.body || {};
    if (!member_id || !String(body || '').trim()) {
      return res.status(400).json({ error: 'BAD_REQUEST', message: 'member_id and body required' });
    }
    let qid = quoted_post_id && String(quoted_post_id).trim() ? String(quoted_post_id).trim() : null;
    if (qid) {
      const [qrows] = await db.query('SELECT post_id FROM posts WHERE post_id = ? LIMIT 1', [qid]);
      if (!qrows.length) {
        return res.status(400).json({ error: 'BAD_REQUEST', message: 'quoted_post_id not found' });
      }
    }
    const postId = newId('P');
    await db.query(
      'INSERT INTO posts (post_id, member_id, author_name, author_headline, body, image_data, quoted_post_id) VALUES (?, ?, ?, ?, ?, ?, ?)',
      [postId, member_id, author_name || null, author_headline || null, String(body).trim(), image_data || null, qid]
    );
    res.status(201).json({ post_id: postId, message: 'Post created' });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'INTERNAL_ERROR', message: e.message });
  }
});

/** POST /posts/list — viewer_member_id for liked flag */
app.post('/posts/list', async (req, res) => {
  try {
    await ensureTables();
    const limit = Math.min(Number(req.body?.limit) || 50, 100);
    const viewerId = req.body?.viewer_member_id || null;
    const [rows] = await db.query(
      `SELECT p.post_id, p.member_id, p.author_name, p.author_headline, p.body, p.image_data, p.created_at, p.quoted_post_id,
        m.profile_photo_url AS author_profile_photo_url,
        qp.post_id AS qp_post_id,
        qp.member_id AS qp_member_id,
        qp.author_name AS qp_author_name,
        qp.author_headline AS qp_author_headline,
        qp.body AS qp_body,
        qp.image_data AS qp_image_data,
        qm.profile_photo_url AS qp_author_profile_photo_url,
        (SELECT COUNT(*) FROM post_likes l WHERE l.post_id = p.post_id) AS like_count,
        (SELECT COUNT(*) FROM post_comments c WHERE c.post_id = p.post_id) AS comment_count,
        (SELECT COUNT(*) FROM post_reposts r WHERE r.post_id = p.post_id) AS repost_count,
        (SELECT COUNT(*) FROM post_sends s WHERE s.post_id = p.post_id) AS send_count
       FROM posts p
       LEFT JOIN members m ON m.member_id = p.member_id AND COALESCE(m.status, '') != 'deleted'
       LEFT JOIN posts qp ON qp.post_id = p.quoted_post_id
       LEFT JOIN members qm ON qm.member_id = qp.member_id AND COALESCE(qm.status, '') != 'deleted'
       ORDER BY p.created_at DESC
       LIMIT ?`,
      [limit]
    );
    const out = [];
    for (const r of rows) {
      let liked = false;
      let reposted = false;
      let sent = false;
      if (viewerId) {
        const [L] = await db.query('SELECT 1 FROM post_likes WHERE post_id = ? AND member_id = ? LIMIT 1', [
          r.post_id,
          viewerId
        ]);
        liked = L.length > 0;
        const [R] = await db.query('SELECT 1 FROM post_reposts WHERE post_id = ? AND member_id = ? LIMIT 1', [
          r.post_id,
          viewerId
        ]);
        reposted = R.length > 0;
        const [S] = await db.query('SELECT 1 FROM post_sends WHERE post_id = ? AND member_id = ? LIMIT 1', [
          r.post_id,
          viewerId
        ]);
        sent = S.length > 0;
      }
      const quoted = quotedPayloadFromRow(r);
      out.push({
        post_id: r.post_id,
        member_id: r.member_id,
        author_name: r.author_name,
        author_headline: r.author_headline,
        author_profile_photo_url: r.author_profile_photo_url || null,
        body: r.body,
        image_data: r.image_data,
        quoted_post_id: r.quoted_post_id || null,
        quoted,
        created_at: r.created_at,
        like_count: Number(r.like_count) || 0,
        comment_count: Number(r.comment_count) || 0,
        repost_count: Number(r.repost_count) || 0,
        send_count: Number(r.send_count) || 0,
        liked,
        reposted,
        sent
      });
    }
    res.json(out);
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'INTERNAL_ERROR', message: e.message });
  }
});

/** POST /posts/get — single post for share previews / deep links */
app.post('/posts/get', async (req, res) => {
  try {
    await ensureTables();
    const post_id = req.body?.post_id;
    if (!post_id) {
      return res.status(400).json({ error: 'BAD_REQUEST', message: 'post_id required' });
    }
    const viewerId = req.body?.viewer_member_id || null;
    const [rows] = await db.query(
      `SELECT p.post_id, p.member_id, p.author_name, p.author_headline, p.body, p.image_data, p.created_at, p.quoted_post_id,
        m.profile_photo_url AS author_profile_photo_url,
        qp.post_id AS qp_post_id,
        qp.member_id AS qp_member_id,
        qp.author_name AS qp_author_name,
        qp.author_headline AS qp_author_headline,
        qp.body AS qp_body,
        qp.image_data AS qp_image_data,
        qm.profile_photo_url AS qp_author_profile_photo_url,
        (SELECT COUNT(*) FROM post_likes l WHERE l.post_id = p.post_id) AS like_count,
        (SELECT COUNT(*) FROM post_comments c WHERE c.post_id = p.post_id) AS comment_count,
        (SELECT COUNT(*) FROM post_reposts r WHERE r.post_id = p.post_id) AS repost_count,
        (SELECT COUNT(*) FROM post_sends s WHERE s.post_id = p.post_id) AS send_count
       FROM posts p
       LEFT JOIN members m ON m.member_id = p.member_id AND COALESCE(m.status, '') != 'deleted'
       LEFT JOIN posts qp ON qp.post_id = p.quoted_post_id
       LEFT JOIN members qm ON qm.member_id = qp.member_id AND COALESCE(qm.status, '') != 'deleted'
       WHERE p.post_id = ?`,
      [post_id]
    );
    if (!rows.length) {
      return res.status(404).json({ error: 'NOT_FOUND', message: 'Post not found' });
    }
    const r = rows[0];
    let liked = false;
    let reposted = false;
    let sent = false;
    if (viewerId) {
      const [L] = await db.query('SELECT 1 FROM post_likes WHERE post_id = ? AND member_id = ? LIMIT 1', [
        r.post_id,
        viewerId
      ]);
      liked = L.length > 0;
      const [R] = await db.query('SELECT 1 FROM post_reposts WHERE post_id = ? AND member_id = ? LIMIT 1', [
        r.post_id,
        viewerId
      ]);
      reposted = R.length > 0;
      const [S] = await db.query('SELECT 1 FROM post_sends WHERE post_id = ? AND member_id = ? LIMIT 1', [
        r.post_id,
        viewerId
      ]);
      sent = S.length > 0;
    }
    const quoted = quotedPayloadFromRow(r);
    res.json({
      post_id: r.post_id,
      member_id: r.member_id,
      author_name: r.author_name,
      author_headline: r.author_headline,
      author_profile_photo_url: r.author_profile_photo_url || null,
      body: r.body,
      image_data: r.image_data,
      quoted_post_id: r.quoted_post_id || null,
      quoted,
      created_at: r.created_at,
      like_count: Number(r.like_count) || 0,
      comment_count: Number(r.comment_count) || 0,
      repost_count: Number(r.repost_count) || 0,
      send_count: Number(r.send_count) || 0,
      liked,
      reposted,
      sent
    });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'INTERNAL_ERROR', message: e.message });
  }
});

app.post('/posts/like', async (req, res) => {
  try {
    await ensureTables();
    const { post_id, member_id } = req.body || {};
    if (!post_id || !member_id) {
      return res.status(400).json({ error: 'BAD_REQUEST', message: 'post_id and member_id required' });
    }
    await db.query('INSERT IGNORE INTO post_likes (post_id, member_id) VALUES (?, ?)', [post_id, member_id]);
    const [[c]] = await db.query('SELECT COUNT(*) AS n FROM post_likes WHERE post_id = ?', [post_id]);
    res.json({ ok: true, like_count: Number(c.n) || 0 });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'INTERNAL_ERROR', message: e.message });
  }
});

app.post('/posts/unlike', async (req, res) => {
  try {
    await ensureTables();
    const { post_id, member_id } = req.body || {};
    if (!post_id || !member_id) {
      return res.status(400).json({ error: 'BAD_REQUEST', message: 'post_id and member_id required' });
    }
    await db.query('DELETE FROM post_likes WHERE post_id = ? AND member_id = ?', [post_id, member_id]);
    const [[c]] = await db.query('SELECT COUNT(*) AS n FROM post_likes WHERE post_id = ?', [post_id]);
    res.json({ ok: true, like_count: Number(c.n) || 0 });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'INTERNAL_ERROR', message: e.message });
  }
});

app.post('/posts/comment', async (req, res) => {
  try {
    await ensureTables();
    const { post_id, member_id, author_name, body } = req.body || {};
    if (!post_id || !member_id || !String(body || '').trim()) {
      return res.status(400).json({ error: 'BAD_REQUEST', message: 'post_id, member_id, body required' });
    }
    const commentId = newId('C');
    await db.query(
      'INSERT INTO post_comments (comment_id, post_id, member_id, author_name, body) VALUES (?, ?, ?, ?, ?)',
      [commentId, post_id, member_id, author_name || null, String(body).trim()]
    );
    const [[c]] = await db.query('SELECT COUNT(*) AS n FROM post_comments WHERE post_id = ?', [post_id]);
    res.status(201).json({ comment_id: commentId, comment_count: Number(c.n) || 0 });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'INTERNAL_ERROR', message: e.message });
  }
});

app.post('/posts/comments/list', async (req, res) => {
  try {
    await ensureTables();
    const { post_id } = req.body || {};
    if (!post_id) return res.status(400).json({ error: 'BAD_REQUEST', message: 'post_id required' });
    const [rows] = await db.query(
      'SELECT comment_id, post_id, member_id, author_name, body, created_at FROM post_comments WHERE post_id = ? ORDER BY created_at ASC LIMIT 200',
      [post_id]
    );
    res.json(rows);
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'INTERNAL_ERROR', message: e.message });
  }
});

app.post('/posts/repost', async (req, res) => {
  try {
    await ensureTables();
    const { post_id, member_id } = req.body || {};
    if (!post_id || !member_id) {
      return res.status(400).json({ error: 'BAD_REQUEST', message: 'post_id and member_id required' });
    }
    await db.query('INSERT IGNORE INTO post_reposts (post_id, member_id) VALUES (?, ?)', [post_id, member_id]);
    const [[c]] = await db.query('SELECT COUNT(*) AS n FROM post_reposts WHERE post_id = ?', [post_id]);
    res.json({ ok: true, repost_count: Number(c.n) || 0, reposted: true });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'INTERNAL_ERROR', message: e.message });
  }
});

app.post('/posts/unrepost', async (req, res) => {
  try {
    await ensureTables();
    const { post_id, member_id } = req.body || {};
    if (!post_id || !member_id) {
      return res.status(400).json({ error: 'BAD_REQUEST', message: 'post_id and member_id required' });
    }
    await db.query('DELETE FROM post_reposts WHERE post_id = ? AND member_id = ?', [post_id, member_id]);
    const [[c]] = await db.query('SELECT COUNT(*) AS n FROM post_reposts WHERE post_id = ?', [post_id]);
    res.json({ ok: true, repost_count: Number(c.n) || 0, reposted: false });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'INTERNAL_ERROR', message: e.message });
  }
});

app.post('/posts/send', async (req, res) => {
  try {
    await ensureTables();
    const { post_id, member_id } = req.body || {};
    if (!post_id || !member_id) {
      return res.status(400).json({ error: 'BAD_REQUEST', message: 'post_id and member_id required' });
    }
    const sendId = newId('SEND');
    await db.query('INSERT INTO post_sends (send_id, post_id, member_id) VALUES (?, ?, ?)', [
      sendId,
      post_id,
      member_id
    ]);
    const [[c]] = await db.query('SELECT COUNT(*) AS n FROM post_sends WHERE post_id = ?', [post_id]);
    res.json({ ok: true, send_id: sendId, send_count: Number(c.n) || 0 });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'INTERNAL_ERROR', message: e.message });
  }
});

const PORT = process.env.PORT || 4007;
app.listen(PORT, () => console.log(`post-service API running on port ${PORT}`));
