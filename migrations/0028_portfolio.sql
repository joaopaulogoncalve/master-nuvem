-- Portfólio público do fotógrafo: página aberta no Google (masternuvem.com.br/f/<endereço do estúdio>)
-- com capa, sobre, galerias de trabalhos, contatos e botão "Pedir orçamento".
ALTER TABLE portais ADD COLUMN portfolio_ativo INTEGER NOT NULL DEFAULT 0;   -- 1 = página no ar
ALTER TABLE portais ADD COLUMN portfolio_titulo TEXT;                         -- frase de destaque (ex.: "Fotografia de casamento em Goiânia")
ALTER TABLE portais ADD COLUMN portfolio_capa_id INTEGER;                     -- files.id (uso 'portfolio'); sem capa = 1ª foto
ALTER TABLE portais ADD COLUMN whatsapp TEXT;                                 -- só números, com DDD
ALTER TABLE portais ADD COLUMN instagram TEXT;                                -- só o @, sem o @
ALTER TABLE portais ADD COLUMN cidade TEXT;

CREATE TABLE IF NOT EXISTS portfolio_galerias (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  portal_id INTEGER NOT NULL REFERENCES portais(id) ON DELETE CASCADE,
  titulo TEXT NOT NULL,
  ordem INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_portfolio_galerias_portal ON portfolio_galerias(portal_id);

-- Fotos do portfólio: arquivos com files.uso = 'portfolio' (versão leve de 2000 px feita no navegador; contam na cota).
CREATE TABLE IF NOT EXISTS portfolio_fotos (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  galeria_id INTEGER NOT NULL REFERENCES portfolio_galerias(id) ON DELETE CASCADE,
  file_id INTEGER NOT NULL UNIQUE,
  ordem INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_portfolio_fotos_galeria ON portfolio_fotos(galeria_id);

-- Pedidos de orçamento feitos na página pública (vão também por e-mail para o fotógrafo).
CREATE TABLE IF NOT EXISTS orcamentos (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  portal_id INTEGER NOT NULL REFERENCES portais(id) ON DELETE CASCADE,
  nome TEXT NOT NULL,
  email TEXT,
  whatsapp TEXT,
  tipo TEXT,
  quando TEXT,
  mensagem TEXT,
  status TEXT NOT NULL DEFAULT 'novo',      -- novo | respondido | arquivado
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_orcamentos_portal ON orcamentos(portal_id, status);
