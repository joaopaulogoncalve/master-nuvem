-- Sentinela: vigia que roda a cada 20 minutos e tranca contas com sinais de invasão.

-- Diário de segurança (guardado 90 dias). ip_hash = hash do IP do dia, nunca o IP puro.
-- tipo: login_ok | login_erro | 2fa_erro | senha_redefinida | download | portal_login_ok | portal_login_erro
CREATE TABLE IF NOT EXISTS seguranca_eventos (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  tipo TEXT NOT NULL,
  user_id INTEGER,
  cliente_id INTEGER,
  ip_hash TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_seg_eventos_data ON seguranca_eventos(created_at);
CREATE INDEX IF NOT EXISTS idx_seg_eventos_user ON seguranca_eventos(user_id, tipo, created_at);
CREATE INDEX IF NOT EXISTS idx_seg_eventos_cliente ON seguranca_eventos(cliente_id, tipo, created_at);

-- O que a sentinela encontrou. "chave" evita repetir o mesmo alerta (ex.: '2fa:5:2026-10-25').
CREATE TABLE IF NOT EXISTS sentinela_alertas (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  chave TEXT NOT NULL UNIQUE,
  nivel TEXT NOT NULL DEFAULT 'aviso',      -- 'aviso' | 'trancou'
  user_id INTEGER,
  cliente_id INTEGER,
  mensagem TEXT NOT NULL,
  visto INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_sentinela_alertas_data ON sentinela_alertas(created_at);

-- Conta trancada pela sentinela: não entra até criar uma senha nova pelo e-mail (ou o admin destravar).
ALTER TABLE users ADD COLUMN travada_em TEXT;
-- Cliente do fotógrafo trancado: volta quando o fotógrafo define uma senha nova (ou o admin destrava).
ALTER TABLE portal_clientes ADD COLUMN travada_em TEXT;
