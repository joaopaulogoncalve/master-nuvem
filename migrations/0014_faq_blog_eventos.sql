-- Nuvenzinha: indica o post certo do blog e passa a falar da galeria de evento (venda de fotos com marca d'água).
-- Só aponta para posts já publicados (os agendados dariam "não encontrado" até a data).

UPDATE faq SET resposta = resposta || ' Passo a passo completo no blog: [Como funciona a Master Nuvem](/blog/como-funciona-a-master-nuvem).'
WHERE pergunta = 'O que é a Master Nuvem?';

UPDATE faq SET resposta = resposta || ' Guia completo: [conta, senha e segurança](/blog/passo-a-passo-conta-senha-e-seguranca).'
WHERE pergunta IN ('Esqueci minha senha', 'Como ativo a verificação em duas etapas?', 'Minha conta foi trancada. E agora?', 'O que é a sentinela?', 'Perdi o celular do código de 2 etapas');

UPDATE faq SET resposta = resposta || ' Passo a passo no blog: [Portal do Cliente para fotógrafos](/blog/portal-do-cliente-para-fotografos).'
WHERE pergunta IN ('O que é o Portal do Cliente?', 'Como crio meu portal?', 'Como meu cliente acessa as fotos?');

UPDATE faq SET resposta = resposta || ' Veja também o [passo a passo do pagamento](/blog/como-funciona-a-master-nuvem).'
WHERE pergunta = 'Como faço o pagamento?';

UPDATE faq SET
  palavras = 'vender fotos, corrida, evento, foto de rua, fotografo de rua, maratona, venda de fotos, galeria publica, galeria de evento, numero de peito, formatura, fotos avulsas, fotografo esportivo',
  resposta = 'Serve sim! Em [Meus eventos](/meus-eventos) você cria a galeria do evento (corrida, futebol, formatura, convidados da festa...), define o preço por foto e o desconto por quantidade e envia as fotos. O site cria uma prévia com marca d''água e guarda o original. A pessoa acha as fotos pelo número de peito, paga no seu PIX e, quando você clica em Pago, baixa os originais. 0% de comissão. Guia completo: [vender fotos de eventos](/blog/vender-fotos-de-eventos-e-corridas).'
WHERE pergunta = 'Serve para fotógrafo de evento ou corrida vender fotos?';

UPDATE faq SET resposta = 'Tem sim, na galeria de evento: ao enviar as fotos em [Meus eventos](/meus-eventos), o seu navegador cria uma prévia pequena com o nome do seu estúdio repetido na diagonal, e o original só é liberado depois que você confirma o pagamento. Para álbuns de contrato (Portal do Cliente), você pode trancar o álbum até o pagamento em [Meu portal](/meu-portal) > Acesso e cobranças. Saiba mais: [como funciona a venda com marca d''água](/blog/vender-fotos-de-eventos-e-corridas).'
WHERE pergunta = 'Tem marca d''água nas fotos?';

INSERT INTO faq (ordem, pergunta, palavras, resposta) VALUES
(59, 'Tem tutorial ou passo a passo?', 'tutorial, passo a passo, manual, como usar, guia, blog, video, ensinar, aprender',
 'Tem sim! No nosso [Blog](/blog) tem o passo a passo de ponta a ponta: [como funciona](/blog/como-funciona-a-master-nuvem), [conta e senha](/blog/passo-a-passo-conta-senha-e-seguranca), [Portal do Cliente para fotógrafos](/blog/portal-do-cliente-para-fotografos) e [venda de fotos de eventos](/blog/vender-fotos-de-eventos-e-corridas). Lá também tem uma busca.'),
(60, 'Comprei fotos de um evento. Como baixo?', 'comprei fotos, baixar fotos do evento, paguei as fotos, fotos da corrida, liberar fotos, pedido de fotos',
 'Depois de pagar no PIX do fotógrafo, ele confere e clica em Pago. Aí você recebe um e-mail e, no mesmo link do seu pedido, aparecem os botões para baixar os originais sem marca d''água. Se demorar, fale direto com o fotógrafo: o pagamento vai para ele, e é ele quem libera.');
