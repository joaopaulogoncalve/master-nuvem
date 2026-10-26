-- Contratos com assinatura eletrônica simples (MP 2.200-2/2001, art. 10, § 2º): o fotógrafo escolhe um modelo, o texto
-- já vem preenchido com os dados do cliente e do serviço, ele revisa e envia; o cliente lê, informa nome e CPF e confirma
-- com um código enviado para o e-mail dele. Fica guardado o comprovante: data, IP, navegador, e-mail confirmado e o hash
-- (SHA-256) do texto assinado, que prova que o contrato não mudou depois.

-- Modelos do próprio fotógrafo (os modelos prontos ficam em src/contratos-modelos.js).
CREATE TABLE IF NOT EXISTS contrato_modelos (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  portal_id INTEGER NOT NULL REFERENCES portais(id) ON DELETE CASCADE,
  nome TEXT NOT NULL,
  texto TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS contratos (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  portal_id INTEGER NOT NULL REFERENCES portais(id) ON DELETE CASCADE,
  cliente_id INTEGER REFERENCES portal_clientes(id) ON DELETE SET NULL,
  album_id INTEGER REFERENCES albuns(id) ON DELETE SET NULL,
  titulo TEXT NOT NULL,
  texto TEXT NOT NULL,                       -- texto final, já preenchido (o que o cliente assina)
  destinatario_nome TEXT NOT NULL,
  destinatario_email TEXT NOT NULL,
  token TEXT NOT NULL UNIQUE,                -- link do cliente: /c/<token> (sozinho não assina: precisa do código do e-mail)
  status TEXT NOT NULL DEFAULT 'enviado',    -- enviado | visto | assinado | cancelado
  visto_em TEXT,
  codigo_hash TEXT,                          -- código de 6 números enviado por e-mail (hash)
  codigo_expira TEXT,
  codigos_enviados INTEGER NOT NULL DEFAULT 0,
  tentativas INTEGER NOT NULL DEFAULT 0,
  assinante_nome TEXT,
  assinante_cpf TEXT,
  assinante_email TEXT,
  assinado_em TEXT,
  assinado_ip TEXT,
  assinado_navegador TEXT,
  documento_hash TEXT,                       -- SHA-256 do texto no momento da assinatura
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_contratos_portal ON contratos(portal_id, status);

INSERT INTO faq (ordem, pergunta, palavras, resposta) VALUES
(68, 'Posso mandar contrato para o meu cliente assinar online?', 'contrato, assinar contrato, assinatura eletronica, assinatura digital, contrato online, contrato fotografia, contrato casamento, modelo de contrato',
 'Pode! No [Meu estúdio](/meu-portal), abra "📝 Contratos" e clique em "➕ Novo contrato". Escolha um modelo pronto (casamento, 15 anos, ensaio, vídeo, contador...), o cliente e o valor: o texto já vem preenchido. Revise, edite o que quiser e envie. O cliente recebe um link, lê, informa nome e CPF e confirma com um código no e-mail. Os modelos são um ponto de partida: revise com o seu advogado.');
