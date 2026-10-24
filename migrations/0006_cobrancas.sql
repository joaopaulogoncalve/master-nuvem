-- Migration number: 0006 	 Central de cobranças do fotógrafo (modo manual)
-- O dinheiro vai DIRETO para o fotógrafo (PIX ou link dele). O site só organiza e, se ele quiser,
-- segura o álbum até a cobrança ser marcada como paga.

ALTER TABLE portais ADD COLUMN instrucoes_pagamento TEXT;  -- ex.: "PIX (CNPJ): 12.345.678/0001-90 - Estúdio Aurora"

CREATE TABLE IF NOT EXISTS cobrancas (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  portal_id INTEGER NOT NULL,
  cliente_id INTEGER NOT NULL,
  album_id INTEGER,                          -- álbum ligado (opcional)
  descricao TEXT NOT NULL,                   -- ex.: "Saldo do casamento", "15 fotos extras"
  valor_centavos INTEGER NOT NULL,
  vencimento TEXT,                           -- AAAA-MM-DD (opcional)
  link_pagamento TEXT,                       -- link da maquininha/banco do fotógrafo (opcional)
  bloqueia_album INTEGER NOT NULL DEFAULT 0, -- 1 = álbum fica trancado até pagar
  status TEXT NOT NULL DEFAULT 'pendente',   -- 'pendente' | 'pago' | 'cancelado'
  pago_em TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY (portal_id) REFERENCES portais(id) ON DELETE CASCADE,
  FOREIGN KEY (cliente_id) REFERENCES portal_clientes(id) ON DELETE CASCADE,
  FOREIGN KEY (album_id) REFERENCES albuns(id) ON DELETE SET NULL
);
CREATE INDEX IF NOT EXISTS idx_cobrancas_portal ON cobrancas(portal_id, status);
CREATE INDEX IF NOT EXISTS idx_cobrancas_album ON cobrancas(album_id, status);
