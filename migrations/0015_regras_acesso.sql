-- Regras de acesso do álbum (o fotógrafo escolhe): prazo, limite de downloads por foto e o que o cliente pode fazer.
ALTER TABLE albuns ADD COLUMN acesso_ate TEXT;                          -- UTC; NULL = sem prazo
ALTER TABLE albuns ADD COLUMN max_downloads INTEGER;                    -- por foto; NULL = sem limite
ALTER TABLE albuns ADD COLUMN pode_baixar INTEGER NOT NULL DEFAULT 1;
ALTER TABLE albuns ADD COLUMN pode_escolher INTEGER NOT NULL DEFAULT 1;
ALTER TABLE albuns ADD COLUMN limite_escolha INTEGER;                   -- máx. de favoritas; NULL = sem limite
ALTER TABLE albuns ADD COLUMN pode_editar INTEGER NOT NULL DEFAULT 0;   -- cliente pode pedir edição por foto

-- Layout da área do cliente escolhido pelo fotógrafo: classico | escuro | minimalista | delicado.
ALTER TABLE portais ADD COLUMN tema TEXT NOT NULL DEFAULT 'classico';

-- Prévia leve das fotos do álbum (criada no navegador do fotógrafo ao enviar): o cliente vê a prévia, não o original.
-- files.previa_id (no original) aponta para a prévia; a prévia tem e_previa = 1 e não aparece nas listas.
ALTER TABLE files ADD COLUMN previa_id INTEGER;
ALTER TABLE files ADD COLUMN e_previa INTEGER NOT NULL DEFAULT 0;

-- Cada download do cliente (para o limite por foto).
CREATE TABLE IF NOT EXISTS album_downloads (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  album_id INTEGER NOT NULL,
  file_id INTEGER NOT NULL REFERENCES files(id) ON DELETE CASCADE,
  cliente_id INTEGER NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_album_downloads ON album_downloads(cliente_id, file_id);

-- Pedido de edição de uma foto, com o comentário do cliente.
CREATE TABLE IF NOT EXISTS pedidos_edicao (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  album_id INTEGER NOT NULL,
  file_id INTEGER NOT NULL REFERENCES files(id) ON DELETE CASCADE,
  cliente_id INTEGER NOT NULL,
  comentario TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'aberto',    -- aberto | feito
  feito_em TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_pedidos_edicao_album ON pedidos_edicao(album_id, status);
