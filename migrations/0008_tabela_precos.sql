-- Migration number: 0008 	 "Quer cobrar pelo portal?" + tabela de preços do fotógrafo + cobrança por itens
-- Ex.: Foto extra (por foto) R$ 15; Edição de foto (por foto) R$ 25; Vídeo editado (por minuto) R$ 80; Ensaio (pacote) R$ 600.

ALTER TABLE portais ADD COLUMN cobrar INTEGER NOT NULL DEFAULT 0;   -- 1 = usa a central de cobranças

CREATE TABLE IF NOT EXISTS precos (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  portal_id INTEGER NOT NULL,
  nome TEXT NOT NULL,                        -- "Foto extra", "Edição de foto", "Minuto de vídeo"...
  unidade TEXT NOT NULL,                     -- foto | edicao | video | minuto | hora | pacote | km
  valor_centavos INTEGER NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY (portal_id) REFERENCES portais(id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS idx_precos_portal ON precos(portal_id);

-- Itens da cobrança em JSON: [{"nome":"Foto extra","unidade":"foto","qtd":15,"valor_centavos":1500}, ...]
-- (cópia do preço no momento da cobrança: mudar a tabela depois não altera cobranças antigas)
ALTER TABLE cobrancas ADD COLUMN itens TEXT;
