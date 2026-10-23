-- Migration number: 0002 	 Pedidos de "Esqueci minha senha"
-- Cada pedido guarda só o HASH do token enviado por e-mail; vale 30 minutos e uma única vez.

CREATE TABLE IF NOT EXISTS password_resets (
  token_hash TEXT PRIMARY KEY,               -- SHA-256 do token do link
  user_id INTEGER NOT NULL,
  expires_at TEXT NOT NULL,
  used INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY (user_id) REFERENCES users(id)
);

CREATE INDEX IF NOT EXISTS idx_password_resets_user ON password_resets(user_id, created_at);
