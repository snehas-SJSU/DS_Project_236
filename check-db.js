const db = require('./shared/mysql');

async function check() {
  try {
    const [tables] = await db.query('SHOW TABLES');
    console.log('Tables:', tables.map(t => Object.values(t)[0]));
    
    if (tables.some(t => Object.values(t)[0] === 'jobs')) {
      const [jobs] = await db.query('SELECT * FROM jobs');
      console.log('\n--- JOBS (Count: ' + jobs.length + ') ---');
      console.log(JSON.stringify(jobs, null, 2));
    }

    if (tables.some(t => Object.values(t)[0] === 'applications')) {
      const [apps] = await db.query('SELECT * FROM applications');
      console.log('\n--- APPLICATIONS (Count: ' + apps.length + ') ---');
      console.log(JSON.stringify(apps, null, 2));
    }

  } catch (err) {
    console.error('DB Error:', err.message);
  }
  process.exit(0);
}
check();
