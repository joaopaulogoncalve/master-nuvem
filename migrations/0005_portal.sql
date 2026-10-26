-- Migration number: 0005 	 Portal do Cliente (v1: fotografia e vídeo)
-- O assinante (users) tem um portal; cria clientes finais com login próprio; cada álbum é de um cliente.
-- As fotos são linhas normais de "files" (gastam a cota do assinante) com album_id preenchido.

CREATE TABLE IF NOT EXISTS portais (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL UNIQUE,           -- dono (assinante da Master Nuvem)
  slug TEXT NOT NULL UNIQUE,                 -- endereço: masternuvem.com.br/p/<slug>
  nome TEXT NOT NULL,                        -- nome do estúdio que o cliente vê
  cor TEXT NOT NULL DEFAULT '#be185d',       -- cor da marca (#rrggbb)
  ramo TEXT NOT NULL DEFAULT 'foto',
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY (user_id) REFERENCES users(id)
);

CREATE TABLE IF NOT EXISTS portal_clientes (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  portal_id INTEGER NOT NULL,
  nome TEXT NOT NULL,
  email TEXT NOT NULL,
  password_hash TEXT NOT NULL,
  password_salt TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE (portal_id, email),
  FOREIGN KEY (portal_id) REFERENCES portais(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS albuns (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  portal_id INTEGER NOT NULL,
  cliente_id INTEGER NOT NULL,
  titulo TEXT NOT NULL,
  tipo TEXT,                                 -- subnicho: Casamento, 15 anos, Newborn...
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY (portal_id) REFERENCES portais(id) ON DELETE CASCADE,
  FOREIGN KEY (cliente_id) REFERENCES portal_clientes(id)
);
CREATE INDEX IF NOT EXISTS idx_albuns_cliente ON albuns(cliente_id);

ALTER TABLE files ADD COLUMN album_id INTEGER REFERENCES albuns(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS idx_files_album ON files(album_id);

CREATE TABLE IF NOT EXISTS favoritos (
  cliente_id INTEGER NOT NULL,
  file_id INTEGER NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  PRIMARY KEY (cliente_id, file_id),
  FOREIGN KEY (cliente_id) REFERENCES portal_clientes(id) ON DELETE CASCADE,
  FOREIGN KEY (file_id) REFERENCES files(id) ON DELETE CASCADE
);

-- Sessões do cliente final (separadas das sessões dos assinantes). Só o hash do token fica no banco.
CREATE TABLE IF NOT EXISTS portal_sessoes (
  token_hash TEXT PRIMARY KEY,
  cliente_id INTEGER NOT NULL,
  expires_at TEXT NOT NULL,
  FOREIGN KEY (cliente_id) REFERENCES portal_clientes(id) ON DELETE CASCADE
);
