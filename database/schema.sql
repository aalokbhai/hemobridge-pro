-- HemoBridge schema (MySQL 5.7+ / 8.x / MariaDB 10.3+)
-- Server start hote hi ye tables apne aap ban jaate hain (IF NOT EXISTS).
-- Purane database ke liye naye columns src/config/db.js ke migration me jode jaate hain.

CREATE TABLE IF NOT EXISTS donors (
  id               CHAR(8)       NOT NULL,
  name             VARCHAR(120)  NOT NULL,
  phone            VARCHAR(20)   NOT NULL,
  phone_digits     VARCHAR(20)   NOT NULL,
  email            VARCHAR(120)  NOT NULL DEFAULT '',
  city             VARCHAR(60)   NOT NULL,
  blood_group      VARCHAR(4)    NOT NULL,
  sex              VARCHAR(6)    NOT NULL DEFAULT '',
  dob              DATE          NULL,
  weight_kg        FLOAT         NULL,
  last_donation    DATE          NULL,
  hospital_consent TINYINT(1)    NOT NULL DEFAULT 0,
  consent_at       DATETIME      NULL,
  created_at       DATETIME      NOT NULL,
  PRIMARY KEY (id),
  UNIQUE KEY uq_donors_phone (phone_digits),
  KEY idx_donors_group (blood_group),
  KEY idx_donors_city (city)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS requests (
  id          CHAR(8)       NOT NULL,
  patient     VARCHAR(120)  NOT NULL,
  blood_group VARCHAR(4)    NOT NULL,
  component   VARCHAR(30)   NOT NULL DEFAULT 'Whole blood',
  units       TINYINT UNSIGNED NOT NULL DEFAULT 1,
  urgency     VARCHAR(40)   NOT NULL,
  hospital    VARCHAR(120)  NOT NULL,
  doctor      VARCHAR(120)  NOT NULL,
  phone       VARCHAR(20)   NOT NULL,
  city        VARCHAR(60)   NOT NULL DEFAULT '',
  status      ENUM('open','fulfilled','closed') NOT NULL DEFAULT 'open',
  matches     INT UNSIGNED  NOT NULL DEFAULT 0,
  hospital_id INT UNSIGNED  NULL,
  created_at  DATETIME      NOT NULL,
  PRIMARY KEY (id),
  KEY idx_requests_status (status),
  KEY idx_requests_created (created_at),
  KEY idx_requests_hospital (hospital_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS admins (
  id            INT UNSIGNED NOT NULL AUTO_INCREMENT,
  email         VARCHAR(120) NOT NULL,
  name          VARCHAR(80)  NOT NULL DEFAULT 'Admin',
  password_hash VARCHAR(255) NOT NULL,
  created_at    DATETIME     NOT NULL,
  PRIMARY KEY (id),
  UNIQUE KEY uq_admins_email (email)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS hospitals (
  id             INT UNSIGNED NOT NULL AUTO_INCREMENT,
  name           VARCHAR(160) NOT NULL,
  license_no     VARCHAR(60)  NOT NULL,
  contact_person VARCHAR(120) NOT NULL,
  email          VARCHAR(120) NOT NULL,
  password_hash  VARCHAR(255) NOT NULL,
  phone          VARCHAR(20)  NOT NULL,
  city           VARCHAR(60)  NOT NULL,
  address        VARCHAR(255) NOT NULL DEFAULT '',
  status         ENUM('pending','approved','rejected','suspended') NOT NULL DEFAULT 'pending',
  status_note    VARCHAR(255) NOT NULL DEFAULT '',
  created_at     DATETIME     NOT NULL,
  approved_at    DATETIME     NULL,
  PRIMARY KEY (id),
  UNIQUE KEY uq_hospitals_email (email),
  UNIQUE KEY uq_hospitals_license (license_no),
  KEY idx_hospitals_status (status)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS plans (
  id        INT UNSIGNED NOT NULL AUTO_INCREMENT,
  code      VARCHAR(20)  NOT NULL,
  name      VARCHAR(60)  NOT NULL,
  price_inr INT UNSIGNED NOT NULL,
  months    TINYINT UNSIGNED NOT NULL,
  active    TINYINT(1)   NOT NULL DEFAULT 1,
  PRIMARY KEY (id),
  UNIQUE KEY uq_plans_code (code)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS subscriptions (
  id          INT UNSIGNED NOT NULL AUTO_INCREMENT,
  hospital_id INT UNSIGNED NOT NULL,
  plan_id     INT UNSIGNED NOT NULL,
  status      ENUM('pending','active','rejected','cancelled') NOT NULL DEFAULT 'pending',
  starts_at   DATETIME NULL,
  ends_at     DATETIME NULL,
  created_at  DATETIME NOT NULL,
  PRIMARY KEY (id),
  KEY idx_subs_hospital (hospital_id, status),
  CONSTRAINT fk_subs_hospital FOREIGN KEY (hospital_id) REFERENCES hospitals (id),
  CONSTRAINT fk_subs_plan FOREIGN KEY (plan_id) REFERENCES plans (id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS payments (
  id               INT UNSIGNED NOT NULL AUTO_INCREMENT,
  hospital_id      INT UNSIGNED NOT NULL,
  subscription_id  INT UNSIGNED NOT NULL,
  amount_inr       INT UNSIGNED NOT NULL,
  method           VARCHAR(20)  NOT NULL DEFAULT 'manual',  -- manual | admin_grant | razorpay (baad me)
  reference        VARCHAR(80)  NOT NULL DEFAULT '',        -- UPI / bank transaction (UTR) number
  gateway_order_id VARCHAR(80)  NULL,                       -- Razorpay jodte waqt use hoga
  status           ENUM('submitted','confirmed','rejected') NOT NULL DEFAULT 'submitted',
  note             VARCHAR(255) NOT NULL DEFAULT '',
  created_at       DATETIME     NOT NULL,
  decided_at       DATETIME     NULL,
  decided_by       INT UNSIGNED NULL,
  PRIMARY KEY (id),
  KEY idx_pay_status (status),
  KEY idx_pay_hospital (hospital_id),
  CONSTRAINT fk_pay_hospital FOREIGN KEY (hospital_id) REFERENCES hospitals (id),
  CONSTRAINT fk_pay_sub FOREIGN KEY (subscription_id) REFERENCES subscriptions (id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS sessions (
  token_hash CHAR(64) NOT NULL,
  role       ENUM('admin','hospital') NOT NULL,
  user_id    INT UNSIGNED NOT NULL,
  expires_at DATETIME NOT NULL,
  PRIMARY KEY (token_hash),
  KEY idx_sessions_user (role, user_id),
  KEY idx_sessions_exp (expires_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS donor_access_log (
  id          BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  hospital_id INT UNSIGNED NOT NULL,
  donor_id    CHAR(8)      NOT NULL,
  action      VARCHAR(20)  NOT NULL DEFAULT 'contact',
  created_at  DATETIME     NOT NULL,
  PRIMARY KEY (id),
  KEY idx_access_hospital (hospital_id, created_at),
  KEY idx_access_created (created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
