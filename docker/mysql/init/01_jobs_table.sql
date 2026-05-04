-- Runs once on first MySQL volume init (before FastAPI). Matches backend/app/schema_init.py jobs DDL
-- so scripts/seed-demo-jobs.sql can import immediately.

USE linkedin_db;

CREATE TABLE IF NOT EXISTS jobs (
  job_id VARCHAR(50) PRIMARY KEY,
  title VARCHAR(255),
  company_id VARCHAR(50),
  company VARCHAR(255),
  industry VARCHAR(100),
  location VARCHAR(100),
  remote_mode VARCHAR(20),
  seniority_level VARCHAR(50),
  employment_type VARCHAR(50),
  salary VARCHAR(100),
  type VARCHAR(50),
  skills JSON,
  description TEXT,
  status VARCHAR(50) DEFAULT 'open',
  recruiter_id VARCHAR(50) DEFAULT 'R-default',
  views_count INT DEFAULT 0,
  saves_count INT DEFAULT 0,
  applicants_count INT DEFAULT 0,
  company_logo_url LONGTEXT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
