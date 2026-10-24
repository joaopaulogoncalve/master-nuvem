-- Migration number: 0010 	 Assistente (chat da nuvenzinha): perguntas e respostas, perguntas feitas e chamados
-- palavras: termos separados por vírgula (sem acento, minúsculo) usados para achar a resposta certa.
-- Na resposta, [texto](/caminho) vira link (só links do próprio site ou mailto).

CREATE TABLE IF NOT EXISTS faq (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  pergunta TEXT NOT NULL,
  palavras TEXT NOT NULL,
  resposta TEXT NOT NULL,
  ordem INTEGER NOT NULL DEFAULT 100,        -- menor aparece primeiro nas sugestões
  ativo INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- Cada pergunta digitada no chat (para aprender o que o povo pergunta). faq_id NULL = a nuvem não soube responder.
CREATE TABLE IF NOT EXISTS perguntas_chat (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  texto TEXT NOT NULL,
  faq_id INTEGER,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY (faq_id) REFERENCES faq(id) ON DELETE SET NULL
);
CREATE INDEX IF NOT EXISTS idx_perguntas_chat_data ON perguntas_chat(created_at);

CREATE TABLE IF NOT EXISTS chamados (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  nome TEXT NOT NULL,
  email TEXT NOT NULL,
  mensagem TEXT NOT NULL,
  pagina TEXT,
  user_id INTEGER,                           -- se a pessoa estava logada
  status TEXT NOT NULL DEFAULT 'aberto',     -- 'aberto' | 'resolvido'
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  resolvido_em TEXT
);

-- Limite anti-abuso (hash do IP do dia; apagado depois de 1 dia pela limpeza automática).
CREATE TABLE IF NOT EXISTS assistente_limite (
  chave TEXT NOT NULL,
  tipo TEXT NOT NULL,                        -- 'pergunta' | 'chamado'
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_assistente_limite ON assistente_limite(chave, tipo, created_at);

INSERT INTO faq (ordem, pergunta, palavras, resposta) VALUES
(1, 'O que é a Master Nuvem?', 'o que e, master nuvem, como funciona, servico, para que serve, quem sao',
 'A Master Nuvem é um espaço na nuvem do tamanho que você precisa, de 1 GB até 5 TB. Você guarda, baixa e organiza seus arquivos com segurança. Para fotógrafos e videomakers, ainda tem o Portal do Cliente: um site com a sua marca para entregar os álbuns. Veja a [página inicial](/).'),
(2, 'Quanto custa?', 'preco, quanto custa, valor, mensalidade, custa, barato, caro, tabela, quanto e',
 'Você paga só pelo espaço que escolher, por mês. O mínimo é R$ 9,90, e 1 TB sai por cerca de R$ 59. Arraste a barrinha na [calculadora](/#calculadora) para ver o valor exato na hora.'),
(3, 'Posso testar grátis?', 'gratis, testar, teste, experimentar, cupom, nuvem1dia, sem pagar, demonstracao',
 'Pode sim! Crie sua conta e, no [Painel](/painel), clique em Contratar > Testar grátis por 24 horas. São 20 MB por 24 horas, sem cartão, para você enviar umas fotos e conhecer o Portal do Cliente.'),
(4, 'Como faço o pagamento?', 'pagamento, pagar, pix, cartao, boleto, mercado pago, forma de pagamento, credito',
 'O pagamento é pelo Mercado Pago, com PIX ou cartão. No [Painel](/painel), clique em Contratar, escolha os GB e pague. Assim que o pagamento é aprovado, o plano ativa sozinho.'),
(5, 'Paguei e meu plano não ativou', 'paguei, nao ativou, nao liberou, pagamento aprovado, plano nao aparece, ja paguei, pix caiu',
 'No PIX, a ativação costuma levar poucos segundos. Atualize o [Painel](/painel) em 1 ou 2 minutos. No cartão, pode levar um pouco mais se o Mercado Pago estiver analisando. Se passou mais de 30 minutos, abra um chamado aqui no chat que a gente resolve.'),
(6, 'O plano renova sozinho?', 'renova, renovacao, automatico, assinatura, recorrente, debito automatico, cobranca automatica',
 'Não. Cada pagamento vale 30 dias e não há cobrança automática. Antes de vencer, avisamos por e-mail. Renovando o mesmo tamanho, os dias que faltam são somados.'),
(7, 'O que acontece quando o plano vence?', 'vence, venceu, vencimento, expirou, acabou, perco meus arquivos, apagar, 15 dias, prazo, nao renovar, se eu nao renovar, nao pagar mais, parar de pagar',
 'Quando o plano vence, o envio de novos arquivos é bloqueado, mas você ainda pode baixar tudo por 15 dias. Depois disso os arquivos podem ser apagados. Avisamos por e-mail antes. Veja os [Termos de uso](/termos).'),
(8, 'Meus arquivos estão seguros?', 'seguro, seguranca, criptografia, hacker, vazar, privacidade, protegido, confiavel',
 'Sim. Os arquivos ficam num armazenamento profissional, privado e criptografado, e cada link de download vale só alguns minutos. Recomendamos ativar a verificação em duas etapas no [Painel](/painel), no botão vermelho.'),
(9, 'Alguém pode ver meus arquivos?', 'quem ve, alguem ve, voces veem, acessam meus arquivos, olham, espionar, privado',
 'Não. Seus arquivos são só seus: a Master Nuvem não olha, não usa e não vende o seu conteúdo. Saiba mais na [Política de privacidade](/privacidade).'),
(10, 'Qual o tamanho máximo de arquivo?', 'tamanho maximo, limite, arquivo grande, 4,5 gb, video grande, quantos gb por arquivo',
 'Hoje cada arquivo pode ter até 4,5 GB. O total depende do seu plano. Vídeos maiores que isso podem ser divididos ou compactados.'),
(11, 'Que tipos de arquivo posso enviar?', 'tipo de arquivo, formato, foto, video, pdf, raw, zip, psd, documentos, aceita',
 'Qualquer tipo: fotos (JPG, PNG, RAW), vídeos, PDF, ZIP, documentos... Só não é permitido conteúdo ilegal, pirata ou vírus.'),
(12, 'Como envio meus arquivos?', 'enviar, upload, subir, mandar arquivo, carregar, como envio, colocar arquivo',
 'Entre em [Meus arquivos](/arquivos) e clique em Escolher arquivos (ou arraste os arquivos para a tela). Dá para enviar vários de uma vez e acompanhar o progresso.'),
(13, 'Como baixo meus arquivos?', 'baixar, download, descarregar, salvar no computador, recuperar arquivo',
 'Em [Meus arquivos](/arquivos), clique em Baixar ao lado do arquivo. O download vem direto, na qualidade original.'),
(14, 'Esqueci minha senha', 'esqueci, senha, recuperar senha, trocar senha, redefinir, nao consigo entrar, login',
 'Na tela de [Entrar](/entrar), clique em Esqueci minha senha e digite seu e-mail. Chega um link para criar uma senha nova (olhe também o Spam).'),
(15, 'Como ativo a verificação em duas etapas?', 'duas etapas, 2fa, autenticador, google authenticator, codigo, verificacao, seguranca extra',
 'No [Painel](/painel), clique no botão vermelho Quero mais segurança. Escaneie o QR code com o Google Authenticator (grátis) e digite o código de 6 números. Guarde a chave escrita num lugar seguro.'),
(16, 'Posso aumentar meu plano?', 'aumentar, mudar plano, mais espaco, upgrade, trocar plano, diminuir, fiquei sem espaco',
 'Pode. No [Painel](/painel), clique em Renovar ou aumentar e escolha o novo tamanho. Trocando de tamanho, o novo plano vale 30 dias a partir do pagamento.'),
(17, 'Como cancelo ou peço reembolso?', 'cancelar, reembolso, devolver dinheiro, desistir, estorno, arrependimento, 7 dias',
 'Você pode desistir em até 7 dias após o pagamento e receber 100% de volta (Código de Defesa do Consumidor). Basta pedir pelo e-mail [contato@masternuvem.com.br](mailto:contato@masternuvem.com.br). Como não há renovação automática, para cancelar depois disso é só não renovar.'),
(18, 'O que é o Portal do Cliente?', 'portal, portal do cliente, fotografo, videomaker, entregar fotos, album, galeria, minha marca',
 'É um site com o nome e a cor do seu estúdio, onde cada cliente entra com login e senha e vê só o álbum dele: marca as favoritas, vê as fotos em tela cheia e baixa. Veja a [demonstração](/portais).'),
(19, 'Como crio meu portal?', 'criar portal, montar portal, configurar portal, meu portal, endereco do portal',
 'Com um plano ativo (ou o teste grátis), entre em [Meu portal](/meu-portal). Escolha o nome do estúdio, o endereço e a cor; depois crie os clientes e os álbuns e envie as fotos.'),
(20, 'Como meu cliente acessa as fotos?', 'cliente acessa, link do cliente, senha do cliente, cliente entra, compartilhar, mandar para o cliente',
 'Em [Meu portal](/meu-portal) você cria o acesso do cliente (nome, e-mail e senha) e o site mostra o texto pronto para mandar no WhatsApp com o link. O cliente não precisa de conta no Google nem de espaço próprio.'),
(21, 'Meu cliente gasta espaço ou paga algo?', 'cliente paga, cliente gasta, espaco do cliente, cobra do cliente, google drive, conta no google, conta google, precisa ter conta, cliente precisa',
 'Não. Só você gasta espaço (do seu plano). Seu cliente só entra para ver e baixar, sem ocupar nada dele.'),
(22, 'Como cobro meus clientes pelo portal?', 'cobrar cliente, cobranca, tabela de precos, foto extra, trancar album, liberar apos pagamento',
 'Em [Meu portal](/meu-portal) > Acesso e cobranças, escolha Cobrar pelo portal. Monte sua tabela de preços (por foto, por vídeo, por minuto...), crie a cobrança e, se quiser, tranque o álbum até marcar como pago.'),
(23, 'Para onde vai o dinheiro das cobranças?', 'dinheiro vai, recebo, cai na minha conta, comissao, taxa, repasse',
 'Direto para você, pelo seu PIX ou pelo link da sua maquininha. A Master Nuvem só organiza quem pagou e não fica com nada das suas cobranças.'),
(24, 'Funciona no celular?', 'celular, iphone, android, aplicativo, app, tablet, mobile',
 'Funciona sim, direto no navegador do celular, sem instalar nada. Dica: no Chrome ou Safari, use Adicionar à tela inicial para abrir como um app.'),
(25, 'Onde ficam guardados os arquivos?', 'onde ficam, servidor, data center, brasil, eua, backblaze, cloudflare',
 'Num armazenamento profissional em nuvem (Backblaze), em data centers que podem ficar fora do Brasil, com criptografia. Detalhes na [Política de privacidade](/privacidade).'),
(26, 'Quero excluir minha conta e meus dados', 'excluir conta, apagar conta, deletar, lgpd, meus dados, remover dados',
 'É só pedir pelo e-mail [contato@masternuvem.com.br](mailto:contato@masternuvem.com.br), a partir do e-mail cadastrado. Apagamos em até 15 dias, como manda a LGPD.'),
(27, 'O envio de arquivo deu erro', 'erro no envio, falhou, nao envia, travou, falha de conexao, upload deu erro, nao sobe',
 'Confira: 1) se você tem plano ativo e espaço livre; 2) se o arquivo tem até 4,5 GB; 3) se a internet está estável. Tente de novo. Se continuar, abra um chamado aqui no chat contando o nome e o tamanho do arquivo.'),
(28, 'Quero falar com uma pessoa', 'falar com atendente, falar com alguem, falar com uma pessoa, atendimento, humano, pessoa, suporte, contato, whatsapp, telefone, email, ajuda, reclamacao',
 'Claro! Clique em Abrir chamado aqui no chat e conte o que precisa. Respondemos em até 48 horas pelo e-mail. Ou escreva para [contato@masternuvem.com.br](mailto:contato@masternuvem.com.br).'),
(29, 'Tem marca d''água nas fotos?', 'marca d agua, marca dagua, marca de agua, watermark, logo na foto, proteger foto, copiar foto',
 'Ainda não, mas está a caminho! Hoje você pode trancar o álbum até o pagamento (em [Meu portal](/meu-portal) > Acesso e cobranças): assim o cliente não vê nem baixa as fotos antes de pagar. A prévia com marca d''água e a sua logo vem numa próxima versão.');
