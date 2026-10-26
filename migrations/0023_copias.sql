-- Cópias de segurança do banco (uma por dia, guardadas no Backblaze em backups/banco-dia-DD.json, 31 dias em rodízio).
CREATE TABLE IF NOT EXISTS copias (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  chave TEXT NOT NULL,          -- caminho do arquivo no bucket
  bytes INTEGER NOT NULL,
  tabelas INTEGER NOT NULL,
  linhas INTEGER NOT NULL,
  ok INTEGER NOT NULL DEFAULT 1,
  erro TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
