#!/usr/bin/env node
/**
 * Seed realistic candidate members + applications for AI ranking demos.
 *
 * Usage:
 *   node scripts/seed-ai-applicants.js --job-id J-1001 --count 20
 *   npm run seed:ai-applicants -- --job-id J-1001
 */
const path = require('path');
const crypto = require('crypto');
const db = require(path.join(__dirname, 'lib', 'mysql'));

function argValue(flag) {
  const idx = process.argv.indexOf(flag);
  if (idx === -1) return '';
  return String(process.argv[idx + 1] || '').trim();
}

function toSkillList(skills) {
  return Array.from(new Set((skills || []).map((s) => String(s).trim()).filter(Boolean)));
}

function buildResumeText(candidate) {
  const topSkills = toSkillList(candidate.skills).slice(0, 10).join(', ');
  const expText = (candidate.experience || [])
    .map((e) => `${e.role} at ${e.company} (${e.period}): ${e.description}`)
    .join(' ');
  const eduText = (candidate.education || [])
    .map((e) => `${e.degree}, ${e.school} (${e.period})`)
    .join(' ');
  return `${candidate.summary} Skills: ${topSkills}. Experience: ${expText} Education: ${eduText}`.trim();
}

function candidatePool() {
  const names = [
    ['Aarav', 'Sharma'], ['Maya', 'Patel'], ['Rohan', 'Gupta'], ['Nina', 'Iyer'], ['Ethan', 'Cole'],
    ['Leah', 'Kim'], ['Arjun', 'Reddy'], ['Sofia', 'Martinez'], ['Daniel', 'Nguyen'], ['Priya', 'Nair'],
    ['Ishaan', 'Mehta'], ['Chloe', 'Brooks'], ['Noah', 'Singh'], ['Anika', 'Rao'], ['Kabir', 'Verma'],
    ['Zoe', 'Foster'], ['Rahul', 'Desai'], ['Ava', 'Murphy'], ['Neel', 'Joshi'], ['Elena', 'Park'],
    ['Samir', 'Khan'], ['Liam', 'Davis'], ['Diya', 'Menon'], ['Owen', 'Price'], ['Meera', 'Kapoor'],
  ];
  const roleTemplates = [
    {
      title: 'Backend Engineer',
      stack: ['Python', 'FastAPI', 'Kafka', 'Redis', 'MySQL', 'Docker'],
      summary:
        'Backend engineer focused on event-driven microservices, low-latency APIs, and scalable data workflows.',
    },
    {
      title: 'Platform Engineer',
      stack: ['Kubernetes', 'Terraform', 'Python', 'Kafka', 'AWS', 'Prometheus'],
      summary:
        'Platform engineer with experience in cloud infrastructure, observability, CI/CD, and resilient distributed systems.',
    },
    {
      title: 'Full Stack Engineer',
      stack: ['React', 'TypeScript', 'Node.js', 'Python', 'PostgreSQL', 'Redis'],
      summary:
        'Full stack engineer delivering production-grade web apps, backend services, and developer tooling.',
    },
    {
      title: 'Data Engineer',
      stack: ['Python', 'Spark', 'Airflow', 'Kafka', 'SQL', 'dbt'],
      summary:
        'Data engineer building reliable pipelines, streaming ETL systems, and analytics-ready data platforms.',
    },
    {
      title: 'ML Engineer',
      stack: ['Python', 'PyTorch', 'scikit-learn', 'FastAPI', 'Docker', 'MLOps'],
      summary:
        'ML engineer with practical experience deploying models, building inference services, and monitoring model quality.',
    },
  ];

  const schools = [
    'San Jose State University',
    'UC Berkeley',
    'Stanford University',
    'University of Texas at Austin',
    'Carnegie Mellon University',
    'Georgia Tech',
  ];
  const locations = ['San Jose, California', 'San Francisco, California', 'Austin, Texas', 'Seattle, Washington'];

  return names.map((pair, idx) => {
    const first = pair[0];
    const last = pair[1];
    const tpl = roleTemplates[idx % roleTemplates.length];
    const years = 3 + (idx % 8);
    const school = schools[idx % schools.length];
    const location = locations[idx % locations.length];
    const skills = toSkillList([...tpl.stack, idx % 2 === 0 ? 'System Design' : 'CI/CD', idx % 3 === 0 ? 'GraphQL' : 'REST']);
    const experience = [
      {
        role: `${tpl.title}`,
        company: idx % 2 === 0 ? 'Nova Systems' : 'Acme Labs',
        period: `202${(idx % 4)} - Present`,
        description:
          `Built and operated ${tpl.title.toLowerCase()} solutions for high-traffic products. Led delivery of key services and improved reliability metrics.`,
      },
      {
        role: `Software Engineer`,
        company: idx % 2 === 0 ? 'BrightWorks' : 'CloudArc',
        period: `201${(idx % 5)} - 202${(idx % 4)}`,
        description:
          'Implemented APIs, optimized data access patterns, and partnered with cross-functional teams to ship features at scale.',
      },
    ];
    const education = [
      {
        school,
        degree: idx % 2 === 0 ? 'B.S. Computer Science' : 'M.S. Computer Science',
        period: idx % 2 === 0 ? '2013 - 2017' : '2016 - 2018',
      },
    ];
    const memberId = `M-AI-${String(idx + 1).padStart(3, '0')}`;
    const name = `${first} ${last}`;
    return {
      member_id: memberId,
      name,
      first_name: first,
      last_name: last,
      email: `${first.toLowerCase()}.${last.toLowerCase()}.ai${idx + 1}@example.com`,
      location,
      title: `${tpl.title} (${years} yrs exp)`,
      headline: `${tpl.title} | ${skills.slice(0, 4).join(' • ')}`,
      summary: tpl.summary,
      about: tpl.summary,
      years,
      skills,
      experience,
      education,
    };
  });
}

async function resolveJobId(requestedJobId) {
  const requested = String(requestedJobId || '').trim();
  if (requested) {
    const [rows] = await db.query('SELECT job_id, status, title FROM jobs WHERE job_id = ? LIMIT 1', [requested]);
    if (!rows.length) {
      throw new Error(`Job '${requested}' was not found in jobs table.`);
    }
    return rows[0].job_id;
  }
  const [openRows] = await db.query("SELECT job_id, title FROM jobs WHERE status = 'open' ORDER BY created_at DESC LIMIT 1");
  if (!openRows.length) {
    throw new Error('No open job found. Pass --job-id explicitly.');
  }
  return openRows[0].job_id;
}

async function upsertMembers(candidates) {
  let upserted = 0;
  for (const c of candidates) {
    const resumeText = buildResumeText(c);
    await db.query(
      `INSERT INTO members (
         member_id, name, first_name, last_name, title, headline, location, city, state, country,
         email, about, summary, skills, experience, education, resume_text, status
       ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'active')
       ON DUPLICATE KEY UPDATE
         name = VALUES(name),
         first_name = VALUES(first_name),
         last_name = VALUES(last_name),
         title = VALUES(title),
         headline = VALUES(headline),
         location = VALUES(location),
         city = VALUES(city),
         state = VALUES(state),
         country = VALUES(country),
         email = VALUES(email),
         about = VALUES(about),
         summary = VALUES(summary),
         skills = VALUES(skills),
         experience = VALUES(experience),
         education = VALUES(education),
         resume_text = VALUES(resume_text),
         status = 'active'`,
      [
        c.member_id,
        c.name,
        c.first_name,
        c.last_name,
        c.title,
        c.headline,
        c.location,
        c.location.split(',')[0] || null,
        c.location.split(',')[1]?.trim() || null,
        'United States',
        c.email,
        c.about,
        c.summary,
        JSON.stringify(c.skills),
        JSON.stringify(c.experience),
        JSON.stringify(c.education),
        resumeText,
      ]
    );
    upserted += 1;
  }
  return upserted;
}

async function seedApplications(jobId, candidates) {
  let inserted = 0;
  for (const c of candidates) {
    const appId = `APP-AI-${crypto.randomUUID().slice(0, 8)}`;
    const coverLetter = `Hello Hiring Team, I am interested in ${jobId}. My background in ${c.skills.slice(0, 3).join(', ')} aligns well with the role requirements.`;
    const [result] = await db.query(
      `INSERT IGNORE INTO applications (
         app_id, job_id, member_id, status, resume_url, resume_text, cover_letter, answers
       ) VALUES (?, ?, ?, 'submitted', ?, ?, ?, ?)`,
      [
        appId,
        jobId,
        c.member_id,
        `https://example.com/resumes/${c.member_id.toLowerCase()}.pdf`,
        buildResumeText(c),
        coverLetter,
        JSON.stringify({
          years_experience: c.years,
          core_skills: c.skills.slice(0, 6),
          preferred_location: c.location,
        }),
      ]
    );
    if (result && result.affectedRows > 0) inserted += 1;
  }
  return inserted;
}

async function main() {
  const requestedJobId = argValue('--job-id');
  const count = Number(argValue('--count') || '20');
  const safeCount = Number.isFinite(count) ? Math.max(1, Math.min(100, count)) : 20;

  const jobId = await resolveJobId(requestedJobId);
  const pool = candidatePool().slice(0, safeCount);
  const upsertedMembers = await upsertMembers(pool);
  const insertedApplications = await seedApplications(jobId, pool);

  const [appRows] = await db.query('SELECT COUNT(*) AS c FROM applications WHERE job_id = ?', [jobId]);
  const totalForJob = Number(appRows[0]?.c || 0);

  console.log(
    JSON.stringify(
      {
        ok: true,
        job_id: jobId,
        requested_job_id: requestedJobId || null,
        members_upserted: upsertedMembers,
        applications_inserted: insertedApplications,
        applications_total_for_job: totalForJob,
      },
      null,
      2
    )
  );
}

main()
  .then(async () => {
    try {
      await db.end();
    } catch (_) {
      // ignore pool shutdown errors on exit
    }
    process.exit(0);
  })
  .catch(async (err) => {
    console.error(err);
    try {
      await db.end();
    } catch (_) {
      // ignore pool shutdown errors on exit
    }
    process.exit(1);
  });

