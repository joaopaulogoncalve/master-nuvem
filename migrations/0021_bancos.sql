-- Bancos e maquininhas: links das ajudas oficiais (cadastrar chave PIX e criar link de pagamento), mostrados em
-- "Como recebo" e usados pela Nuvenzinha. Banco novo só entra com aprovação do João no /admin (protege contra golpe).
CREATE TABLE IF NOT EXISTS bancos (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  nome TEXT NOT NULL,
  palavras TEXT NOT NULL DEFAULT '',          -- para a Nuvenzinha achar: "itau,itau unibanco"
  link_pix TEXT,                               -- ajuda oficial: cadastrar chave PIX
  link_pagamento TEXT,                         -- ajuda oficial: criar link de pagamento (cartão)
  tem_api INTEGER NOT NULL DEFAULT 0,          -- 1 = a empresa tem API de pagamentos (confirmação automática possível no futuro)
  ordem INTEGER NOT NULL DEFAULT 100,
  ativo INTEGER NOT NULL DEFAULT 1,
  link_pix_ok INTEGER NOT NULL DEFAULT 1,      -- resultado da última checagem automática
  link_pagamento_ok INTEGER NOT NULL DEFAULT 1,
  checado_em TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- Pedido de banco que ainda não está na lista (vem da Nuvenzinha ou do "Como recebo").
CREATE TABLE IF NOT EXISTS bancos_pedidos (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  banco TEXT NOT NULL,
  nome TEXT,
  email TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'aberto',       -- aberto | aprovado | descartado
  banco_id INTEGER,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  respondido_em TEXT
);

INSERT INTO bancos (nome, palavras, link_pix, link_pagamento, tem_api, ordem) VALUES
('Mercado Pago', 'mercado pago,mercadopago,mercado livre', 'https://www.mercadopago.com.br/blog/como-cadastrar-chave-pix', 'https://www.mercadopago.com.br/blog/criar-compartilhar-link-de-pagamento', 1, 1),
('InfinitePay', 'infinitepay,infinite pay,infinite,cloudwalk', 'https://ajuda.infinitepay.io/pt-BR/articles/9534251-como-criar-uma-chave-pix-na-infinitepay', 'https://www.infinitepay.io/link-de-pagamento', 1, 2),
('PagBank', 'pagbank,pagseguro,pag seguro,pag bank', 'https://faq.pagbank.com.br/duvida/como-criar-ou-alterar-uma-chave-pix/1089', 'https://blog.pagbank.com.br/link-de-pagamento-pagbank', 1, 3),
('Nubank', 'nubank,nu bank,roxinho', 'https://blog.nubank.com.br/registrar-chaves-do-pix/', NULL, 0, 4),
('Itaú', 'itau,itau unibanco', 'https://feito.itau.com.br/guia-para-cadastrar-chave-pix-no-itau/', NULL, 0, 5),
('Bradesco', 'bradesco,next', 'https://banco.bradesco/cidadania-financeira/educacao-financeira/organize-suas-financas/conheca-o-pix/', NULL, 0, 6),
('Caixa', 'caixa,caixa economica,caixa tem', 'https://www.caixa.gov.br/pix/perguntas-frequentes/Paginas/default.aspx', NULL, 0, 7),
('Banco do Brasil', 'banco do brasil,bb', 'https://www.bb.com.br/site/central-de-ajuda-bb/ajuda-pix-e-transferencia/', NULL, 0, 8),
('Santander', 'santander,getnet', 'https://www.santander.com.br/banco/pix', NULL, 0, 9),
('Inter', 'inter,banco inter', 'https://ajuda.inter.co/pix/como-cadastrar-chave-pix-na-conta-digital-pf', NULL, 0, 10),
('C6 Bank', 'c6,c6 bank', 'https://ajuda.c6bank.com.br/s/article/Como-cadastrar-chaves-Pix-no-C6-Bank', NULL, 0, 11),
('PicPay', 'picpay,pic pay', 'https://meajuda.picpay.com/hc/pt-br/articles/360050066132-Como-cadastrar-uma-chave-Pix-no-PicPay', NULL, 0, 12),
('Sicoob', 'sicoob', 'https://www.sicoob.com.br/web/sicoob/pix', NULL, 0, 13),
('Sicredi', 'sicredi', 'https://www.sicredi.com.br/site/pix/', NULL, 0, 14),
('Ton', 'ton,stone ton,maquininha ton', NULL, 'https://ajuda.ton.com.br/pt_BR/link-de-pagamento/o-que-%C3%A9-e-como-vender', 0, 15),
('Stone', 'stone,conta stone', NULL, 'https://ajuda.stone.com.br/link-pagamento-stone/conheca-o-link-de-pagamento', 1, 16),
('Cielo', 'cielo,cielo gestao,maquininha cielo,cielo zip,cielo flash,cielo lio', 'https://www.cielo.com.br/pix/', 'https://docs.cielo.com.br/link/docs/criar-link-de-pagamento-2', 1, 17);

INSERT INTO faq (ordem, pergunta, palavras, resposta) VALUES
(67, 'Meu banco confirma o pagamento sozinho?', 'confirma sozinho, confirmacao automatica, baixa automatica, verificacao, verificar pagamento, cliente pagou, como sei se pagou, api do banco',
 'Hoje, quando o cliente paga no seu PIX ou no seu link, quem confere é você: olhe no app do banco e clique em "Marcar como pago" no Meu estúdio. Em "Como recebo", escolha o seu banco para ver se ele permite confirmação automática no futuro (Mercado Pago, InfinitePay, PagBank, Stone e Cielo têm sistema para isso; bancos comuns como Nubank e Itaú não).');
