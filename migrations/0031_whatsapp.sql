-- Robô do WhatsApp (API oficial da Meta): a Nuvenzinha responde com as respostas da tabela faq.
-- Uma linha por número que já falou com a Master Nuvem.
CREATE TABLE IF NOT EXISTS whatsapp_conversas (
  telefone TEXT PRIMARY KEY,                 -- só números, com DDI (ex.: 5562999999999)
  nome TEXT,                                 -- nome do perfil do WhatsApp
  humano_ate TEXT,                           -- até quando o robô fica quieto (o João está atendendo)
  ultima_em TEXT NOT NULL DEFAULT (datetime('now')),
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- Mensagens recebidas e enviadas (guardadas 180 dias, como as perguntas do chat do site).
CREATE TABLE IF NOT EXISTS whatsapp_mensagens (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  wamid TEXT UNIQUE,                         -- id da mensagem na Meta (evita responder duas vezes)
  telefone TEXT NOT NULL,
  direcao TEXT NOT NULL,                     -- 'entrada' | 'robo' | 'joao'
  texto TEXT,
  faq_id INTEGER,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_whatsapp_mensagens_tel ON whatsapp_mensagens(telefone, created_at);

-- No WhatsApp o pessoal escreve curto ("como pago?"): palavra a mais na resposta de pagamento (vale para o chat do site também).
UPDATE faq SET palavras = palavras || ', pago, pagando, como pago' WHERE pergunta = 'Como faço o pagamento?' AND palavras NOT LIKE '%como pago%';
