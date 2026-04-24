const mysql = require('mysql2/promise');

// Create a connection pool instead of a single connection for high-throughput
const pool = mysql.createPool({
  // Use 127.0.0.1 (not "localhost") on macOS+Docker to avoid IPv6 ::1 hangs → gateway 504
  host: process.env.MYSQL_HOST || '127.0.0.1',
  user: process.env.MYSQL_USER || 'linkedin_user',
  password: process.env.MYSQL_PASSWORD || 'linkedin_pass',
  database: process.env.MYSQL_DATABASE || 'linkedin_db',
  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0,
  connectTimeout: 15000 // fail fast; avoids gateway 504 when MySQL is down/slow
});

module.exports = pool;
