-- Visual: cada cliente do profissional tem o seu layout (toda a área dele usa esse layout); cada evento também.
-- Álbuns e eventos ganham texto e foto de capa; o estúdio ganha logo e biografia.
-- tema NULL = usa o layout do estúdio (portais.tema). capa NULL = usa a primeira foto.
ALTER TABLE portal_clientes ADD COLUMN tema TEXT;
ALTER TABLE albuns ADD COLUMN descricao TEXT;
ALTER TABLE albuns ADD COLUMN capa_file_id INTEGER;
ALTER TABLE eventos ADD COLUMN tema TEXT;
ALTER TABLE eventos ADD COLUMN descricao TEXT;
ALTER TABLE eventos ADD COLUMN capa_file_id INTEGER;
ALTER TABLE portais ADD COLUMN logo_file_id INTEGER;
ALTER TABLE portais ADD COLUMN bio TEXT;
-- Nota fiscal: o profissional diz se emite (0 = não, 1 = sim). Quem compra pode pedir, informando CPF/CNPJ;
-- quem emite a nota é o próprio profissional, no portal da prefeitura dele (a Master Nuvem não emite nota de terceiros).
ALTER TABLE portais ADD COLUMN emite_nota INTEGER NOT NULL DEFAULT 0;
ALTER TABLE evento_pedidos ADD COLUMN nota_doc TEXT;
-- Link de pagamento do próprio profissional (Mercado Pago, InfinitePay...), mostrado ao lado do PIX.
ALTER TABLE portais ADD COLUMN link_pagamento TEXT;
-- Arquivo de uso especial (logo ou capa): não aparece em Meus arquivos nem nas fotos do álbum, mas conta na cota.
ALTER TABLE files ADD COLUMN uso TEXT;
