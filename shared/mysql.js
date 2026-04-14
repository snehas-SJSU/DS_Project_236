const mysql = require('mysql2/promise');

// Create a connection pool instead of a single connection for high-throughput
const pool = mysql.createPool({
  host: process.env.MYSQL_HOST || 'localhost',
  user: process.env.MYSQL_USER || 'linkedin_user',
  password: process.env.MYSQL_PASSWORD || 'linkedin_pass',
  database: process.env.MYSQL_DATABASE || 'linkedin_db',
  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0
});

module.exports = pool;
