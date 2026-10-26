-- Contrato obrigatório: o cliente do portal só vê os álbuns depois de assinar (aparece logo no primeiro acesso).
ALTER TABLE contratos ADD COLUMN obrigatorio INTEGER NOT NULL DEFAULT 0;

-- Quantas fotos diferentes o cliente pode mandar para edição neste álbum (NULL = sem limite).
ALTER TABLE albuns ADD COLUMN limite_edicao INTEGER;

-- E-mail de boas-vindas do cliente do portal: link "Criar minha senha" (no banco só o hash; vale 7 dias).
ALTER TABLE portal_clientes ADD COLUMN convite_hash TEXT;
ALTER TABLE portal_clientes ADD COLUMN convite_expira TEXT;
