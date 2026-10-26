-- Galeria de evento (fotógrafo de rua, corrida, esporte, formatura, convidados de festa...).
-- Link aberto /e/<slug>: qualquer pessoa vê a prévia com marca d'água, escolhe as fotos, paga no PIX do fotógrafo
-- e, quando o fotógrafo confirma, baixa os originais. O dinheiro vai direto para o fotógrafo (0% de comissão).

CREATE TABLE IF NOT EXISTS eventos (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  portal_id INTEGER NOT NULL REFERENCES portais(id),
  slug TEXT NOT NULL UNIQUE,                 -- endereço público: /e/<slug>
  titulo TEXT NOT NULL,
  data TEXT,                                 -- AAAA-MM-DD
  local TEXT,
  tipo TEXT,                                 -- Corrida, Futebol, Formatura... (só para mostrar)
  preco_centavos INTEGER NOT NULL,           -- preço de 1 foto
  faixas TEXT,                               -- JSON [{"a_partir":5,"preco_centavos":1000}] = desconto por quantidade
  marca_texto TEXT,                          -- texto da marca d'água (padrão: nome do estúdio)
  publicado INTEGER NOT NULL DEFAULT 1,      -- 0 = link fora do ar
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_eventos_portal ON eventos(portal_id);

-- Original e prévia (com marca d'água, feita no navegador do fotógrafo) são linhas de "files": contam na cota do dono.
ALTER TABLE files ADD COLUMN evento_id INTEGER;
CREATE INDEX IF NOT EXISTS idx_files_evento ON files(evento_id);

CREATE TABLE IF NOT EXISTS evento_fotos (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  evento_id INTEGER NOT NULL REFERENCES eventos(id) ON DELETE CASCADE,
  original_id INTEGER NOT NULL REFERENCES files(id) ON DELETE CASCADE,
  previa_id INTEGER NOT NULL REFERENCES files(id) ON DELETE CASCADE,
  numeros TEXT,                              -- números de peito / camisa, separados por vírgula: " 123 , 45 "
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_evento_fotos_evento ON evento_fotos(evento_id, id);

-- Pedido de quem comprou. O comprador acessa pelo link com o token (o token só libera as fotos daquele pedido,
-- por isso fica guardado para o e-mail de "fotos liberadas" levar o mesmo link).
CREATE TABLE IF NOT EXISTS evento_pedidos (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  evento_id INTEGER NOT NULL REFERENCES eventos(id) ON DELETE CASCADE,
  token TEXT NOT NULL UNIQUE,
  nome TEXT NOT NULL,
  email TEXT NOT NULL,
  whatsapp TEXT,
  fotos TEXT NOT NULL,                       -- JSON com os ids de evento_fotos
  qtd INTEGER NOT NULL,
  valor_centavos INTEGER NOT NULL,
  status TEXT NOT NULL DEFAULT 'pendente',   -- pendente | pago | cancelado
  pago_em TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_evento_pedidos_evento ON evento_pedidos(evento_id, status);
