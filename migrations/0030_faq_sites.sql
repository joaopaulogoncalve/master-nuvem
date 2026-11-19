-- Nuvenzinha: criação de sites (página /sites), WhatsApp de atendimento (atalho /whatsapp) e respostas gerais atualizadas.

UPDATE faq SET resposta = resposta || ' E também criamos sites para empresas e profissionais: veja [Criação de sites](/sites).'
WHERE pergunta = 'O que é a Master Nuvem?';

UPDATE faq SET resposta = resposta || ' Quem precisa aparecer na internet também pode contratar a [criação de um site](/sites) com a gente.'
WHERE pergunta = 'Para quem serve a Master Nuvem?';

UPDATE faq SET resposta = 'Temos sim! O nosso WhatsApp é (62) 98284-6067: [clique aqui para chamar](/whatsapp). Se preferir, clique em Abrir chamado aqui no chat ou escreva para [contato@masternuvem.com.br](mailto:contato@masternuvem.com.br): respondemos em até 48 horas.'
WHERE pergunta = 'Tem WhatsApp?';

UPDATE faq SET resposta = 'Claro! Chame no nosso [WhatsApp (62) 98284-6067](/whatsapp), ou clique em Abrir chamado aqui no chat e conte o que precisa: respondemos em até 48 horas pelo e-mail. Também dá para escrever para [contato@masternuvem.com.br](mailto:contato@masternuvem.com.br).'
WHERE pergunta = 'Quero falar com uma pessoa';

INSERT INTO faq (ordem, pergunta, palavras, resposta) VALUES
(71, 'Vocês fazem sites?', 'site, sites, criar site, criacao de site, criar um site, fazer site, fazer um site, fazer meu site, criar meu site, site para empresa, site para minha empresa, pagina na internet, presenca online, aparecer na internet, desenvolvedor, programador, web designer',
 'Fazemos sim! A gente cria o site da sua empresa ou do seu trabalho: funciona no celular, tem cadeado de segurança, aparece no Google e leva o cliente direto para o seu WhatsApp. Você recebe 3 modelos com a sua marca para escolher. Veja tudo em [Criação de sites](/sites) ou peça um orçamento no [WhatsApp](/whatsapp).'),
(72, 'Quanto custa um site?', 'quanto custa um site, quanto custa o site, quanto custa site, custa um site, custa o site, preco do site, preco de site, valor do site, valor de um site, orcamento de site, orcamento do site, quanto fica um site, cartao digital, site barato',
 'O cartão digital (uma página com seus contatos e links) sai a partir de R$ 297. O site profissional (página principal com serviços, quem somos, perguntas, 3 modelos para escolher, pronto para o Google e cartão digital de brinde) sai a partir de R$ 797. A manutenção é R$ 59 por mês, e o domínio (.com.br) custa cerca de R$ 40 por ano, pago à parte. Loja e site com pagamento online: sob orçamento. Detalhes em [Criação de sites](/sites).'),
(73, 'Que tipos de site vocês fazem?', 'tipo de site, tipos de site, que site, qual site, site institucional, pagina de vendas, landing page, site de agendamento, agendamento, link na bio, linktree, curriculo, site pessoal, portfolio de trabalhos',
 'Fazemos site institucional (empresa e profissional de serviço), loja (catálogo de produtos), página de vendas (para curso, produto ou campanha), portfólio (galeria dos seus trabalhos), site pessoal ou currículo (ótimo para o LinkedIn), site com agendamento (salão, barbearia, estética) e cartão digital (links para a bio do Instagram). Não sabe qual? Chame no [WhatsApp](/whatsapp) que a gente indica. Veja os tipos em [Criação de sites](/sites#tipos).'),
(74, 'Dá para vender pelo site?', 'loja virtual, loja online, ecommerce, e commerce, vender pelo site, vender online, pagamento no site, pagar no site, catalogo, catalogo de produtos, carrinho, site de vendas',
 'Dá sim! Fazemos loja com catálogo de produtos, fotos, preços, busca e categorias. O cliente pode fechar a compra pelo seu WhatsApp ou pagar no próprio site. Como depende do número de produtos e da forma de pagamento, a loja é sob orçamento: chame no [WhatsApp](/whatsapp) ou veja [Criação de sites](/sites).'),
(75, 'Quanto tempo demora para o site ficar pronto?', 'demora o site, demora para fazer o site, tempo para fazer o site, prazo do site, prazo de entrega do site, quando fica pronto, site pronto, entrega do site',
 'Depende de quando o material chega. Com o logo, os textos e as fotos em mãos, os 3 modelos ficam prontos em poucos dias. Você escolhe o seu, a gente ajusta e publica no seu domínio. O passo a passo está em [Criação de sites](/sites).'),
(76, 'O domínio do site fica no meu nome?', 'dominio, dominios, com br, registro br, endereco do site, nome do site, www, meu dominio, comprar dominio',
 'Fica sim. O endereço (por exemplo, suaempresa.com.br) é registrado no seu CPF ou CNPJ, no Registro.br, e custa cerca de R$ 40 por ano. Ele é seu, mesmo se um dia você trocar de empresa para cuidar do site. A gente ajuda a registrar e liga o domínio ao site.'),
(77, 'O site tem mensalidade? E se eu quiser mudar algo?', 'mensalidade do site, mensalidade o site, mensalidade de site, mensalidade no site, site tem mensalidade, manutencao, manutencao do site, hospedagem, hospedar, mudar o site, alterar o site, atualizar o site, trocar foto do site, trocar texto do site, mudar preco no site',
 'A manutenção custa R$ 59 por mês e inclui a hospedagem, o cadeado de segurança, a cópia de segurança, o atendimento pelo WhatsApp e as mudanças pequenas (texto, foto, preço, telefone): é só mandar no [WhatsApp](/whatsapp). Mudanças grandes são combinadas antes. Veja em [Criação de sites](/sites).'),
(78, 'Não tenho logo nem textos para o site. E agora?', 'logo, logotipo, logomarca, sem logo, nao tenho logo, texto do site, textos do site, fotos do site, material do site, nao sei o que escrever',
 'Sem problema! A gente ajuda a escrever os textos a partir do que você conta sobre o seu trabalho. Para o logo, dá para começar com o nome da empresa bem escrito e trocar depois. Se o seu ramo tem regras (registro em conselho, banco parceiro, avisos obrigatórios), é só mandar os dados que entram no site. Chame no [WhatsApp](/whatsapp).'),
(79, 'Posso ver sites que vocês já fizeram?', 'sites que voces fizeram, sites feitos, exemplos de site, exemplo de site, trabalhos feitos, modelos de site, ver um site, clientes de site',
 'Pode sim! Em [Criação de sites → Trabalhos](/sites#trabalhos) estão alguns: site de correspondente bancário, currículo online, loja de achadinhos e a própria Master Nuvem. Cada um tem o link para você abrir no celular.');
