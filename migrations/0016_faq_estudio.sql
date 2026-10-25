-- Nuvenzinha: a venda de eventos passou para dentro do Meu portal (links abertos) e chegaram as regras de acesso,
-- os layouts e a central de acesso.
UPDATE faq SET resposta = REPLACE(resposta, '[Meus eventos](/meus-eventos)', '[Meu portal → Criar novo → Link aberto](/meu-portal?aba=abertos)')
WHERE resposta LIKE '%/meus-eventos%';

UPDATE faq SET resposta = 'Com um plano ativo (ou o teste grátis), entre em [Meu portal](/meu-portal). Primeiro abra Configurações do estúdio: nome, endereço, cor, layout e o seu PIX. Depois clique em Criar novo e escolha: Link fechado (um cliente com login e senha, para casamento, ensaio...) ou Link aberto (evento com fotos à venda). O site vai te guiando passo a passo.'
WHERE pergunta = 'Como crio meu portal?';

INSERT INTO faq (ordem, pergunta, palavras, resposta) VALUES
(61, 'Link aberto ou link fechado: qual usar?', 'link aberto, link fechado, qual usar, diferenca, aberto ou fechado, evento ou cliente',
 'Link fechado é para um cliente específico (casamento, 15 anos, ensaio, empresa): ele entra com e-mail e senha e vê só o álbum dele. Link aberto é para eventos (corrida, futebol, formatura, convidados da festa): qualquer pessoa vê as fotos com marca d''água, escolhe e paga por foto no seu PIX. Os dois ficam em [Meu portal](/meu-portal) → Criar novo.'),
(62, 'Posso limitar o tempo ou os downloads do cliente?', 'prazo, limite de tempo, quantos dias, limitar download, quantas vezes baixar, acesso expira, vencer link, so ver, so visualizar, escolher fotos, limite de fotos',
 'Pode! Em cada álbum (link fechado) você escolhe: por quanto tempo o cliente acessa (2, 3, 4, 7, 15, 30 dias ou sem prazo), quantas vezes ele pode baixar cada foto, quantas fotos pode escolher para o álbum impresso e se pode pedir edição. Dá até para deixar só para ver e escolher, e liberar o download depois. O cliente vê na tela quanto tempo falta. Abra o álbum em [Meu portal](/meu-portal) → Regras de acesso.'),
(63, 'Como sei se meu cliente já viu as fotos?', 'cliente acessou, cliente viu, quantas vezes acessou, central de acesso, cliente baixou, pedido de edicao, atencao',
 'Em [Meu portal](/meu-portal), a Central de acesso mostra cada cliente com quantas vezes acessou, o último acesso, downloads, fotos escolhidas e pedidos de edição. O sinal 🔴 indica que precisa da sua atenção (edição pedida, cobrança atrasada), ❓ que ele ainda não acessou ou o prazo está acabando, e ✅ que está tudo certo.'),
(64, 'Posso mudar o visual do meu portal?', 'layout, visual, tema, aparencia, cor do portal, fundo preto, modelo, personalizar',
 'Pode! Em [Meu portal](/meu-portal) → Configurações do estúdio, escolha a cor da sua marca e um dos 4 layouts: Clássico, Galeria escura (fundo preto, ótimo para casamento), Minimalista (branco e elegante) ou Delicado (tons suaves, ótimo para newborn e 15 anos). Clique em Salvar e o seu cliente já vê o novo visual.');
