-- MySQL dump 10.13  Distrib 8.0.46, for Linux (aarch64)
--
-- Host: localhost    Database: linkedin_db
-- ------------------------------------------------------
-- Server version	8.0.46

/*!40101 SET @OLD_CHARACTER_SET_CLIENT=@@CHARACTER_SET_CLIENT */;
/*!40101 SET @OLD_CHARACTER_SET_RESULTS=@@CHARACTER_SET_RESULTS */;
/*!40101 SET @OLD_COLLATION_CONNECTION=@@COLLATION_CONNECTION */;
/*!50503 SET NAMES utf8mb4 */;
/*!40103 SET @OLD_TIME_ZONE=@@TIME_ZONE */;
/*!40103 SET TIME_ZONE='+00:00' */;
/*!40014 SET @OLD_UNIQUE_CHECKS=@@UNIQUE_CHECKS, UNIQUE_CHECKS=0 */;
/*!40014 SET @OLD_FOREIGN_KEY_CHECKS=@@FOREIGN_KEY_CHECKS, FOREIGN_KEY_CHECKS=0 */;
/*!40101 SET @OLD_SQL_MODE=@@SQL_MODE, SQL_MODE='NO_AUTO_VALUE_ON_ZERO' */;
/*!40111 SET @OLD_SQL_NOTES=@@SQL_NOTES, SQL_NOTES=0 */;

--
-- Table structure for table `applications`
--

DROP TABLE IF EXISTS `applications`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `applications` (
  `app_id` varchar(50) COLLATE utf8mb4_unicode_ci NOT NULL,
  `job_id` varchar(50) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `member_id` varchar(50) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `status` varchar(50) COLLATE utf8mb4_unicode_ci DEFAULT 'submitted',
  `resume_url` text COLLATE utf8mb4_unicode_ci,
  `resume_text` text COLLATE utf8mb4_unicode_ci,
  `cover_letter` text COLLATE utf8mb4_unicode_ci,
  `answers` json DEFAULT NULL,
  `recruiter_note` text COLLATE utf8mb4_unicode_ci,
  `applied_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`app_id`),
  UNIQUE KEY `uk_job_member` (`job_id`,`member_id`),
  KEY `job_id` (`job_id`),
  KEY `member_id` (`member_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `applications`
--

LOCK TABLES `applications` WRITE;
/*!40000 ALTER TABLE `applications` DISABLE KEYS */;
INSERT INTO `applications` VALUES ('APP-2643bab9','J-382b2205','M-123','submitted',NULL,NULL,NULL,NULL,NULL,'2026-05-03 18:14:56');
/*!40000 ALTER TABLE `applications` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `auth_sessions`
--

DROP TABLE IF EXISTS `auth_sessions`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `auth_sessions` (
  `token` varchar(512) COLLATE utf8mb4_unicode_ci NOT NULL,
  `user_id` varchar(50) COLLATE utf8mb4_unicode_ci NOT NULL,
  `email` varchar(120) COLLATE utf8mb4_unicode_ci NOT NULL,
  `expires_at` datetime NOT NULL,
  `created_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`token`),
  KEY `user_id` (`user_id`),
  KEY `expires_at` (`expires_at`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `auth_sessions`
--

LOCK TABLES `auth_sessions` WRITE;
/*!40000 ALTER TABLE `auth_sessions` DISABLE KEYS */;
INSERT INTO `auth_sessions` VALUES ('eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJ1c2VyX2lkIjoiVS00MDg3ODE3ZCIsImVtYWlsIjoiZmFpcUB0ZXN0LmNvbSIsImlhdCI6MTc3NzgyNzk4OSwiZXhwIjoxNzc3OTE0Mzg5fQ.1GzdGyZFk2bgM607Qgsoud2flR__Fbj7W8V0soe7GBY','U-4087817d','faiq@test.com','2026-05-04 17:06:29','2026-05-03 17:06:29'),('eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJ1c2VyX2lkIjoiVS00NTU4MWY4ZiIsImVtYWlsIjoieWFzaC5zaGV2a2FyQHRlc3QuY29tIiwiaWF0IjoxNzc3ODI3OTg4LCJleHAiOjE3Nzc5MTQzODh9.i8BbfCyhGghA4GBmOS7qthHZDtnReK-cwXcdqbX17W8','U-45581f8f','yash.shevkar@test.com','2026-05-04 17:06:28','2026-05-03 17:06:28'),('eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJ1c2VyX2lkIjoiVS03ZmZkNzE5NCIsImVtYWlsIjoicmlzaGl0aGFAdGVzdC5jb20iLCJpYXQiOjE3Nzc4Mjc5ODgsImV4cCI6MTc3NzkxNDM4OH0.tBFUqs766b2x-9kt9J__DVR5ABhMYq09IMUSUaGqNZU','U-7ffd7194','rishitha@test.com','2026-05-04 17:06:28','2026-05-03 17:06:28'),('eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJ1c2VyX2lkIjoiVS0xN2EyODM0YiIsImVtYWlsIjoicHJha2hhckB0ZXN0LmNvbSIsImlhdCI6MTc3NzgyNzk4OCwiZXhwIjoxNzc3OTE0Mzg4fQ.eNUs7K4r0BEEshxAoVzbg8LTjfdWkk8kQI7ImaoNGhE','U-17a2834b','prakhar@test.com','2026-05-04 17:06:28','2026-05-03 17:06:28'),('eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJ1c2VyX2lkIjoiVS0yMWY0ZjJmZiIsImVtYWlsIjoic21va2VfdGVzdF91c2VyXzE3Nzc4MzIwOTVAdGVzdC5jb20iLCJpYXQiOjE3Nzc4MzIwOTUsImV4cCI6MTc3NzkxODQ5NX0.buA6wx-W2SEWXVMSljSohd7-Pe1ebfnb5B3oYuCCkIw','U-21f4f2ff','smoke_test_user_1777832095@test.com','2026-05-04 18:14:55','2026-05-03 18:14:55'),('eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJ1c2VyX2lkIjoiVS0yNTEyZTBkMSIsImVtYWlsIjoicHJhZ3lhQHRlc3QuY29tIiwiaWF0IjoxNzc3ODI3OTg4LCJleHAiOjE3Nzc5MTQzODh9.UaC7XCTADD05G-ADOIA9y9HV7VmwCErCTL1ms1Ww1k4','U-2512e0d1','pragya@test.com','2026-05-04 17:06:28','2026-05-03 17:06:28'),('eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJ1c2VyX2lkIjoiVS1iMTU0N2UwMSIsImVtYWlsIjoieWFzaGFzaHJlZUB0ZXN0LmNvbSIsImlhdCI6MTc3NzgyNzk4OCwiZXhwIjoxNzc3OTE0Mzg4fQ.PiayvLXr1U7UYj9WFHaCD7O0p1aSvs9-IGBIQhMcTds','U-b1547e01','yashashree@test.com','2026-05-04 17:06:28','2026-05-03 17:06:28'),('eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJ1c2VyX2lkIjoiVS1iMTU0N2UwMSIsImVtYWlsIjoieWFzaGFzaHJlZUB0ZXN0LmNvbSIsImlhdCI6MTc3NzgzMjg3MywiZXhwIjoxNzc3OTE5MjczfQ.mdOZUmq1YsGN71nIm0aP6k3oIDeM8G1XlGnCU7yQG-4','U-b1547e01','yashashree@test.com','2026-05-04 18:27:53','2026-05-03 18:27:53'),('eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJ1c2VyX2lkIjoiVS1mNGZiODNhYSIsImVtYWlsIjoic3Vwcml5YUB0ZXN0LmNvbSIsImlhdCI6MTc3NzgyNzk4OSwiZXhwIjoxNzc3OTE0Mzg5fQ.5H4dBEJZ_t4jjjFiTCOjS8EiyekBnoWiXulHVw1xErU','U-f4fb83aa','supriya@test.com','2026-05-04 17:06:29','2026-05-03 17:06:29');
/*!40000 ALTER TABLE `auth_sessions` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `auth_users`
--

DROP TABLE IF EXISTS `auth_users`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `auth_users` (
  `user_id` varchar(50) COLLATE utf8mb4_unicode_ci NOT NULL,
  `email` varchar(120) COLLATE utf8mb4_unicode_ci NOT NULL,
  `password_hash` varchar(256) COLLATE utf8mb4_unicode_ci NOT NULL,
  `password_salt` varchar(64) COLLATE utf8mb4_unicode_ci NOT NULL,
  `name` varchar(120) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `created_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`user_id`),
  UNIQUE KEY `email` (`email`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `auth_users`
--

LOCK TABLES `auth_users` WRITE;
/*!40000 ALTER TABLE `auth_users` DISABLE KEYS */;
INSERT INTO `auth_users` VALUES ('U-17a2834b','prakhar@test.com','c28586e1a240307764bc2bd67dc000fdae89039ac89625c5621437d606e8c3ffc058fa6df1252cf482be1b906eac2443fd8309e5b5e6d0fa26a6cece19600c43','c938683aabbfa7f00fb4d617a5a839e3','Prakhar Singh','2026-05-03 17:06:28'),('U-21f4f2ff','smoke_test_user_1777832095@test.com','2bd0d71ec9537f2b2868063c03f78ea16f6d2dcc30de094944baf1e5f46855635d813979bba4dabf2129d381c8fe0ad4fe79d36724e87951afde23ec7dc4abea','b85505c57f26512e3e5090283d856881',NULL,'2026-05-03 18:14:55'),('U-2512e0d1','pragya@test.com','6bf9cb73d1bbfc0a757729c5a1b78ef5ebeb65b58a12c2c2966574ec76b772c1ad6bfeb1d181d4c8d76f330e93007c7a37095b7791b8b049f346b1f55466736a','959fe9cd1e6cfda1279b990885ee508e','Pragya Priyadarshini','2026-05-03 17:06:28'),('U-4087817d','faiq@test.com','cd0c1fb85dc428a9c435e8344ce27f0531abc09b355b69060a16f4f202d6090933ac3a9f7371d8bf4d93b814d37635dc7ef944e7a3410649e9952b3c07f22108','82ff9ae50b271f5708b2054070dd1508','Muhammad Faiq Salman','2026-05-03 17:06:29'),('U-45581f8f','yash.shevkar@test.com','a592cf997cfc311a766551f7c1cdcf662321cb65cb4ee2073a577075cbe861412423f1cdae686cd6de844d3f8c5267a52e249d9d9c07fdf1ce1969cfdb295020','95b467825603414e4dda53462b036409','Yash Shevkar','2026-05-03 17:06:28'),('U-7ffd7194','rishitha@test.com','116421dd61c43b9c6d13e7a5fbcc08e1596208c02eff2d6b980849da0fd48ca7f929eed3e97dde091b261e70097ffcbdd606af8484b25daa1b05b826b452a2a9','c746d7c0276a200224c6b412b0a96e20','Rishitha Gogineni','2026-05-03 17:06:28'),('U-ADMIN01','admin@test.com','40bf741c3576c8d76a830fc401e5f6764a4fdbef284fa885f97671f1a24244872e15289561637efc64a0cee5666091791e3f2bfb338691a31bbd03a44266d82e','65b8e680d34e4bc98f84dcd4fba5de9c','Admin Test','2026-05-03 17:04:45'),('U-b1547e01','yashashree@test.com','4e32d34c5e271228f0eb98e74b524a847e01f647177aa050846119a1e3887f691329488ae498c3ea4a0533b4f51647e163746a6df52ee36cd3b63f5039661a57','31c5d7d85c46fe36b916fe40c821d502','Yashashree Shinde','2026-05-03 17:06:28'),('U-DUMMY01','dummy.user@gmail.com','b59b5adbb9077b542b492515fb560a66713499058f043fc5936c6e6a1b5ce70fc1cd0261aeae13067b49c8d6b8116decef75603e95d1040031bc1568ac45d0bd','f34e04f22fffdb95d09ef553a5813e20','Dummy User','2026-05-03 17:04:45'),('U-f4fb83aa','supriya@test.com','2f388d0b908f05c6a4218ae022a3340316bfb41c9ad9679d6cd2835fbafe3341da5706c6176e8c225fa4880cbc2372155e8e5fcb48dead2ed5853164fa38605a','f3b06fbd231d4d19b8e7a7c63d816d7c','Supriya Selvan','2026-05-03 17:06:29');
/*!40000 ALTER TABLE `auth_users` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `connection_requests`
--

DROP TABLE IF EXISTS `connection_requests`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `connection_requests` (
  `request_id` varchar(50) COLLATE utf8mb4_unicode_ci NOT NULL,
  `requester_id` varchar(50) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `receiver_id` varchar(50) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `status` varchar(20) COLLATE utf8mb4_unicode_ci DEFAULT 'pending',
  `created_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`request_id`),
  UNIQUE KEY `uk_pair` (`requester_id`,`receiver_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `connection_requests`
--

LOCK TABLES `connection_requests` WRITE;
/*!40000 ALTER TABLE `connection_requests` DISABLE KEYS */;
/*!40000 ALTER TABLE `connection_requests` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `connections`
--

DROP TABLE IF EXISTS `connections`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `connections` (
  `user_a` varchar(50) COLLATE utf8mb4_unicode_ci NOT NULL,
  `user_b` varchar(50) COLLATE utf8mb4_unicode_ci NOT NULL,
  `connected_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`user_a`,`user_b`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `connections`
--

LOCK TABLES `connections` WRITE;
/*!40000 ALTER TABLE `connections` DISABLE KEYS */;
INSERT INTO `connections` VALUES ('M-123','M-DEMO-01','2026-05-03 17:27:47'),('M-123','M-DEMO-02','2026-05-03 17:27:47'),('M-123','M-DEMO-03','2026-05-03 17:27:47');
/*!40000 ALTER TABLE `connections` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `jobs`
--

DROP TABLE IF EXISTS `jobs`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `jobs` (
  `job_id` varchar(50) COLLATE utf8mb4_unicode_ci NOT NULL,
  `title` varchar(255) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `company_id` varchar(50) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `company` varchar(255) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `industry` varchar(100) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `location` varchar(100) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `remote_mode` varchar(20) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `seniority_level` varchar(50) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `employment_type` varchar(50) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `salary` varchar(100) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `type` varchar(50) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `skills` json DEFAULT NULL,
  `description` text COLLATE utf8mb4_unicode_ci,
  `status` varchar(50) COLLATE utf8mb4_unicode_ci DEFAULT 'open',
  `recruiter_id` varchar(50) COLLATE utf8mb4_unicode_ci DEFAULT 'R-default',
  `views_count` int DEFAULT '0',
  `saves_count` int DEFAULT '0',
  `applicants_count` int DEFAULT '0',
  `created_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`job_id`),
  KEY `idx_jobs_status_created` (`status`,`created_at`),
  KEY `idx_jobs_recruiter_created` (`recruiter_id`,`created_at`),
  KEY `idx_jobs_company` (`company`),
  KEY `idx_jobs_location` (`location`),
  KEY `idx_jobs_type` (`type`),
  KEY `idx_jobs_employment_type` (`employment_type`),
  KEY `idx_jobs_industry` (`industry`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `jobs`
--

LOCK TABLES `jobs` WRITE;
/*!40000 ALTER TABLE `jobs` DISABLE KEYS */;
INSERT INTO `jobs` VALUES ('J-382b2205','Smoke Duplicate Apply Job',NULL,'Acme',NULL,'San Jose, CA',NULL,NULL,'Full-time','100k-120k','Full-time','[\"Node.js\"]','Smoke duplicate apply check','open','R-123',1,0,0,'2026-05-03 18:14:55'),('J-f73fe5e7','Smoke Closed Job',NULL,'Acme',NULL,'San Jose, CA',NULL,NULL,'Full-time','100k-120k','Full-time','[\"Node.js\"]','Smoke closed job check','closed','R-123',2,0,0,'2026-05-03 18:14:56');
/*!40000 ALTER TABLE `jobs` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `member_network_relations`
--

DROP TABLE IF EXISTS `member_network_relations`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `member_network_relations` (
  `member_id` varchar(50) COLLATE utf8mb4_unicode_ci NOT NULL,
  `entity_id` varchar(60) COLLATE utf8mb4_unicode_ci NOT NULL,
  `relation_status` varchar(20) COLLATE utf8mb4_unicode_ci DEFAULT 'active',
  `joined_at` datetime DEFAULT CURRENT_TIMESTAMP,
  `updated_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`member_id`,`entity_id`),
  KEY `idx_network_member_status` (`member_id`,`relation_status`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `member_network_relations`
--

LOCK TABLES `member_network_relations` WRITE;
/*!40000 ALTER TABLE `member_network_relations` DISABLE KEYS */;
/*!40000 ALTER TABLE `member_network_relations` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `member_settings`
--

DROP TABLE IF EXISTS `member_settings`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `member_settings` (
  `member_id` varchar(50) COLLATE utf8mb4_unicode_ci NOT NULL,
  `profile_visibility` tinyint(1) DEFAULT '1',
  `open_to_work` tinyint(1) DEFAULT '1',
  `allow_messages` tinyint(1) DEFAULT '1',
  `in_app_notifications_enabled` tinyint(1) DEFAULT '1',
  `preferred_language` varchar(30) COLLATE utf8mb4_unicode_ci DEFAULT 'English',
  `updated_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`member_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `member_settings`
--

LOCK TABLES `member_settings` WRITE;
/*!40000 ALTER TABLE `member_settings` DISABLE KEYS */;
INSERT INTO `member_settings` VALUES ('M-123',1,1,1,1,'English','2026-05-03 17:04:45'),('M-17a2834b',1,1,1,1,'English','2026-05-03 17:06:28'),('M-2512e0d1',1,1,1,1,'English','2026-05-03 17:06:29'),('M-4087817d',1,1,1,1,'English','2026-05-03 17:06:29'),('M-45581f8f',1,1,1,1,'English','2026-05-03 17:06:28'),('M-7ffd7194',1,1,1,1,'English','2026-05-03 17:06:28'),('M-b1547e01',1,1,1,1,'English','2026-05-03 17:06:28'),('M-f4fb83aa',1,1,1,1,'English','2026-05-03 17:06:29');
/*!40000 ALTER TABLE `member_settings` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `members`
--

DROP TABLE IF EXISTS `members`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `members` (
  `member_id` varchar(50) COLLATE utf8mb4_unicode_ci NOT NULL,
  `name` varchar(100) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `first_name` varchar(100) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `last_name` varchar(100) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `title` varchar(150) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `headline` varchar(150) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `location` varchar(100) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `city` varchar(100) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `state` varchar(100) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `country` varchar(100) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `email` varchar(100) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `phone` varchar(30) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `about` text COLLATE utf8mb4_unicode_ci,
  `summary` text COLLATE utf8mb4_unicode_ci,
  `skills` json DEFAULT NULL,
  `experience` json DEFAULT NULL,
  `education` json DEFAULT NULL,
  `profile_photo_url` longtext COLLATE utf8mb4_unicode_ci,
  `cover_photo_url` longtext COLLATE utf8mb4_unicode_ci,
  `cover_theme` varchar(30) COLLATE utf8mb4_unicode_ci DEFAULT 'blue',
  `resume_url` text COLLATE utf8mb4_unicode_ci,
  `resume_text` mediumtext COLLATE utf8mb4_unicode_ci,
  `connections_count` int DEFAULT '0',
  `profile_views` int DEFAULT '0',
  `status` varchar(20) COLLATE utf8mb4_unicode_ci DEFAULT 'active',
  `created_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`member_id`),
  UNIQUE KEY `uk_email` (`email`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `members`
--

LOCK TABLES `members` WRITE;
/*!40000 ALTER TABLE `members` DISABLE KEYS */;
INSERT INTO `members` VALUES ('M-123','Sneha Singh','Sneha','Singh','Full Stack AI Engineer | Specializing in Distributed Systems','Full Stack AI Engineer | Specializing in Distributed Systems','San Jose, California','San Jose','California','United States','admin@test.com',NULL,'Passionate software engineer focused on building scalable distributed systems and integrating Agentic AI workflows.','Passionate software engineer focused on building scalable distributed systems and integrating Agentic AI workflows.','[\"Distributed Systems\", \"React.js\", \"Kafka & APIs\", \"Node.js\", \"Python\", \"MySQL\"]','[{\"role\": \"Software Engineer Intern\", \"period\": \"May 2023 - Present\", \"company\": \"LinkedIn\", \"description\": \"Developed microservices using Node.js and Kafka with Redis-backed caching and event-driven workflows.\"}]','[{\"degree\": \"Master of Science - Computer Science\", \"period\": \"2022 - 2024\", \"school\": \"San Jose State University\"}]','https://api.dicebear.com/7.x/avataaars/svg?seed=sneha',NULL,'blue',NULL,NULL,0,0,'active','2026-05-03 17:04:45'),('M-17364672','Marcus Johnson','Marcus','Johnson','Product Manager @ Meta','Product Manager @ Meta','Menlo Park, CA',NULL,NULL,NULL,'marcus.johnson@test.com',NULL,'PM at Meta working on AI-powered feed ranking. Former startup founder. MBA from Wharton. Love building products people use every day.','PM at Meta working on AI-powered feed ranking. Former startup founder. MBA from Wharton. Love building products people use every day.','[]','[]','[]','https://api.dicebear.com/7.x/avataaars/svg?seed=marcus',NULL,'blue',NULL,NULL,0,0,'active','2026-05-03 17:32:39'),('M-17a2834b','Prakhar Singh','Prakhar','Singh','MS Applied Data Intelligence Student at San Jose State University','MS Applied Data Intelligence @ SJSU | Backend Engineer | Node.js â€¢ FastAPI â€¢ PostgreSQL','San Jose, California',NULL,NULL,NULL,'prakhar@test.com',NULL,'MS in Applied Data Intelligence student at San Jose State University. Backend engineer at heart with a love for high-performance APIs and distributed architectures. Skilled in Node.js, FastAPI, PostgreSQL, and microservices design patterns.',NULL,NULL,NULL,NULL,'https://api.dicebear.com/7.x/avataaars/svg?seed=prakhar',NULL,'blue',NULL,NULL,0,0,'active','2026-05-03 17:06:28'),('M-21087ee1','Elena Rodriguez','Elena','Rodriguez','Security Engineer @ Cloudflare','Security Engineer @ Cloudflare','Austin, TX',NULL,NULL,NULL,'elena.rodriguez@test.com',NULL,'Protecting the internet at Cloudflare. Zero-trust security architect. CISSP certified. Speaker at DEF CON.','Protecting the internet at Cloudflare. Zero-trust security architect. CISSP certified. Speaker at DEF CON.','[]','[]','[]','https://api.dicebear.com/7.x/avataaars/svg?seed=elena',NULL,'blue',NULL,NULL,0,0,'active','2026-05-03 17:32:40'),('M-2512e0d1','Pragya Priyadarshini','Pragya','Priyadarshini','MS Applied Data Intelligence Student at San Jose State University','MS Applied Data Intelligence @ SJSU | ML Engineer | NLP â€¢ PyTorch â€¢ HuggingFace â€¢ FastAPI','San Jose, California',NULL,NULL,NULL,'pragya@test.com',NULL,'MS in Applied Data Intelligence student at San Jose State University. ML engineer focused on NLP and generative AI. Building and deploying language models using PyTorch, HuggingFace, and FastAPI. Passionate about making AI accessible and production-ready.',NULL,NULL,NULL,NULL,'https://api.dicebear.com/7.x/avataaars/svg?seed=pragya',NULL,'blue',NULL,NULL,0,0,'active','2026-05-03 17:06:28'),('M-2b175237','David Kim','David','Kim','DevOps Engineer @ AWS','DevOps Engineer @ AWS','Seattle, WA',NULL,NULL,NULL,'david.kim@test.com',NULL,'Building cloud infrastructure at AWS. Kubernetes certified, Terraform expert. Speaker at KubeCon 2024.','Building cloud infrastructure at AWS. Kubernetes certified, Terraform expert. Speaker at KubeCon 2024.','[]','[]','[]','https://api.dicebear.com/7.x/avataaars/svg?seed=davidkim',NULL,'blue',NULL,NULL,0,0,'active','2026-05-03 17:32:39'),('M-2b57f825','Sophia Williams','Sophia','Williams','Frontend Engineer @ Airbnb','Frontend Engineer @ Airbnb','San Francisco, CA',NULL,NULL,NULL,'sophia.williams@test.com',NULL,'Crafting beautiful user experiences at Airbnb. React enthusiast, design systems advocate. Previously at Stripe.','Crafting beautiful user experiences at Airbnb. React enthusiast, design systems advocate. Previously at Stripe.','[]','[]','[]','https://api.dicebear.com/7.x/avataaars/svg?seed=sophia',NULL,'blue',NULL,NULL,0,0,'active','2026-05-03 17:32:39'),('M-4087817d','Muhammad Faiq Salman','Muhammad','Faiq Salman','MS Applied Data Intelligence Student at San Jose State University','MS Applied Data Intelligence @ SJSU | DevOps & MLOps Engineer | Docker â€¢ Kubernetes â€¢ Terraform â€¢ CI/CD','San Jose, California',NULL,NULL,NULL,'faiq@test.com',NULL,'MS in Applied Data Intelligence student at San Jose State University. DevOps and MLOps engineer passionate about automating infrastructure and streamlining model deployment. Experienced with Docker, Kubernetes, Terraform, and building CI/CD pipelines for ML workflows.',NULL,NULL,NULL,NULL,'https://api.dicebear.com/7.x/avataaars/svg?seed=faiq',NULL,'blue',NULL,NULL,0,0,'active','2026-05-03 17:06:29'),('M-45581f8f','Yash Shevkar','Yash','Shevkar','MS Applied Data Intelligence Student at San Jose State University','MS Applied Data Intelligence @ SJSU | Full Stack Engineer | React â€¢ Node.js â€¢ AWS â€¢ GCP','San Jose, California',NULL,NULL,NULL,'yash.shevkar@test.com',NULL,'MS in Applied Data Intelligence student at San Jose State University. Full stack engineer who loves building end-to-end applications. Comfortable with React, Node.js, Python, and cloud deployments on AWS and GCP.',NULL,NULL,NULL,NULL,'https://api.dicebear.com/7.x/avataaars/svg?seed=yashshevkar',NULL,'blue',NULL,NULL,0,0,'active','2026-05-03 17:06:28'),('M-5fa8ff09','James Park','James','Park','Fullstack Engineer @ Stripe','Fullstack Engineer @ Stripe','San Francisco, CA',NULL,NULL,NULL,'james.park@test.com',NULL,'Building payment infrastructure at Stripe. TypeScript, Node.js and React. Previously at Square and PayPal.','Building payment infrastructure at Stripe. TypeScript, Node.js and React. Previously at Square and PayPal.','[]','[]','[]','https://api.dicebear.com/7.x/avataaars/svg?seed=jamespark',NULL,'blue',NULL,NULL,0,0,'active','2026-05-03 17:32:39'),('M-688ebae2','Ryan Chen','Ryan','Chen','ML Engineer @ OpenAI','ML Engineer @ OpenAI','San Francisco, CA',NULL,NULL,NULL,'ryan.chen@test.com',NULL,'Working on large language models at OpenAI. Previously at DeepMind. PhD in Machine Learning from CMU.','Working on large language models at OpenAI. Previously at DeepMind. PhD in Machine Learning from CMU.','[]','[]','[]','https://api.dicebear.com/7.x/avataaars/svg?seed=ryanchen',NULL,'blue',NULL,NULL,0,0,'active','2026-05-03 17:32:39'),('M-7ffd7194','Rishitha Gogineni','Rishitha','Gogineni','MS Applied Data Intelligence Student at San Jose State University','MS Applied Data Intelligence @ SJSU | Data Scientist | ML â€¢ TensorFlow â€¢ Python â€¢ scikit-learn','San Jose, California',NULL,NULL,NULL,'rishitha@test.com',NULL,'MS in Applied Data Intelligence student at San Jose State University. Data scientist passionate about machine learning and predictive modeling. Experienced with TensorFlow, scikit-learn, and building ML pipelines for real-world applications.',NULL,NULL,NULL,NULL,'https://api.dicebear.com/7.x/avataaars/svg?seed=rishitha',NULL,'blue',NULL,NULL,0,0,'active','2026-05-03 17:06:28'),('M-8857852d','Fatima Al-Rashid','Fatima','Al-Rashid','Backend Engineer @ Uber','Backend Engineer @ Uber','San Francisco, CA',NULL,NULL,NULL,'fatima.rashid@test.com',NULL,'Distributed systems engineer at Uber\'s marketplace team. Go and Java expert. Passionate about system reliability.','Distributed systems engineer at Uber\'s marketplace team. Go and Java expert. Passionate about system reliability.','[]','[]','[]','https://api.dicebear.com/7.x/avataaars/svg?seed=fatima',NULL,'blue',NULL,NULL,0,0,'active','2026-05-03 17:32:39'),('M-9cf12144','Aisha Patel','Aisha','Patel','Senior Software Engineer @ Google','Senior Software Engineer @ Google','Mountain View, CA',NULL,NULL,NULL,'aisha.patel@test.com',NULL,'Building scalable distributed systems at Google. 7+ years in backend engineering. Passionate about open source and mentoring early-career engineers.','Building scalable distributed systems at Google. 7+ years in backend engineering. Passionate about open source and mentoring early-career engineers.','[]','[]','[]','https://api.dicebear.com/7.x/avataaars/svg?seed=aisha',NULL,'blue',NULL,NULL,0,0,'active','2026-05-03 17:32:39'),('M-a1b2c3d4','Alex Chen',NULL,NULL,'Senior Engineer at Acme','Senior Engineer at Acme','United States',NULL,NULL,NULL,'alex.demo.linkedin-sim@example.com',NULL,NULL,NULL,NULL,NULL,NULL,'https://api.dicebear.com/7.x/avataaars/svg?seed=alexchen',NULL,'blue',NULL,NULL,0,0,'active','2026-05-03 17:27:47'),('M-a3eaf9e2','Priya Nair','Priya','Nair','Data Scientist @ Netflix','Data Scientist @ Netflix','Los Gatos, CA',NULL,NULL,NULL,'priya.nair@test.com',NULL,'Data scientist specializing in recommendation systems and A/B testing at Netflix. MS in Statistics from Stanford.','Data scientist specializing in recommendation systems and A/B testing at Netflix. MS in Statistics from Stanford.','[]','[]','[]','https://api.dicebear.com/7.x/avataaars/svg?seed=priyanair',NULL,'blue',NULL,NULL,0,0,'active','2026-05-03 17:32:39'),('M-afc0918c','Noah Thompson','Noah','Thompson','iOS Engineer @ Apple','iOS Engineer @ Apple','Cupertino, CA',NULL,NULL,NULL,'noah.thompson@test.com',NULL,'Building iOS features used by billions at Apple. Swift expert. Previously shipped apps with 10M+ downloads.','Building iOS features used by billions at Apple. Swift expert. Previously shipped apps with 10M+ downloads.','[]','[]','[]','https://api.dicebear.com/7.x/avataaars/svg?seed=noah',NULL,'blue',NULL,NULL,0,0,'active','2026-05-03 17:32:40'),('M-b1547e01','Yashashree Shinde','Yashashree','Shinde','MS Applied Data Intelligence @ SJSU | Data Engineer | Kafka |Spark | Python| Airflow','MS Applied Data Intelligence @ SJSU | Data Engineer | Kafka |Spark | Python| Airflow','San Jose, California',NULL,NULL,NULL,'yashashree@test.com',NULL,'MS in Applied Data Intelligence student at San Jose State University. Passionate about data engineering and building real-time pipelines. Experienced with Apache Kafka, Apache Spark, and Python. Love working on distributed systems and turning raw data into actionable insights.','MS in Applied Data Intelligence student at San Jose State University. Passionate about data engineering and building real-time pipelines. Experienced with Apache Kafka, Apache Spark, and Python. Love working on distributed systems and turning raw data into actionable insights.',NULL,NULL,NULL,'https://api.dicebear.com/7.x/avataaars/svg?seed=yashashree',NULL,'blue',NULL,NULL,0,0,'active','2026-05-03 17:06:28'),('M-e5f6g7h8','Priya Kapoor',NULL,NULL,'Recruiter at Nova Labs','Recruiter at Nova Labs','United States',NULL,NULL,NULL,'priya.demo.linkedin-sim@example.com',NULL,NULL,NULL,NULL,NULL,NULL,'https://api.dicebear.com/7.x/avataaars/svg?seed=priyakapoor',NULL,'blue',NULL,NULL,0,0,'active','2026-05-03 17:27:47'),('M-f4fb83aa','Supriya Selvan','Supriya','Selvan','MS Applied Data Intelligence Student at San Jose State University','MS Applied Data Intelligence @ SJSU | Software Engineer | Java â€¢ Python â€¢ System Design â€¢ Spring Boot','San Jose, California',NULL,NULL,NULL,'supriya@test.com',NULL,'MS in Applied Data Intelligence student at San Jose State University. Software engineer with strong foundations in algorithms and system design. Experienced with Java, Python, and building scalable distributed systems. Passionate about clean code and software craftsmanship.',NULL,NULL,NULL,NULL,'https://api.dicebear.com/7.x/avataaars/svg?seed=supriya',NULL,'blue',NULL,NULL,0,0,'active','2026-05-03 17:06:29'),('M-i9j0k1l2','Jordan Lee',NULL,NULL,'Staff Engineer · Platform','Staff Engineer · Platform','United States',NULL,NULL,NULL,'jordan.demo.linkedin-sim@example.com',NULL,NULL,NULL,NULL,NULL,NULL,'https://api.dicebear.com/7.x/avataaars/svg?seed=jordan',NULL,'blue',NULL,NULL,0,0,'active','2026-05-03 17:27:47');
/*!40000 ALTER TABLE `members` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `message_threads`
--

DROP TABLE IF EXISTS `message_threads`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `message_threads` (
  `thread_id` varchar(50) COLLATE utf8mb4_unicode_ci NOT NULL,
  `participant_a` varchar(50) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `participant_b` varchar(50) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `last_activity` timestamp NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`thread_id`),
  KEY `idx_participant` (`participant_a`,`participant_b`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `message_threads`
--

LOCK TABLES `message_threads` WRITE;
/*!40000 ALTER TABLE `message_threads` DISABLE KEYS */;
INSERT INTO `message_threads` VALUES ('T-4dfc63c4','M-123','M-DEMO-01','2026-05-03 18:14:57');
/*!40000 ALTER TABLE `message_threads` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `network_entities`
--

DROP TABLE IF EXISTS `network_entities`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `network_entities` (
  `entity_id` varchar(60) COLLATE utf8mb4_unicode_ci NOT NULL,
  `entity_type` varchar(30) COLLATE utf8mb4_unicode_ci NOT NULL,
  `title` varchar(160) COLLATE utf8mb4_unicode_ci NOT NULL,
  `subtitle` varchar(160) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `description` text COLLATE utf8mb4_unicode_ci,
  `route_path` varchar(255) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `cta_label` varchar(40) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `badge` varchar(80) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `members_count` int DEFAULT '0',
  `sort_order` int DEFAULT '0',
  `created_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`entity_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `network_entities`
--

LOCK TABLES `network_entities` WRITE;
/*!40000 ALTER TABLE `network_entities` DISABLE KEYS */;
INSERT INTO `network_entities` VALUES ('NE-EVENT-FAIR','events','Backend Hiring Fair','Sat 10:00 AM','Meet recruiting teams and discover open backend and platform roles.','/jobs','Attend','Career event',319,60,'2026-05-03 18:25:20'),('NE-EVENT-KAFKA','events','Kafka Best Practices Webinar','Thu 7:00 PM','A live session on stream design, topic naming, and scaling consumers.','/network/events','Attend','Online event',207,50,'2026-05-03 18:25:20'),('NE-FOLLOW-CLOUD','following','Cloud Native Weekly','Topic & creator feed','Follow cloud-native updates, container trends, and platform engineering stories.','/network/newsletters','Follow','Weekly updates',1510,90,'2026-05-03 18:25:20'),('NE-GROUP-DATA','groups','Data Engineering Circle','Professional group','Warehouse design, streaming pipelines, and analytics engineering conversations.','/network','Join','4 upcoming events',488,40,'2026-05-03 18:25:20'),('NE-GROUP-DIST','groups','Distributed Systems Group','Professional group','Architecture reviews, scalability discussions, and weekly system design prompts.','/network','Join','12 new posts this week',642,30,'2026-05-03 18:25:20'),('NE-NEWS-CAREER','newsletters','Career Growth Notes','Newsletter','Hiring trends, networking tips, and interview prep guidance each week.','/profile/activity','Subscribe','Weekly edition',874,80,'2026-05-03 18:25:20'),('NE-NEWS-SDW','newsletters','System Design Weekly','Newsletter','A weekly digest of architecture case studies and system design patterns.','/profile/activity','Subscribe','New issue today',1294,70,'2026-05-03 18:25:20'),('NE-PAGE-ACME','pages','Acme Engineering','Company page','Product updates, hiring announcements, and engineering articles from Acme.','/company/acme','Follow','Hiring now',1842,10,'2026-05-03 18:25:20'),('NE-PAGE-NOVA','pages','Nova Labs Careers','Company page','Follow recruiting updates and featured openings from Nova Labs.','/jobs','Follow','Featured jobs',931,20,'2026-05-03 18:25:20');
/*!40000 ALTER TABLE `network_entities` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `notifications`
--

DROP TABLE IF EXISTS `notifications`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `notifications` (
  `notification_id` varchar(50) COLLATE utf8mb4_unicode_ci NOT NULL,
  `member_id` varchar(50) COLLATE utf8mb4_unicode_ci NOT NULL,
  `source_key` varchar(120) COLLATE utf8mb4_unicode_ci NOT NULL,
  `category` varchar(20) COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'mentions',
  `title` varchar(160) COLLATE utf8mb4_unicode_ci NOT NULL,
  `body` text COLLATE utf8mb4_unicode_ci NOT NULL,
  `route_path` varchar(255) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `is_read` tinyint(1) DEFAULT '0',
  `priority` int DEFAULT '0',
  `created_at` datetime DEFAULT CURRENT_TIMESTAMP,
  `updated_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`notification_id`),
  UNIQUE KEY `uk_member_source` (`member_id`,`source_key`),
  KEY `idx_notifications_member` (`member_id`,`is_read`,`created_at`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `notifications`
--

LOCK TABLES `notifications` WRITE;
/*!40000 ALTER TABLE `notifications` DISABLE KEYS */;
/*!40000 ALTER TABLE `notifications` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `post_comments`
--

DROP TABLE IF EXISTS `post_comments`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `post_comments` (
  `comment_id` varchar(50) COLLATE utf8mb4_unicode_ci NOT NULL,
  `post_id` varchar(50) COLLATE utf8mb4_unicode_ci NOT NULL,
  `member_id` varchar(50) COLLATE utf8mb4_unicode_ci NOT NULL,
  `author_name` varchar(255) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `body` text COLLATE utf8mb4_unicode_ci NOT NULL,
  `created_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`comment_id`),
  KEY `idx_comments_post` (`post_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `post_comments`
--

LOCK TABLES `post_comments` WRITE;
/*!40000 ALTER TABLE `post_comments` DISABLE KEYS */;
INSERT INTO `post_comments` VALUES ('C-d2ad1dff','P-fc2ca385','M-123','Smoke','smoke comment','2026-05-03 18:14:57');
/*!40000 ALTER TABLE `post_comments` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `post_likes`
--

DROP TABLE IF EXISTS `post_likes`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `post_likes` (
  `post_id` varchar(50) COLLATE utf8mb4_unicode_ci NOT NULL,
  `member_id` varchar(50) COLLATE utf8mb4_unicode_ci NOT NULL,
  `created_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`post_id`,`member_id`),
  KEY `idx_likes_member` (`member_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `post_likes`
--

LOCK TABLES `post_likes` WRITE;
/*!40000 ALTER TABLE `post_likes` DISABLE KEYS */;
/*!40000 ALTER TABLE `post_likes` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `post_reposts`
--

DROP TABLE IF EXISTS `post_reposts`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `post_reposts` (
  `post_id` varchar(50) COLLATE utf8mb4_unicode_ci NOT NULL,
  `member_id` varchar(50) COLLATE utf8mb4_unicode_ci NOT NULL,
  `created_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`post_id`,`member_id`),
  KEY `idx_reposts_member` (`member_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `post_reposts`
--

LOCK TABLES `post_reposts` WRITE;
/*!40000 ALTER TABLE `post_reposts` DISABLE KEYS */;
/*!40000 ALTER TABLE `post_reposts` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `post_sends`
--

DROP TABLE IF EXISTS `post_sends`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `post_sends` (
  `send_id` varchar(50) COLLATE utf8mb4_unicode_ci NOT NULL,
  `post_id` varchar(50) COLLATE utf8mb4_unicode_ci NOT NULL,
  `member_id` varchar(50) COLLATE utf8mb4_unicode_ci NOT NULL,
  `created_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`send_id`),
  KEY `idx_sends_post` (`post_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `post_sends`
--

LOCK TABLES `post_sends` WRITE;
/*!40000 ALTER TABLE `post_sends` DISABLE KEYS */;
INSERT INTO `post_sends` VALUES ('SEND-b8db923e','P-fc2ca385','M-123','2026-05-03 18:14:57');
/*!40000 ALTER TABLE `post_sends` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `posts`
--

DROP TABLE IF EXISTS `posts`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `posts` (
  `post_id` varchar(50) COLLATE utf8mb4_unicode_ci NOT NULL,
  `member_id` varchar(50) COLLATE utf8mb4_unicode_ci NOT NULL,
  `author_name` varchar(255) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `author_headline` varchar(255) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `body` text COLLATE utf8mb4_unicode_ci NOT NULL,
  `image_data` longtext COLLATE utf8mb4_unicode_ci,
  `created_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP,
  `quoted_post_id` varchar(50) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  PRIMARY KEY (`post_id`),
  KEY `idx_posts_member` (`member_id`),
  KEY `idx_posts_created` (`created_at`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `posts`
--

LOCK TABLES `posts` WRITE;
/*!40000 ALTER TABLE `posts` DISABLE KEYS */;
INSERT INTO `posts` VALUES ('P-0515c896','M-8857852d','Fatima Al-Rashid',NULL,'Distributed tracing saved us last week. What looked like a database issue was actually a cascade failure starting from a third-party API. Observability is not optional! #uber #distributedsystems #observability','https://images.unsplash.com/photo-1558494949-ef010cbdcc31?w=800&q=80','2026-05-03 17:35:18',NULL),('P-16160d4e','M-a3eaf9e2','Priya Nair',NULL,'Running 200+ A/B tests simultaneously at Netflix taught me more about statistics than my entire grad school career. Always be testing! #netflix #datascience #abtesting','https://images.unsplash.com/photo-1551288049-bebda4e38f71?w=800&q=80','2026-05-03 17:35:18',NULL),('P-1b9dcf0f','M-688ebae2','Ryan Chen',NULL,'GPT-4 fine-tuning results are in — domain-specific fine-tuning beats general prompting by 34% on our benchmarks. The devil is in the training data quality. #openai #llm #machinelearning','https://images.unsplash.com/photo-1677442135703-1787eea5ce01?w=800&q=80','2026-05-03 17:35:18',NULL),('P-208d9cee','M-2b175237','David Kim',NULL,'Just open-sourced our Terraform modules for multi-region AWS deployments. 3000+ lines of battle-tested infrastructure code. Link in bio! #terraform #aws #devops #opensource','https://images.unsplash.com/photo-1607799279861-4dd421887fb3?w=800&q=80','2026-05-03 17:35:18',NULL),('P-2a1bca40','M-123','Sneha Singh',NULL,'Test post from Sneha!','https://images.unsplash.com/photo-1504384308090-c894fdcc538d?w=800&q=80','2026-05-03 17:34:18',NULL),('P-324f8114','M-21087ee1','Elena Rodriguez',NULL,'Zero-trust is not a product you buy, it\'s an architecture you build. Most vendors are selling you compliance theater. #security #zerotrust #cloudflare','https://images.unsplash.com/photo-1510511459019-5dda7724fd87?w=800&q=80','2026-05-03 17:35:19',NULL),('P-3719b6f4','M-a1b2c3d4','Alex Chen',NULL,'Shipped a new feature today that lets recruiters shortlist candidates using AI. The system uses embeddings to match job requirements with candidate profiles. Really proud of what the team built! #AI #recruiting #engineering','https://images.unsplash.com/photo-1522071820081-009f0129c71c?w=800&q=80','2026-05-03 17:35:17',NULL),('P-3e692574','M-9cf12144','Aisha Patel',NULL,'Scaling our gRPC services to handle 1M RPS was one of the hardest engineering challenges I\'ve faced. Key learnings: connection pooling, load balancing, and circuit breakers. #google #engineering #scalability','https://images.unsplash.com/photo-1620712943543-bcc4688e7485?w=800&q=80','2026-05-03 17:35:18',NULL),('P-405e0815','M-2512e0d1','Pragya Priyadarshini',NULL,'Just deployed my first ML model to production! It predicts customer churn with 89% accuracy. The journey from Jupyter notebook to production was quite the adventure. #machinelearning #mlops #python','https://images.unsplash.com/photo-1555949963-ff9fe0c870eb?w=800&q=80','2026-05-03 17:35:17',NULL),('P-55503702','M-17364672','Marcus Johnson',NULL,'AI is changing how we think about product management. The best PMs of the future will understand both user psychology and AI capabilities. Exciting times! #productmanagement #AI #future','https://images.unsplash.com/photo-1531482615713-2afd69097998?w=800&q=80','2026-05-03 17:35:18',NULL),('P-601f960a','M-4087817d','Muhammad Faiq Salman',NULL,'Kubernetes tip: always set resource limits on your pods. We had a memory leak that took down an entire node because we didn\'t. Lesson learned the hard way! #kubernetes #devops #cloudnative','https://images.unsplash.com/photo-1485827404703-89b55fcc595e?w=800&q=80','2026-05-03 17:35:18',NULL),('P-65a07962','M-45581f8f','Yash Shevkar',NULL,'React Server Components are a game changer for performance. Moved our dashboard from CSR to RSC and saw a 60% improvement in LCP. #react #webdev #performance','https://images.unsplash.com/photo-1571171637578-41bc2dd41cd2?w=800&q=80','2026-05-03 17:35:17',NULL),('P-65df2aea','M-a1b2c3d4','Alex Chen',NULL,'Hot take: microservices are not always the answer. Sometimes a well-structured monolith is the better choice. Context matters. What do you think? #softwarearchitecture #engineering','https://images.unsplash.com/photo-1522071820081-009f0129c71c?w=800&q=80','2026-05-03 17:35:17',NULL),('P-66cca5ac','M-5fa8ff09','James Park',NULL,'Payment systems taught me: never trust the client, always idempotent operations, and double-entry bookkeeping is genius. #stripe #payments #engineering','https://images.unsplash.com/photo-1556742049-0cfed4f6a45d?w=800&q=80','2026-05-03 17:35:19',NULL),('P-6ce5a7c6','M-2b57f825','Sophia Williams',NULL,'Design systems are worth the investment. We spent 6 months building ours at Airbnb and it\'s now saving us 2+ hours per feature. Compounding returns! #designsystems #frontend #react','https://images.unsplash.com/photo-1504868584819-f8e8b4b6d7e3?w=800&q=80','2026-05-03 17:35:18',NULL),('P-79ee6d0b','M-17a2834b','Prakhar Singh',NULL,'Just completed my AWS Solutions Architect certification! Took 3 months of prep but totally worth it. Key resources: AWS docs, A Cloud Guru, and lots of hands-on practice. #aws #certification #cloudcomputing','https://images.unsplash.com/photo-1563986768609-322da13575f3?w=800&q=80','2026-05-03 17:35:17',NULL),('P-923f2f53','M-123','Sneha Singh',NULL,'Just finished reading \'Designing Data-Intensive Applications\' for the second time. Still finding new insights every read. Highly recommend for anyone building scalable backend systems. #books #engineering #architecture','https://images.unsplash.com/photo-1504384308090-c894fdcc538d?w=800&q=80','2026-05-03 17:35:17',NULL),('P-934d758b','M-123','Sneha Singh',NULL,'Excited to share that our team just shipped a major Kafka optimization that reduced end-to-end latency by 40%! The key was tuning the consumer group rebalancing strategy. Happy to share details if anyone is interested. #distributedsystems #kafka #engineering','https://images.unsplash.com/photo-1504384308090-c894fdcc538d?w=800&q=80','2026-05-03 17:35:16',NULL),('P-b92fc93d','M-f4fb83aa','Supriya Selvan',NULL,'Women in Tech meetup was amazing last night! So inspiring to see so many talented engineers sharing their stories. We need more events like this. #womenintech #diversity #engineering','https://images.unsplash.com/photo-1460925895917-afdab827c52f?w=800&q=80','2026-05-03 17:35:18',NULL),('P-b9f9962b','M-e5f6g7h8','Priya Kapoor',NULL,'Hiring! We\'re looking for senior engineers. Great culture, competitive salary, remote-friendly. DM me if interested or tag someone who\'d be a great fit! #hiring #jobs #engineering',NULL,'2026-05-03 17:35:17',NULL),('P-c7dab77c','M-b1547e01','Yashashree Shinde',NULL,'Built a real-time data pipeline today using Kafka + Spark Streaming. The hardest part was handling late-arriving events. Solved it with watermarking. #dataengineering #kafka #spark','https://images.unsplash.com/photo-1573164713988-8665fc963095?w=800&q=80','2026-05-03 17:35:17',NULL),('P-cf7b598f','M-afc0918c','Noah Thompson',NULL,'SwiftUI in 2024 is genuinely production-ready. We rebuilt our entire onboarding flow and reduced code by 60% while improving performance. #apple #ios #swift','https://images.unsplash.com/photo-1550751827-4bd374c3f58b?w=800&q=80','2026-05-03 17:35:19',NULL),('P-f887d0da','M-7ffd7194','Rishitha Gogineni',NULL,'Interesting finding from our A/B test: personalized recommendations increased click-through rate by 23% vs generic ones. The power of data! #datascience #machinelearning #analytics','https://images.unsplash.com/photo-1516321318423-f06f85e504b3?w=800&q=80','2026-05-03 17:35:17',NULL),('P-fc2ca385','M-123','Smoke',NULL,'smoke post 1777832096',NULL,'2026-05-03 18:14:56',NULL),('P-SEED-ALEX','M-DEMO-01','Alex Chen','Senior Engineer at Acme','Shipped a Kafka retry strategy that cut duplicate writes by 92%. Sharing a quick architecture sketch soon.','https://images.unsplash.com/photo-1518773553398-650c184e0bb3?auto=format&fit=crop&w=1200&q=80','2026-05-03 17:32:40',NULL),('P-SEED-JORDAN','M-DEMO-03','Jordan Lee','Staff Engineer · Platform','Tip: idempotent consumers + dead-letter topics saved us more than “retry three times” ever could. Happy to share our runbook.','https://images.unsplash.com/photo-1555066931-4365d14bab8c?auto=format&fit=crop&w=1200&q=80','2026-05-03 17:32:40',NULL),('P-SEED-MARIA','M-DEMO-04','Maria Santos','Product Design Lead','We’re polishing the job application flow—faster uploads, clearer status, fewer dead ends. Feedback welcome from hiring managers.',NULL,'2026-05-03 17:32:40',NULL),('P-SEED-PRIYA','M-DEMO-02','Priya Kapoor','Recruiter at Nova Labs','Hiring for distributed systems and backend interns. Strong fundamentals in data pipelines are a plus.',NULL,'2026-05-03 17:32:40',NULL),('P-SEED-RAHUL','M-DEMO-05','Rahul Verma','Data Infra @ Northwind','Interesting read on stream-table duality this week. If you’re modeling events in MySQL + Kafka, worth a skim before your next schema change.','https://images.unsplash.com/photo-1544383835-bda2bc66a55d?auto=format&fit=crop&w=1200&q=80','2026-05-03 17:32:40',NULL);
/*!40000 ALTER TABLE `posts` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `premium_memberships`
--

DROP TABLE IF EXISTS `premium_memberships`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `premium_memberships` (
  `member_id` varchar(50) COLLATE utf8mb4_unicode_ci NOT NULL,
  `plan_name` varchar(50) COLLATE utf8mb4_unicode_ci DEFAULT 'Career',
  `status` varchar(20) COLLATE utf8mb4_unicode_ci DEFAULT 'inactive',
  `started_at` datetime DEFAULT NULL,
  `expires_at` datetime DEFAULT NULL,
  `updated_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`member_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `premium_memberships`
--

LOCK TABLES `premium_memberships` WRITE;
/*!40000 ALTER TABLE `premium_memberships` DISABLE KEYS */;
/*!40000 ALTER TABLE `premium_memberships` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `recruiters`
--

DROP TABLE IF EXISTS `recruiters`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `recruiters` (
  `recruiter_id` varchar(50) COLLATE utf8mb4_unicode_ci NOT NULL,
  `company_id` varchar(50) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `name` varchar(100) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `email` varchar(100) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `phone` varchar(30) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `company_name` varchar(150) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `company_industry` varchar(100) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `company_size` varchar(50) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `access_level` varchar(50) COLLATE utf8mb4_unicode_ci DEFAULT 'admin',
  `status` varchar(20) COLLATE utf8mb4_unicode_ci DEFAULT 'active',
  `created_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`recruiter_id`),
  UNIQUE KEY `uk_recruiter_email` (`email`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `recruiters`
--

LOCK TABLES `recruiters` WRITE;
/*!40000 ALTER TABLE `recruiters` DISABLE KEYS */;
/*!40000 ALTER TABLE `recruiters` ENABLE KEYS */;
UNLOCK TABLES;
/*!40103 SET TIME_ZONE=@OLD_TIME_ZONE */;

/*!40101 SET SQL_MODE=@OLD_SQL_MODE */;
/*!40014 SET FOREIGN_KEY_CHECKS=@OLD_FOREIGN_KEY_CHECKS */;
/*!40014 SET UNIQUE_CHECKS=@OLD_UNIQUE_CHECKS */;
/*!40101 SET CHARACTER_SET_CLIENT=@OLD_CHARACTER_SET_CLIENT */;
/*!40101 SET CHARACTER_SET_RESULTS=@OLD_CHARACTER_SET_RESULTS */;
/*!40101 SET COLLATION_CONNECTION=@OLD_COLLATION_CONNECTION */;
/*!40111 SET SQL_NOTES=@OLD_SQL_NOTES */;

-- Dump completed on 2026-05-03 18:57:44
