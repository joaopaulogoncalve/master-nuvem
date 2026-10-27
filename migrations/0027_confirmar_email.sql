-- Confirmação do e-mail no cadastro: a conta só contrata plano ou usa cupom depois de clicar no link do e-mail.
ALTER TABLE users ADD COLUMN email_confirmado_em TEXT;
ALTER TABLE users ADD COLUMN confirmacao_hash TEXT;      -- hash do link enviado (vale 3 dias)
ALTER TABLE users ADD COLUMN confirmacao_expira TEXT;
-- Quem já tem conta não precisa confirmar.
UPDATE users SET email_confirmado_em = COALESCE(created_at, datetime('now'));
