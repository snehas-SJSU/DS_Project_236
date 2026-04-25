/**
 * seed-kaggle.js
 * ─────────────────────────────────────────────────────────────────
 * Loads Kaggle LinkedIn job postings + resume datasets into MySQL.
 *
 * Usage:
 *   node scripts/seed-kaggle.js
 *
 * Env vars (or defaults):
 *   KAGGLE_JOBS_CSV   – path to job_postings.csv   (archive/job_postings.csv)
 *   KAGGLE_COMPANIES_CSV – path to companies.csv   (archive/companies.csv)
 *   KAGGLE_RESUME_CSV – path to Resume.csv          (archive-2/Resume/Resume.csv)
 *   MYSQL_HOST / MYSQL_USER / MYSQL_PASSWORD / MYSQL_DATABASE  – MySQL creds (same as docker-compose)
 *
 *   TARGET_JOBS       – how many jobs to seed       (default 10000)
 *   TARGET_MEMBERS    – how many members to seed    (default 10000)
 *   TARGET_RECRUITERS – how many recruiters to seed (default 10000)
 *   TARGET_APPS       – how many applications       (default 20000)
 *   BATCH_SIZE        – INSERT batch size           (default 200)
 * ─────────────────────────────────────────────────────────────────
 */

'use strict';

const fs   = require('fs');
const path = require('path');
const csv  = require('csv-parse/sync');
const mysql = require('mysql2/promise');
const crypto = require('crypto');

// ── Config ────────────────────────────────────────────────────────
const JOBS_CSV      = process.env.KAGGLE_JOBS_CSV      || path.join(__dirname, '../data/jobs/job_postings.csv');
const COMPANIES_CSV = process.env.KAGGLE_COMPANIES_CSV || path.join(__dirname, '../data/jobs/companies.csv');
const RESUME_CSV    = process.env.KAGGLE_RESUME_CSV    || path.join(__dirname, '../data/resumes/Resume.csv');

const TARGET_JOBS       = parseInt(process.env.TARGET_JOBS       || '10000');
const TARGET_MEMBERS    = parseInt(process.env.TARGET_MEMBERS    || '10000');
const TARGET_RECRUITERS = parseInt(process.env.TARGET_RECRUITERS || '10000');
const TARGET_APPS       = parseInt(process.env.TARGET_APPS       || '20000');
const BATCH_SIZE        = parseInt(process.env.BATCH_SIZE        || '200');

const DB_CONFIG = {
  host:     process.env.MYSQL_HOST     || '127.0.0.1',
  port:     parseInt(process.env.MYSQL_PORT || '3306'),
  user:     process.env.MYSQL_USER     || 'linkedin_user',
  password: process.env.MYSQL_PASSWORD || 'linkedin_pass',
  database: process.env.MYSQL_DATABASE || 'linkedin_db',
  multipleStatements: true,
  connectTimeout: 30000,
};

// ── Helpers ───────────────────────────────────────────────────────
const uid  = (prefix) => `${prefix}-${crypto.randomUUID().slice(0, 8)}`;
const rand = (arr) => arr[Math.floor(Math.random() * arr.length)];
const randInt = (min, max) => Math.floor(Math.random() * (max - min + 1)) + min;

function chunk(arr, size) {
  const out = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
}

/** Read a CSV file synchronously; returns array of objects */
function readCSV(filePath) {
  console.log(`  Reading ${path.basename(filePath)} …`);
  const raw = fs.readFileSync(filePath, 'utf8');
  return csv.parse(raw, { columns: true, skip_empty_lines: true, relax_quotes: true, trim: true });
}

/** Batch insert rows into a table using placeholders */
async function batchInsert(conn, table, columns, rows) {
  if (!rows.length) return;
  const placeholders = `(${columns.map(() => '?').join(', ')})`;
  for (const batch of chunk(rows, BATCH_SIZE)) {
    const values = batch.flatMap(r => columns.map(c => r[c] ?? null));
    const sql = `INSERT IGNORE INTO ${table} (${columns.join(', ')}) VALUES ${batch.map(() => placeholders).join(', ')}`;
    await conn.execute(sql, values);
  }
}

// ── Fake data helpers ─────────────────────────────────────────────
const FIRST_NAMES = ['James','Mary','John','Patricia','Robert','Jennifer','Michael','Linda','William',
  'Barbara','David','Susan','Richard','Jessica','Joseph','Sarah','Thomas','Karen','Charles','Lisa',
  'Christopher','Nancy','Daniel','Betty','Matthew','Margaret','Anthony','Sandra','Mark','Ashley',
  'Donald','Emily','Steven','Donna','Paul','Carol','Andrew','Michelle','Kenneth','Amanda',
  'Joshua','Dorthy','Kevin','Melissa','Brian','Deborah','George','Stephanie','Timothy','Rebecca'];

const LAST_NAMES = ['Smith','Johnson','Williams','Brown','Jones','Garcia','Miller','Davis','Rodriguez',
  'Martinez','Hernandez','Lopez','Gonzalez','Wilson','Anderson','Thomas','Taylor','Moore','Jackson',
  'Martin','Lee','Perez','Thompson','White','Harris','Sanchez','Clark','Ramirez','Lewis','Robinson',
  'Walker','Young','Allen','King','Wright','Scott','Torres','Nguyen','Hill','Flores','Green','Adams',
  'Nelson','Baker','Hall','Rivera','Campbell','Mitchell','Carter','Roberts'];

const HEADLINES = [
  'Software Engineer | Full Stack Developer',
  'Product Manager | SaaS & Platform',
  'Data Scientist | ML & Analytics',
  'Marketing Manager | Growth & Brand',
  'UX Designer | Human-Centered Design',
  'Financial Analyst | Corporate Finance',
  'Operations Manager | Process Optimization',
  'Sales Executive | Enterprise & SMB',
  'HR Business Partner | Talent Acquisition',
  'DevOps Engineer | Cloud Infrastructure',
  'Business Analyst | Strategy & Execution',
  'Healthcare Administrator | Patient Care',
  'Recruiter | Tech & Startup Hiring',
  'Project Manager | Agile & Scrum',
  'Cybersecurity Analyst | Risk & Compliance',
];

const US_CITIES = ['New York, NY','Los Angeles, CA','Chicago, IL','Houston, TX','Phoenix, AZ',
  'Philadelphia, PA','San Antonio, TX','San Diego, CA','Dallas, TX','San Jose, CA',
  'Austin, TX','Jacksonville, FL','Fort Worth, TX','Columbus, OH','Charlotte, NC',
  'Indianapolis, IN','San Francisco, CA','Seattle, WA','Denver, CO','Nashville, TN',
  'Boston, MA','El Paso, TX','Portland, OR','Las Vegas, NV','Memphis, TN',
  'Louisville, KY','Baltimore, MD','Milwaukee, WI','Albuquerque, NM','Tucson, AZ'];

const SKILLS_POOL = ['Python','JavaScript','SQL','React','Node.js','AWS','Docker','Kubernetes',
  'Machine Learning','Data Analysis','Excel','Project Management','Agile','Scrum','Git',
  'Java','TypeScript','PostgreSQL','MongoDB','Redis','Communication','Leadership',
  'Problem Solving','Marketing','Salesforce','HubSpot','Tableau','Power BI','Figma','Sketch'];

const INDUSTRIES = ['Technology','Healthcare','Finance','Marketing','Education','Manufacturing',
  'Retail','Consulting','Media','Real Estate','Legal','Non-profit','Government','Logistics'];

const SENIORITY_MAP = {
  'Entry level':       'entry',
  'Associate':         'associate',
  'Mid-Senior level':  'mid-senior',
  'Director':          'director',
  'Executive':         'executive',
  'Internship':        'internship',
};

const WORK_TYPE_MAP = {
  'Full-time':  'full-time',
  'Part-time':  'part-time',
  'Contract':   'contract',
  'Temporary':  'temporary',
  'Internship': 'internship',
  'Other':      'other',
  'Volunteer':  'volunteer',
};

const APP_STATUSES = ['submitted','reviewing','interview','offer','rejected'];
const APP_STATUS_WEIGHTS = [0.4, 0.25, 0.15, 0.05, 0.15]; // rough distribution

function weightedStatus() {
  const r = Math.random();
  let cum = 0;
  for (let i = 0; i < APP_STATUSES.length; i++) {
    cum += APP_STATUS_WEIGHTS[i];
    if (r < cum) return APP_STATUSES[i];
  }
  return 'submitted';
}

function fakeEmail(first, last, idx) {
  const domains = ['gmail.com','yahoo.com','outlook.com','hotmail.com','icloud.com','proton.me'];
  return `${first.toLowerCase()}.${last.toLowerCase()}${idx}@${rand(domains)}`;
}

function fakePhone() {
  return `+1${randInt(200,999)}${randInt(100,999)}${randInt(1000,9999)}`;
}

function fakeSkills(count = 5) {
  const shuffled = [...SKILLS_POOL].sort(() => Math.random() - 0.5);
  return JSON.stringify(shuffled.slice(0, count));
}

// ── Main ──────────────────────────────────────────────────────────
async function main() {
  console.log('╔══════════════════════════════════════════╗');
  console.log('║      LinkedIn Sim — Kaggle Seeder        ║');
  console.log('╚══════════════════════════════════════════╝\n');

  // ── 1. Read CSVs ────────────────────────────────────────────────
  console.log('Step 1/5 — Reading CSV files …');
  if (!fs.existsSync(JOBS_CSV))    { console.error(`JOBS_CSV not found: ${JOBS_CSV}`);    process.exit(1); }
  if (!fs.existsSync(COMPANIES_CSV)) { console.error(`COMPANIES_CSV not found: ${COMPANIES_CSV}`); process.exit(1); }
  if (!fs.existsSync(RESUME_CSV))  { console.error(`RESUME_CSV not found: ${RESUME_CSV}`); process.exit(1); }

  const rawJobs      = readCSV(JOBS_CSV);
  const rawCompanies = readCSV(COMPANIES_CSV);
  const rawResumes   = readCSV(RESUME_CSV);

  console.log(`  job_postings: ${rawJobs.length.toLocaleString()} rows`);
  console.log(`  companies:    ${rawCompanies.length.toLocaleString()} rows`);
  console.log(`  resumes:      ${rawResumes.length.toLocaleString()} rows\n`);

  // ── 2. Connect ──────────────────────────────────────────────────
  console.log('Step 2/5 — Connecting to MySQL …');
  const conn = await mysql.createConnection(DB_CONFIG);
  console.log(`  Connected to ${DB_CONFIG.host}:${DB_CONFIG.port}/${DB_CONFIG.database}\n`);

  // ── 3. Build company lookup & seed recruiters ───────────────────
  console.log('Step 3/5 — Seeding recruiters & companies …');

  // Build company_id → company info map from Kaggle companies
  const companyMap = {};
  for (const c of rawCompanies) {
    if (c.company_id) companyMap[c.company_id] = c;
  }

  // We need TARGET_RECRUITERS recruiters. Use real company data where possible,
  // generate synthetic for the rest.
  const recruiterRows = [];
  const companyKeys   = Object.keys(companyMap);

  for (let i = 0; i < TARGET_RECRUITERS; i++) {
    const first = rand(FIRST_NAMES);
    const last  = rand(LAST_NAMES);
    const rid   = uid('R');
    const useKaggle = i < companyKeys.length;
    const comp  = useKaggle ? companyMap[companyKeys[i]] : null;

    recruiterRows.push({
      recruiter_id:     rid,
      company_id:       comp ? `C-${comp.company_id}` : uid('C'),
      name:             `${first} ${last}`,
      email:            fakeEmail(first, last, i),
      phone:            fakePhone(),
      company_name:     comp ? (comp.name || `Company ${i}`) : `Company ${i}`,
      company_industry: comp ? (comp.description || '').substring(0, 80) : rand(INDUSTRIES),
      company_size:     comp ? String(comp.company_size || '').replace('.0', '') : rand(['11-50','51-200','201-500','501-1000','1000+']),
      access_level:     rand(['admin','recruiter','hiring_manager']),
      status:           'active',
    });
  }

  await batchInsert(conn, 'recruiters',
    ['recruiter_id','company_id','name','email','phone','company_name','company_industry','company_size','access_level','status'],
    recruiterRows);
  console.log(`  ✓ ${recruiterRows.length.toLocaleString()} recruiters inserted\n`);

  // ── 4. Seed jobs ────────────────────────────────────────────────
  console.log('Step 4/5 — Seeding jobs …');

  // Take up to TARGET_JOBS from Kaggle, cycle if needed
  const jobRows = [];
  for (let i = 0; i < TARGET_JOBS; i++) {
    const raw = rawJobs[i % rawJobs.length];
    const recruiter = recruiterRows[i % recruiterRows.length];

    // Parse location: "City, ST" → keep as-is or fall back
    const location = raw.location || rand(US_CITIES);

    // Salary: prefer min+max, else a range string
    let salary = null;
    if (raw.min_salary && raw.max_salary) {
      salary = `$${Number(raw.min_salary).toLocaleString()} – $${Number(raw.max_salary).toLocaleString()} / ${raw.pay_period || 'YEARLY'}`;
    } else if (raw.med_salary) {
      salary = `~$${Number(raw.med_salary).toLocaleString()} / ${raw.pay_period || 'YEARLY'}`;
    }

    const remoteAllowed = raw.remote_allowed;
    const remote_mode = remoteAllowed === '1' ? 'remote'
                      : remoteAllowed === '0' ? 'onsite'
                      : rand(['remote','hybrid','onsite']);

    jobRows.push({
      job_id:          `J-${raw.job_id || uid('J').slice(2)}`,
      title:           (raw.title || 'Software Engineer').substring(0, 255),
      company_id:      recruiter.company_id,
      company:         recruiter.company_name,
      industry:        rand(INDUSTRIES),
      location:        location.substring(0, 100),
      remote_mode,
      seniority_level: SENIORITY_MAP[raw.formatted_experience_level] || rand(Object.values(SENIORITY_MAP)),
      employment_type: WORK_TYPE_MAP[raw.formatted_work_type] || 'full-time',
      salary,
      type:            WORK_TYPE_MAP[raw.formatted_work_type] || 'full-time',
      skills:          fakeSkills(randInt(3, 8)),
      description:     (raw.description || raw.skills_desc || 'No description provided.').substring(0, 5000),
      status:          Math.random() < 0.05 ? 'closed' : 'open',   // ~5% closed
      recruiter_id:    recruiter.recruiter_id,
      views_count:     randInt(0, 500),
      saves_count:     randInt(0, 50),
      applicants_count: 0,   // will be updated after applications
    });
  }

  await batchInsert(conn, 'jobs',
    ['job_id','title','company_id','company','industry','location','remote_mode','seniority_level',
     'employment_type','salary','type','skills','description','status','recruiter_id',
     'views_count','saves_count','applicants_count'],
    jobRows);
  console.log(`  ✓ ${jobRows.length.toLocaleString()} jobs inserted\n`);

  // ── 5. Seed members ─────────────────────────────────────────────
  console.log('Step 5a/5 — Seeding members …');

  // We'll use resume text from Kaggle CSV (cycling through 2484 resumes)
  const memberRows = [];
  for (let i = 0; i < TARGET_MEMBERS; i++) {
    const first   = rand(FIRST_NAMES);
    const last    = rand(LAST_NAMES);
    const mid     = uid('M');
    const resume  = rawResumes[i % rawResumes.length];
    const loc     = rand(US_CITIES);
    const [city, stateStr] = loc.split(', ');

    memberRows.push({
      member_id:        mid,
      name:             `${first} ${last}`,
      first_name:       first,
      last_name:        last,
      title:            rand(HEADLINES),
      headline:         rand(HEADLINES),
      location:         loc,
      city:             city,
      state:            stateStr || '',
      country:          'US',
      email:            fakeEmail(first, last, i),
      phone:            fakePhone(),
      about:            `Experienced professional in ${resume.Category || 'general'} with a passion for delivering results.`,
      summary:          (resume.Resume_str || '').substring(0, 500).replace(/\n/g, ' ').trim(),
      skills:           fakeSkills(randInt(4, 10)),
      experience:       JSON.stringify([{
        title:   rand(HEADLINES).split(' | ')[0],
        company: `Company ${randInt(1, 500)}`,
        years:   `${randInt(2015, 2022)} – ${randInt(2022, 2025)}`,
      }]),
      education:        JSON.stringify([{
        degree: rand(['B.S.','B.A.','M.S.','MBA','Ph.D.']),
        school: `${rand(['State','City','Tech','National'])} University`,
        year:   randInt(2005, 2022),
      }]),
      resume_text:      (resume.Resume_str || '').substring(0, 3000).trim(),
      connections_count: randInt(0, 500),
      profile_views:     randInt(0, 200),
      status:           'active',
    });
  }

  await batchInsert(conn, 'members',
    ['member_id','name','first_name','last_name','title','headline','location','city','state',
     'country','email','phone','about','summary','skills','experience','education',
     'resume_text','connections_count','profile_views','status'],
    memberRows);
  console.log(`  ✓ ${memberRows.length.toLocaleString()} members inserted\n`);

  // ── 5b. Seed auth_users for members (so they can log in) ────────
  console.log('Step 5b/5 — Seeding auth_users for members …');
  // Default password: LinkedIn#1  (salt + pbkdf2 — same logic as member-service)
  const pbkdf2 = require('crypto').pbkdf2Sync;
  const DEFAULT_PASSWORD = 'LinkedIn#1';
  const authRows = memberRows.map(m => {
    const salt = crypto.randomBytes(16).toString('hex');
    const hash = pbkdf2(DEFAULT_PASSWORD, salt, 100000, 64, 'sha512').toString('hex');
    return { user_id: m.member_id, email: m.email, password_hash: hash, password_salt: salt, name: m.name };
  });

  await batchInsert(conn, 'auth_users',
    ['user_id','email','password_hash','password_salt','name'],
    authRows);
  console.log(`  ✓ ${authRows.length.toLocaleString()} auth_users inserted\n`);

  // ── 5c. Seed applications ───────────────────────────────────────
  console.log('Step 5c/5 — Seeding applications …');

  // Distribute TARGET_APPS across open jobs
  const openJobs = jobRows.filter(j => j.status === 'open');
  const appRows  = [];
  const appKeys  = new Set(); // avoid duplicate (job_id, member_id)

  let attempts = 0;
  while (appRows.length < TARGET_APPS && attempts < TARGET_APPS * 3) {
    attempts++;
    const job    = rand(openJobs);
    const member = rand(memberRows);
    const key    = `${job.job_id}|${member.member_id}`;
    if (appKeys.has(key)) continue;
    appKeys.add(key);

    appRows.push({
      app_id:       uid('A'),
      job_id:       job.job_id,
      member_id:    member.member_id,
      status:       weightedStatus(),
      resume_text:  (member.resume_text || '').substring(0, 1000),
      cover_letter: Math.random() < 0.4
        ? `I am excited to apply for the ${job.title} position at ${job.company}.`
        : null,
    });
  }

  await batchInsert(conn, 'applications',
    ['app_id','job_id','member_id','status','resume_text','cover_letter'],
    appRows);
  console.log(`  ✓ ${appRows.length.toLocaleString()} applications inserted\n`);

  // ── 5d. Update applicants_count on jobs ─────────────────────────
  console.log('Updating applicants_count on jobs …');
  const countMap = {};
  for (const a of appRows) {
    countMap[a.job_id] = (countMap[a.job_id] || 0) + 1;
  }
  // Batch UPDATE via CASE WHEN
  const jobIds = Object.keys(countMap);
  for (const batch of chunk(jobIds, 200)) {
    const cases = batch.map(id => `WHEN ? THEN ?`).join(' ');
    const vals  = batch.flatMap(id => [id, countMap[id]]);
    const inPlaceholders = batch.map(() => '?').join(', ');
    await conn.execute(
      `UPDATE jobs SET applicants_count = CASE job_id ${cases} END WHERE job_id IN (${inPlaceholders})`,
      [...vals, ...batch]
    );
  }
  console.log(`  ✓ applicants_count updated on ${jobIds.length.toLocaleString()} jobs\n`);

  // ── Done ─────────────────────────────────────────────────────────
  await conn.end();

  console.log('═══════════════════════════════════════════');
  console.log('✅  Seeding complete!');
  console.log(`   Recruiters : ${recruiterRows.length.toLocaleString()}`);
  console.log(`   Jobs       : ${jobRows.length.toLocaleString()}`);
  console.log(`   Members    : ${memberRows.length.toLocaleString()}`);
  console.log(`   Auth users : ${authRows.length.toLocaleString()}`);
  console.log(`   Applications: ${appRows.length.toLocaleString()}`);
  console.log('═══════════════════════════════════════════');
  console.log('\nDefault member login password: LinkedIn#1');
}

main().catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});
