const mysql = require('mysql2/promise');

const pool = mysql.createPool({
  host: process.env.MYSQL_HOST || '127.0.0.1',
  port: Number(process.env.MYSQL_PORT) || 3307,
  user: process.env.MYSQL_USER || 'linkedin_user',
  password: process.env.MYSQL_PASSWORD || 'linkedin_pass',
  database: process.env.MYSQL_DATABASE || 'linkedin_db',
  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0,
  connectTimeout: 15000
});

module.exports = pool;