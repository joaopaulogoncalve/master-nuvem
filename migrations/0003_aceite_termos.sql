-- Migration number: 0003 	 Data em que o cliente aceitou os Termos de uso e a Política de privacidade
-- Contas antigas ficam com NULL (criadas antes dos Termos existirem).

ALTER TABLE users ADD COLUMN terms_accepted_at TEXT;
