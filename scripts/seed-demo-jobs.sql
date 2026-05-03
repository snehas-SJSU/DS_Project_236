-- Realistic open jobs + company logos (Google favicon service — loads reliably in the UI).
--   npm run seed:demo-jobs

SET @s = (
  SELECT IF(
    COUNT(*) > 0,
    'SELECT 1',
    'ALTER TABLE jobs ADD COLUMN company_logo_url LONGTEXT NULL'
  )
  FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'jobs' AND COLUMN_NAME = 'company_logo_url'
);
PREPARE stmt FROM @s;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

INSERT INTO jobs (
  job_id, title, company_id, company, industry, location, remote_mode, seniority_level,
  employment_type, salary, type, skills, description, status, recruiter_id,
  views_count, saves_count, applicants_count, company_logo_url, created_at
) VALUES
('J-DEMO-001','Senior Backend Engineer',NULL,'Stripe',NULL,'San Jose, CA','hybrid','Senior','Full-time','$170k-$210k','Full-time','[\"Python\",\"Go\",\"PostgreSQL\"]','Design APIs and payment infrastructure for global scale.','open','R-123',12,2,0,'https://www.google.com/s2/favicons?domain=stripe.com&sz=128',NOW()),
('J-DEMO-002','Full Stack Engineer',NULL,'Databricks',NULL,'Mountain View, CA','hybrid','Mid','Full-time','$160k-$200k','Full-time','[\"React\",\"TypeScript\",\"Spark\"]','Ship features across web and data platform.','open','R-123',8,1,0,'https://www.google.com/s2/favicons?domain=databricks.com&sz=128',NOW()),
('J-DEMO-003','Distributed Systems Engineer',NULL,'Confluent',NULL,'San Jose, CA','remote','Senior','Full-time','$165k-$205k','Full-time','[\"Kafka\",\"Java\",\"Kubernetes\"]','Own streaming infrastructure and reliability.','open','R-123',20,3,1,'https://www.google.com/s2/favicons?domain=confluent.io&sz=128',NOW()),
('J-DEMO-004','ML Platform Engineer',NULL,'NVIDIA',NULL,'Santa Clara, CA','onsite','Senior','Full-time','$180k-$230k','Full-time','[\"Python\",\"CUDA\",\"PyTorch\"]','Build training and inference platforms.','open','R-123',15,4,0,'https://www.google.com/s2/favicons?domain=nvidia.com&sz=128',NOW()),
('J-DEMO-005','Site Reliability Engineer',NULL,'Netflix',NULL,'Los Gatos, CA','hybrid','Mid','Full-time','$155k-$195k','Full-time','[\"AWS\",\"Go\",\"Observability\"]','Keep critical services highly available.','open','R-123',9,0,0,'https://www.google.com/s2/favicons?domain=netflix.com&sz=128',NOW()),
('J-DEMO-006','Security Software Engineer',NULL,'Okta',NULL,'San Francisco, CA','hybrid','Senior','Full-time','$170k-$210k','Full-time','[\"Rust\",\"Identity\",\"Zero Trust\"]','Harden auth products and threat detection.','open','R-123',7,1,0,'https://www.google.com/s2/favicons?domain=okta.com&sz=128',NOW()),
('J-DEMO-007','Data Engineer',NULL,'Snowflake',NULL,'San Mateo, CA','remote','Mid','Full-time','$145k-$185k','Full-time','[\"SQL\",\"dbt\",\"Airflow\"]','Build pipelines for analytics and ML features.','open','R-123',11,2,0,'https://www.google.com/s2/favicons?domain=snowflake.com&sz=128',NOW()),
('J-DEMO-008','iOS Engineer',NULL,'Apple',NULL,'Cupertino, CA','onsite','Mid','Full-time','$160k-$200k','Full-time','[\"Swift\",\"UIKit\",\"Accessibility\"]','Craft consumer experiences for millions.','open','R-123',30,5,2,'https://www.google.com/s2/favicons?domain=apple.com&sz=128',NOW()),
('J-DEMO-009','Android Engineer',NULL,'Google',NULL,'Sunnyvale, CA','hybrid','Mid','Full-time','$155k-$195k','Full-time','[\"Kotlin\",\"Jetpack\",\"Compose\"]','Work on productivity and collaboration apps.','open','R-123',18,2,0,'https://www.google.com/s2/favicons?domain=google.com&sz=128',NOW()),
('J-DEMO-010','DevOps Engineer',NULL,'Adobe',NULL,'San Jose, CA','hybrid','Mid','Full-time','$140k-$175k','Full-time','[\"Terraform\",\"AWS\",\"CI/CD\"]','Automate delivery and improve developer velocity.','open','R-123',6,0,0,'https://www.google.com/s2/favicons?domain=adobe.com&sz=128',NOW()),
('J-DEMO-011','Frontend Engineer',NULL,'Figma',NULL,'San Francisco, CA','remote','Mid','Full-time','$150k-$190k','Full-time','[\"React\",\"WebGL\",\"Design systems\"]','Ship performant creative tools in the browser.','open','R-123',14,3,0,'https://www.google.com/s2/favicons?domain=figma.com&sz=128',NOW()),
('J-DEMO-012','Platform Engineer',NULL,'Uber',NULL,'San Francisco, CA','hybrid','Senior','Full-time','$165k-$205k','Full-time','[\"Go\",\"Microservices\",\"Maps\"]','Scale core dispatch and marketplace systems.','open','R-123',10,1,0,'https://www.google.com/s2/favicons?domain=uber.com&sz=128',NOW()),
('J-DEMO-013','Software Engineer — New Grad',NULL,'Cisco',NULL,'San Jose, CA','hybrid','Entry','Full-time','$120k-$145k','Full-time','[\"C++\",\"Networking\",\"Linux\"]','Rotational program across routing and security teams.','open','R-123',40,6,4,'https://www.google.com/s2/favicons?domain=cisco.com&sz=128',NOW()),
('J-DEMO-014','QA Automation Engineer',NULL,'ServiceNow',NULL,'Santa Clara, CA','remote','Mid','Full-time','$130k-$165k','Full-time','[\"Playwright\",\"Python\",\"API testing\"]','Build reliable test suites for enterprise workflows.','open','R-123',5,0,0,'https://www.google.com/s2/favicons?domain=servicenow.com&sz=128',NOW()),
('J-DEMO-015','Technical Program Manager',NULL,'LinkedIn',NULL,'Sunnyvale, CA','hybrid','Senior','Full-time','$165k-$200k','Full-time','[\"Roadmaps\",\"Kafka\",\"Stakeholder mgmt\"]','Drive cross-team delivery for feed and messaging.','open','R-123',22,2,1,'https://www.google.com/s2/favicons?domain=linkedin.com&sz=128',NOW())
ON DUPLICATE KEY UPDATE
  title = VALUES(title),
  company = VALUES(company),
  location = VALUES(location),
  status = 'open',
  description = VALUES(description),
  company_logo_url = VALUES(company_logo_url);
