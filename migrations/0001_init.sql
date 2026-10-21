-- Migration number: 0001 	 Esquema inicial do banco master-nuvem-db
-- Copiado do banco REAL de produção (sqlite_master) em 2026-10-21.
-- "IF NOT EXISTS" deixa seguro rodar de novo num banco que já tem as tabelas.

CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  email TEXT NOT NULL UNIQUE,
  name TEXT,
  password_hash TEXT NOT NULL,
  password_salt TEXT NOT NULL,
  role TEXT NOT NULL DEFAULT 'client',        -- 'client' | 'admin'
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  totp_secret TEXT,
  totp_enabled INTEGER NOT NULL DEFAULT 0,
  totp_last INTEGER NOT NULL DEFAULT 0       -- último passo TOTP usado (anti-replay)
);

CREATE TABLE IF NOT EXISTS sessions (
  token_hash TEXT PRIMARY KEY,               -- SHA-256 do token do cookie
  user_id INTEGER NOT NULL,
  expires_at TEXT NOT NULL,
  pending INTEGER NOT NULL DEFAULT 0,        -- 1 = aguardando código 2FA
  tentativas INTEGER NOT NULL DEFAULT 0,
  FOREIGN KEY (user_id) REFERENCES users(id)
);

CREATE TABLE IF NOT EXISTS subscriptions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL,
  quota_gb INTEGER NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending',    -- 'pending' | 'active'
  paid_until TEXT,
  mp_payment_id TEXT,                        -- id do pagamento no Mercado Pago
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY (user_id) REFERENCES users(id)
);

CREATE TABLE IF NOT EXISTS files (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL,
  object_key TEXT NOT NULL UNIQUE,           -- caminho no B2: u{userId}/{hex}
  name TEXT NOT NULL,
  size_bytes INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  status TEXT NOT NULL DEFAULT 'pending',    -- 'pending' | 'ready'
  FOREIGN KEY (user_id) REFERENCES users(id)
);
