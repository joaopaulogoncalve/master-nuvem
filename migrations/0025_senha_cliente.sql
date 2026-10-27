-- 1 = a senha foi criada pelo próprio cliente (pelo e-mail de boas-vindas ou trocando na área dele).
-- 0 = senha que o fotógrafo definiu (ex.: mandou pelo WhatsApp): no primeiro acesso o portal pede para o cliente criar a dele.
ALTER TABLE portal_clientes ADD COLUMN senha_propria INTEGER NOT NULL DEFAULT 0;
-- Clientes que já existem não são incomodados.
UPDATE portal_clientes SET senha_propria = 1;
