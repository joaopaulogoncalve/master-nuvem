-- Migration number: 0007 	 Cupons de teste grátis (ex.: NUVEM1DIA = 20 MB por 24 horas)
-- Ao usar o cupom, a pessoa ganha um plano "active" com mp_payment_id = 'cupom:<CODIGO>'
-- (conta como plano manual: não entra na receita). Cada conta usa no máximo 1 cupom.

CREATE TABLE IF NOT EXISTS cupons (
  codigo TEXT PRIMARY KEY,                   -- sempre MAIÚSCULO, ex.: NUVEM1DIA
  quota_mb INTEGER NOT NULL,                 -- espaço do teste em MB
  horas INTEGER NOT NULL,                    -- duração do teste
  max_usos INTEGER,                          -- NULL = sem limite
  usos INTEGER NOT NULL DEFAULT 0,
  valido_ate TEXT,                           -- AAAA-MM-DD (último dia para usar); NULL = sem prazo
  ativo INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS cupom_usos (
  user_id INTEGER PRIMARY KEY,               -- 1 cupom por conta
  codigo TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY (user_id) REFERENCES users(id),
  FOREIGN KEY (codigo) REFERENCES cupons(codigo)
);
