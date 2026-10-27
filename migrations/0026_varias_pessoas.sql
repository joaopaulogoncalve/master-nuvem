-- Várias pessoas no mesmo álbum (casal, pai e mãe, sócios da festa): cada uma com o próprio login e senha.
-- albuns.cliente_id continua sendo a pessoa principal; as outras entram aqui.
CREATE TABLE IF NOT EXISTS album_acessos (
  album_id INTEGER NOT NULL REFERENCES albuns(id) ON DELETE CASCADE,
  cliente_id INTEGER NOT NULL REFERENCES portal_clientes(id) ON DELETE CASCADE,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  PRIMARY KEY (album_id, cliente_id)
);

-- Cada pessoa que assina o contrato tem o próprio link (/c/<token>) e o próprio código no e-mail.
CREATE TABLE IF NOT EXISTS contrato_assinantes (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  contrato_id INTEGER NOT NULL REFERENCES contratos(id) ON DELETE CASCADE,
  nome TEXT NOT NULL,
  email TEXT NOT NULL,
  cliente_id INTEGER REFERENCES portal_clientes(id) ON DELETE SET NULL,
  token TEXT NOT NULL UNIQUE,
  status TEXT NOT NULL DEFAULT 'enviado',    -- enviado | visto | assinado
  visto_em TEXT,
  codigo_hash TEXT,
  codigo_expira TEXT,
  codigos_enviados INTEGER NOT NULL DEFAULT 0,
  tentativas INTEGER NOT NULL DEFAULT 0,
  assinante_nome TEXT,
  assinante_cpf TEXT,
  assinado_em TEXT,
  assinado_ip TEXT,
  assinado_navegador TEXT,
  documento_hash TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_assinantes_contrato ON contrato_assinantes(contrato_id);
CREATE INDEX IF NOT EXISTS idx_assinantes_cliente ON contrato_assinantes(cliente_id);

-- Regra de acesso do contrato: 'todos' (ninguém vê as fotos até todos assinarem), 'um' (basta uma assinatura),
-- 'nenhum' (o contrato não trava o álbum). O antigo "obrigatorio = 1" equivale a 'todos'.
ALTER TABLE contratos ADD COLUMN regra TEXT NOT NULL DEFAULT 'nenhum';
UPDATE contratos SET regra = 'todos' WHERE obrigatorio = 1;

-- Contratos antigos (uma pessoa só) viram um assinante, com o mesmo link e a assinatura que já tinham.
INSERT INTO contrato_assinantes (contrato_id, nome, email, cliente_id, token, status, visto_em, assinante_nome, assinante_cpf,
  assinado_em, assinado_ip, assinado_navegador, documento_hash, created_at)
SELECT id, destinatario_nome, destinatario_email, cliente_id, token, CASE WHEN status = 'cancelado' THEN 'enviado' ELSE status END,
  visto_em, assinante_nome, assinante_cpf, assinado_em, assinado_ip, assinado_navegador, documento_hash, created_at
FROM contratos WHERE token NOT IN (SELECT token FROM contrato_assinantes);

-- Dados do fotógrafo para os contratos (preenchidos uma vez em Minha página).
ALTER TABLE portais ADD COLUMN doc_nome TEXT;      -- nome completo ou razão social
ALTER TABLE portais ADD COLUMN doc_numero TEXT;    -- CPF ou CNPJ
ALTER TABLE portais ADD COLUMN doc_cidade TEXT;    -- cidade - UF (também vira o foro)

-- A resposta da Nuvenzinha deixa de citar o nome do fornecedor de armazenamento.
UPDATE faq SET resposta = REPLACE(resposta, 'Num armazenamento profissional em nuvem (Backblaze), em data centers que podem ficar fora do Brasil, com criptografia.', 'Em data centers profissionais, com criptografia e redundância (cada arquivo fica em vários discos ao mesmo tempo), que podem ficar fora do Brasil.')
WHERE resposta LIKE '%(Backblaze)%';
