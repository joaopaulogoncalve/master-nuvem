// Posts do blog. "publicar" = data (Brasília) em que o post entra no ar sozinho. Para agendar, coloque uma data futura.
// Formato do texto: "## Título", "### Subtítulo", parágrafos separados por linha em branco, listas "- " ou "1. ",
// "> " para caixa de dica, **negrito** e [link](/caminho) ou [link](https://...).
// Regra: só escrever o que o site faz de verdade hoje. O que ainda não existe, dizer "ainda não" / "está nos planos".

// Buscas comuns sobre o assunto (aparecem como atalhos na busca do blog).
export const PALAVRAS_EM_ALTA = [
  "google drive cheio", "armazenamento em nuvem barato", "onde guardar fotos", "como entregar fotos para cliente",
  "vender fotos de corrida", "marca d'água", "backup de fotos", "esqueci minha senha", "verificação em duas etapas", "pix"
];

export const POSTS = [
  {
    slug: "aumentar-espaco-so-pelos-dias",
    titulo: "Precisa de mais espaço só por uns dias? Aumente e pague só os dias que faltam",
    descricao: "Na Master Nuvem você aumenta o espaço na hora, paga proporcional aos dias do seu plano e, no mês seguinte, volta para o tamanho que quiser. Sem fidelidade.",
    palavras: "aumentar espaço, mais espaço na nuvem, armazenamento flexível, plano sem fidelidade, pagar proporcional, upgrade de plano",
    categoria: "Dicas",
    publicar: "2026-10-25",
    leitura: 3,
    corpo: `
Fechou um casamento grande, uma formatura ou um ensaio com muitos vídeos e o espaço ficou apertado? Você não precisa trocar de plano nem pagar um mês inteiro por isso.

## Como funciona

1. No [Painel](/painel), clique em **Renovar ou aumentar**.
2. Arraste a barrinha até o tamanho que você precisa.
3. Escolha **⚡ Aumentar agora**.
4. Pague no PIX: o espaço aumenta **na hora**.

O **vencimento não muda**. Você paga só a **diferença de preço pelos dias que faltam** do seu plano (mínimo de R$ 2,00).

## Exemplo

Você tem **100 GB** e faltam **15 dias** para vencer. Precisa de **500 GB** para entregar um evento:

- 100 GB custam R$ 10,40 por mês; 500 GB custam R$ 32,00 por mês.
- A diferença é R$ 21,60 por mês. Por 15 dias, fica **R$ 10,80**.

## E depois?

Quando o plano vencer, você renova **no tamanho que quiser**: continua com 500 GB ou volta para 100 GB. Sem multa e sem fidelidade.

> Prefere só adiantar a mensalidade? Escolha **🔁 Renovar**: renovando o mesmo tamanho, os dias são somados ao seu plano.

Ainda não tem conta? Teste grátis por 24 horas no [Painel](/painel?cupom=NUVEM1DIA).
`
  },
  {
    slug: "como-funciona-a-master-nuvem",
    titulo: "Como funciona a Master Nuvem, de ponta a ponta",
    descricao: "Do cadastro ao primeiro arquivo: como escolher o espaço, pagar no PIX, enviar, baixar e o que acontece quando o plano vence.",
    palavras: "armazenamento em nuvem, como funciona, nuvem para fotos, guardar arquivos, plano mensal, pix",
    categoria: "Passo a passo",
    publicar: "2026-10-25",
    leitura: 5,
    corpo: `
A Master Nuvem é um espaço na nuvem **do tamanho que você precisa**: de 1 GB até 5 TB. Você paga só pelo espaço escolhido, por 30 dias, e guarda fotos, vídeos e documentos com segurança. Este guia mostra o caminho completo, do zero até o primeiro download.

## 1. Crie a sua conta

Entre em [masternuvem.com.br/entrar](/entrar), clique em **Criar conta**, coloque nome, e-mail e uma senha de pelo menos 8 caracteres e aceite os Termos de uso. Pronto: você já cai no seu Painel.

> Dica: logo depois de criar a conta, ative a **verificação em duas etapas** no botão vermelho do Painel. Leva 1 minuto e protege muito mais a sua conta. Veja o [passo a passo de login e segurança](/blog/passo-a-passo-conta-senha-e-seguranca).

## 2. Teste grátis ou contrate

No Painel, clique em **Contratar**. Aparecem duas opções:

- **Testar grátis por 24 horas**: 20 MB, sem cartão, para conhecer o envio de arquivos e o Portal do Cliente.
- **Quero contratar já**: você arrasta a barrinha, escolhe os GB e vê o preço na hora. O mínimo é R$ 9,90, e 1 TB sai por cerca de R$ 59 por mês.

## 3. Pague no PIX (ou no cartão)

Clique em **Pagar com PIX**. Abre uma tela da própria Master Nuvem com o QR code e o código "copia e cola". Pague pelo app do seu banco e **deixe a tela aberta**: em poucos segundos ela muda sozinha para "Pagamento confirmado" e o plano já está ativo.

Prefere cartão de crédito? Clique em **Prefiro cartão de crédito**: o pagamento é feito na página segura do Mercado Pago, e o plano também ativa sozinho.

## 4. Envie os seus arquivos

Entre em [Meus arquivos](/arquivos) e escolha (ou arraste) os arquivos. Dá para mandar vários de uma vez e acompanhar o progresso. Cada arquivo pode ter até 4,5 GB.

## 5. Baixe quando quiser

Ao lado de cada arquivo tem o botão **Baixar**. O download vem na qualidade original, quantas vezes você quiser.

## 6. Renovar, aumentar e vencimento

- Cada pagamento vale **30 dias** e **não há cobrança automática**. Você renova quando quiser.
- Renovando o **mesmo tamanho**, os dias que faltam são somados.
- Avisamos por e-mail 3 dias antes de vencer.
- Se vencer, o envio é bloqueado, mas você ainda baixa tudo por **15 dias**. Depois disso os arquivos podem ser apagados, como dizem os [Termos de uso](/termos).

## E se eu for fotógrafo?

Você ainda ganha o **Portal do Cliente** (um site com a sua marca para entregar álbuns) e a **galeria de evento** para vender fotos avulsas. Veja os guias [para fotógrafos](/blog/portal-do-cliente-para-fotografos) e [para fotógrafos de evento e corrida](/blog/vender-fotos-de-eventos-e-corridas).
`
  },
  {
    slug: "passo-a-passo-conta-senha-e-seguranca",
    titulo: "Passo a passo: criar conta, entrar, recuperar a senha e proteger a conta",
    descricao: "Como fazer login, o que fazer se esquecer a senha, como ativar a verificação em duas etapas e o que significa conta trancada pela sentinela.",
    palavras: "esqueci minha senha, login, criar conta, verificação em duas etapas, 2fa, google authenticator, conta bloqueada",
    categoria: "Passo a passo",
    publicar: "2026-10-25",
    leitura: 4,
    corpo: `
## Criar a conta

1. Abra [masternuvem.com.br/entrar](/entrar) e clique em **Criar conta**.
2. Coloque seu nome, e-mail e uma senha (mínimo de 8 caracteres).
3. Marque o aceite dos Termos de uso e da Política de privacidade.
4. Clique em criar. Você já entra no Painel.

## Entrar

Na mesma tela, aba **Entrar**: e-mail e senha. Se a verificação em duas etapas estiver ligada, o site pede também o código de 6 números do aplicativo.

## Esqueci minha senha

1. Na tela de [Entrar](/entrar), clique em **Esqueci minha senha**.
2. Digite o e-mail da conta.
3. Chega um link (olhe também o Spam). Ele vale por 30 minutos e só pode ser usado uma vez.
4. Crie a senha nova. Por segurança, todos os aparelhos conectados são desconectados.

> Errou a senha muitas vezes? O login pausa por 1 hora para proteger a conta contra robôs. Se não lembra a senha, não precisa esperar: use o "Esqueci minha senha".

## Verificação em duas etapas (recomendado)

Com ela, além da senha, entrar na conta exige um código que muda a cada 30 segundos no seu celular.

1. Instale o **Google Authenticator** (grátis) no celular.
2. No [Painel](/painel), clique no botão vermelho **Quero mais segurança**.
3. No aplicativo, toque em **+** e leia o QR code.
4. Digite o código de 6 números para confirmar.
5. **Anote a chave** que aparece embaixo do QR code num lugar seguro. Com ela você recupera o acesso se trocar de celular.

## O que é a sentinela?

É um vigia automático que confere o site a cada 20 minutos. Se perceber sinais de invasão (por exemplo, alguém que acertou a senha mas erra o código de 2 etapas várias vezes), ele **tranca a conta**, desconecta todos os aparelhos e avisa por e-mail.

Seus arquivos continuam seguros. Para voltar, é só usar o **Esqueci minha senha** e criar uma senha nova: a conta destrava na hora.

## Perdi o celular do código

Se você anotou a chave, cadastre-a de novo no celular novo. Se não anotou, abra um chamado com a nuvenzinha (o chat no canto da tela) a partir do e-mail da conta. Vamos confirmar que é você e desligar a verificação para você ativar de novo.
`
  },
  {
    slug: "portal-do-cliente-para-fotografos",
    titulo: "Para fotógrafos: como entregar álbuns com a sua marca (Portal do Cliente)",
    descricao: "Crie um portal com o nome e a cor do seu estúdio, dê login e senha para cada cliente e entregue as fotos sem depender de Google Drive ou WeTransfer.",
    palavras: "como entregar fotos para cliente, galeria de fotos para fotógrafo, entregar álbum, portal do cliente, fotógrafo de casamento",
    categoria: "Fotógrafos",
    publicar: "2026-10-25",
    leitura: 5,
    corpo: `
Entregar fotos por link de Google Drive funciona, mas tem problemas conhecidos: o espaço é dividido com o seu Gmail, o cliente às vezes precisa de conta Google e o link fica com a cara do Google, não do seu estúdio. O **Portal do Cliente** resolve isso.

## O que o seu cliente vê

Um endereço com o nome do seu estúdio, por exemplo **masternuvem.com.br/p/estudio-aurora**, com a sua cor. O cliente entra com e-mail e senha e vê **só os álbuns dele**. Lá ele:

- vê as fotos em tela cheia;
- marca as **favoritas** com um coração (ótimo para montar o álbum impresso);
- baixa as fotos na qualidade original.

O cliente **não gasta espaço nenhum** e não precisa de conta no Google. Quem usa espaço é só você, do seu plano.

## Passo a passo

1. Com um plano ativo (ou o teste grátis), entre em [Meu portal](/meu-portal).
2. **Seu portal**: escolha o nome do estúdio, o endereço e a cor.
3. **Seus clientes**: crie o acesso (nome, e-mail e senha). O site gera uma senha forte se você quiser e monta a mensagem pronta para mandar no WhatsApp.
4. **Álbuns**: escolha o cliente, o tipo de trabalho (casamento, 15 anos, ensaio, newborn...) e o nome do álbum.
5. Abra o álbum e clique em **Enviar fotos e vídeos**.

## Cobrar pelo portal (opcional)

Em **Acesso e cobranças** você escolhe:

- **Acesso livre**: o cliente vê e baixa tudo, e você combina o pagamento por fora.
- **Cobrar pelo portal**: monte sua tabela de preços (por foto, por edição, por vídeo, por hora...), crie cobranças e, se quiser, **tranque o álbum** até marcar como pago. Com o álbum trancado, o cliente não vê nem baixa as fotos.

> O dinheiro vai **direto para você**, pela sua chave PIX ou pelo link da sua maquininha. A Master Nuvem não fica com nada das suas cobranças.

## Favoritas para o álbum impresso

Dentro do álbum, clique em **Ver favoritas do cliente** e copie a lista com os nomes dos arquivos escolhidos. É só colar no seu programa de diagramação.

## O que ainda vem por aí

Estamos trabalhando em: botão **Baixar tudo** (ZIP), miniaturas mais leves, seleção com limite do pacote para o álbum impresso, pedido de edição por foto e a sua **logo** no portal. Veja a [demonstração dos portais](/portais).
`
  },
  {
    slug: "vender-fotos-de-eventos-e-corridas",
    titulo: "Fotógrafo de corrida, evento e rua: venda fotos com marca d'água e 0% de comissão",
    descricao: "Publique as fotos do evento num link aberto, com marca d'água. A pessoa escolhe, paga no seu PIX e baixa o original quando você confirmar.",
    palavras: "vender fotos de corrida, vender fotos de eventos, fotógrafo de corrida, fotógrafo esportivo, marca d'água, fotos de formatura, venda de fotos online",
    categoria: "Fotógrafos",
    publicar: "2026-10-25",
    leitura: 5,
    corpo: `
Plataformas de venda de fotos esportivas costumam ficar com uma parte de cada foto vendida. Pela própria divulgação das empresas, a comissão varia de cerca de **10%** a até **25%**, dependendo da plataforma e do plano. Na Master Nuvem é diferente: **o dinheiro cai direto no seu PIX**, e você paga só o espaço que usa.

## Como funciona para quem compra

1. A pessoa abre o link do evento, por exemplo **masternuvem.com.br/e/corrida-goiania-2026**.
2. Busca pelo **número de peito** (ou camisa) ou rola a galeria.
3. Toca nas fotos em que aparece. A barra embaixo já mostra o total, com o desconto por quantidade.
4. Coloca nome e e-mail e faz o pedido. Aparece a sua chave PIX.
5. Quando você confirma o pagamento, ela recebe um e-mail e baixa os **originais, sem marca d'água**.

## Como funciona para você

1. Crie o seu portal em [Meu portal](/meu-portal) e cadastre a sua chave PIX em **Acesso e cobranças → Como você recebe**.
2. Entre em [Meu portal → Criar novo → Link aberto](/meu-portal?aba=abertos) e crie o evento: nome, tipo (corrida, futebol, formatura, festa...), data, local e **preço por foto**.
3. Configure o **desconto por quantidade** se quiser. Exemplo: 1 foto por R$ 15; a partir de 5, R$ 10 cada; a partir de 10, R$ 8 cada.
4. Envie as fotos. O **seu navegador** cria uma prévia pequena com a marca d'água (o nome do seu estúdio repetido na diagonal). O original fica guardado e escondido.
5. Marque os números de peito na leva de fotos ou foto por foto.
6. Divulgue o link. Quando chegar um pedido, você recebe um e-mail.
7. Conferiu o PIX? Clique em **✔ Pago** no pedido. Pronto: as fotos são liberadas para a pessoa na hora.

## Por que a marca d'água fica no navegador?

Porque assim o original **nunca** é mostrado antes do pagamento: quem visita a galeria só recebe a prévia pequena com a marca. Mesmo que alguém tire print, o resultado é uma foto pequena e marcada.

## Serve para festas também

Formatura, 15 anos, casamento: o álbum completo dos contratantes continua no Portal do Cliente (com login), e a galeria de evento é para os **convidados** comprarem as próprias fotos.

> Hoje a confirmação do PIX é feita por você, com um clique. O pagamento automático (conectando a sua conta do Mercado Pago ou InfinitePay) está nos planos.
`
  },
  {
    slug: "como-melhoramos-a-master-nuvem",
    titulo: "Como a Master Nuvem é construída: ideias, fontes e como transformamos reclamações em melhorias",
    descricao: "Mostramos as pesquisas e reclamações públicas que usamos para decidir o que construir, e o que já mudou por causa delas.",
    palavras: "alternativa ao google drive, reclamações google one, plataforma de venda de fotos, transparência, melhorias",
    categoria: "Bastidores",
    publicar: "2026-10-25",
    leitura: 6,
    corpo: `
A Master Nuvem nasceu de uma ideia simples: **um espaço na nuvem do tamanho certo, com preço justo e feito para quem trabalha com arquivos**. Para decidir o que construir, a gente lê o que as pessoas reclamam de outros serviços e transforma isso em funcionalidade. Este post mostra o nosso método e as fontes, com transparência.

## Nosso método

1. **Ouvir**: lemos reclamações públicas (Reclame Aqui, matérias e fóruns) e as perguntas que chegam pela nuvenzinha, o assistente do site.
2. **Separar o que é dor real**: o que aparece muitas vezes e afeta o dinheiro ou os arquivos das pessoas.
3. **Construir o mínimo que resolve**, testar e publicar.
4. **Medir de novo**: as perguntas que a nuvenzinha não sabe responder aparecem para a nossa equipe, que ensina a resposta ou melhora o site.

## O que encontramos sobre armazenamento (Google Drive / Google One)

- O espaço do Google é **compartilhado** entre Gmail, Drive e Fotos: quando enche, até o e-mail para. ([Estado de Minas](https://www.em.com.br/trends/2026/04/7403248-google-one-vale-a-pena-em-2026-veja-planos-precos-e-beneficios.html), [TechTudo](https://www.techtudo.com.br/guia/2024/02/google-one-o-que-e-para-que-serve-e-planos-do-servico-por-assinatura-edsoftwares.ghtml))
- Há relatos de **cobrança indevida** e de **pagamento que não liberou o espaço**. ([Reclame Aqui 1](https://www.reclameaqui.com.br/google-brasil/cobranca-triplicada-de-armazenamento-google-one-e-reembolso-negado_u5OspHo2_8IRLGdY/), [Reclame Aqui 2](https://www.reclameaqui.com.br/google-brasil/assinei-o-google-one-mas-o-armazenamento-nao-foi-atualizado_x4VeWTRWB8wjI0AP/))
- Os planos vêm em **degraus fixos**, então muita gente paga por espaço que não usa.

**O que fizemos com isso:** você escolhe o espaço **GB por GB**; **não existe renovação automática** (nada de cobrança surpresa); o plano **ativa sozinho** assim que o PIX cai, com uma tela que confirma na hora; e o seu espaço de trabalho fica **separado do seu e-mail**.

## O que encontramos sobre venda de fotos de eventos

- As plataformas mais conhecidas ficam com **uma comissão de cada foto vendida**: a Banlek divulga 10% no plano grátis; textos do setor citam taxas maiores em outras plataformas. ([JDV](https://www.jdv.com.br/como-a-banlek-funciona/), [Blog Banlek](https://blog.banlek.com/qual-a-melhor-plataforma-para-vender-fotos-online-em-2025-banlek-fotop-fotto-e-foco-radical), [Blog Fotto](https://blog.fotto.com.br/as-taxas-mais-baixas-das-4-principais-plataformas-de-venda-de-fotos-para-fotografos-esportivos-e-eventos/))
- Há relato de fotógrafo que **não recebeu o valor das fotos vendidas**. ([Reclame Aqui](https://www.reclameaqui.com.br/fotop/fotografo-nao-recebe-por-fotos-vendidas-na-plataforma_7oa2gFVPy7CCqCQ4/))

**O que fizemos com isso:** a [galeria de evento](/blog/vender-fotos-de-eventos-e-corridas) com **0% de comissão**: o comprador paga **direto no PIX do fotógrafo**, e a Master Nuvem nunca segura o dinheiro.

## O que encontramos sobre segurança

Contas na nuvem guardam coisas importantes, e senha vazada é um dos problemas mais comuns da internet. **O que fizemos:** verificação em duas etapas, limite de tentativas de login e uma **sentinela** que confere o site a cada 20 minutos e tranca a conta se perceber sinais de invasão. Veja o [passo a passo de segurança](/blog/passo-a-passo-conta-senha-e-seguranca).

## O que vem por aí

Baixar álbum inteiro em ZIP, miniaturas mais leves, logo do estúdio no portal, pagamento automático para fotógrafos e pastas em Meus arquivos. Tem uma ideia ou uma reclamação? Fale com a nuvenzinha no canto da tela: ela abre um chamado e a gente responde em até 48 horas.

> Sobre as fontes: são relatos e matérias públicas, citados como referência do que as pessoas sentem. Não verificamos cada caso individual, e os preços e taxas de outras empresas podem mudar.
`
  },
  {
    slug: "google-drive-cheio-o-que-fazer",
    titulo: "Google Drive cheio? O que fazer e quando vale um espaço só para o seu trabalho",
    descricao: "Por que o aviso de armazenamento cheio aparece, o que dá para liberar sem pagar nada e quando faz sentido separar os arquivos de trabalho.",
    palavras: "google drive cheio, armazenamento cheio, google fotos cheio, liberar espaço google, alternativa ao google drive, gmail cheio",
    categoria: "Dicas",
    publicar: "2026-10-28",
    leitura: 5,
    corpo: `
O aviso "armazenamento cheio" assusta porque, no Google, **o espaço é um só para Gmail, Drive e Google Fotos**. Quando acaba, além de não salvar fotos, você pode parar de receber e-mails.

## Antes de pagar: tente liberar espaço

- **Lixeira do Drive e do Fotos**: arquivos na lixeira ainda ocupam espaço até serem apagados de vez.
- **E-mails com anexos grandes**: no Gmail, pesquise por "larger:10M" e apague o que não precisa mais.
- **Backups esquecidos** de celulares antigos e do WhatsApp.
- **Vídeos longos** no Google Fotos, que costumam ser os maiores vilões.

Às vezes isso já resolve, sem pagar nada.

## Quando vale separar os arquivos de trabalho

Se você é fotógrafo, designer, gráfica, contador ou trabalha com muitos arquivos de clientes, misturar tudo com o seu e-mail pessoal costuma dar problema:

- o trabalho enche o espaço do e-mail (e vice-versa);
- para entregar arquivos, o cliente às vezes precisa de conta Google;
- você paga por degraus fixos de espaço, mesmo usando bem menos.

## Como a Master Nuvem resolve

- Você escolhe o espaço **GB por GB**, de 1 GB a 5 TB, e vê o preço na hora na [calculadora](/#calculadora).
- **Sem renovação automática**: cada pagamento vale 30 dias e você renova quando quiser.
- Para entregar a clientes, o [Portal do Cliente](/blog/portal-do-cliente-para-fotografos) dá login e senha para cada um, sem conta no Google.

> Quer testar antes? Crie a conta e use o teste grátis de 24 horas (20 MB) no [Painel](/painel?cupom=NUVEM1DIA).
`
  },
  {
    slug: "contadores-e-escritorios-documentos-de-clientes",
    titulo: "Para contadores e escritórios: como guardar e entregar documentos de clientes com segurança",
    descricao: "Um espaço separado para os arquivos do escritório, com verificação em duas etapas e acesso individual para cada cliente.",
    palavras: "contador nuvem, guardar documentos de clientes, arquivos do escritório, backup contabilidade, lgpd escritório",
    categoria: "Passo a passo",
    publicar: "2026-10-31",
    leitura: 4,
    corpo: `
Escritórios de contabilidade, advocacia e consultorias lidam com documentos importantes de muitos clientes. Guardar tudo no computador é arriscado (estraga, é roubado, pega vírus) e mandar por e-mail ou WhatsApp espalha cópias por todo lado.

## Guardar: Meus arquivos

1. Contrate o espaço que precisa (dá para começar com poucos GB).
2. Em [Meus arquivos](/arquivos), envie os documentos. Cada arquivo pode ter até 4,5 GB.
3. Para organizar, **compacte em ZIP por cliente ou por mês** antes de enviar (por exemplo, "Cliente X - 2026-10.zip").

> Pastas dentro de Meus arquivos ainda não existem; estão nos planos.

## Entregar para o cliente: Portal do Cliente

O Portal do Cliente foi feito pensando em fotógrafos, mas funciona para qualquer profissional que precisa entregar arquivos:

1. Em [Meu portal](/meu-portal), crie o portal com o nome do escritório.
2. Crie o acesso do cliente (e-mail e senha).
3. Crie um **álbum** para ele (use o tipo "Outro") e envie os arquivos. Cada álbum funciona como uma pasta.
4. O cliente entra com login e senha e vê **só o que é dele**.

## Segurança

- Ative a **verificação em duas etapas** no Painel.
- Nossa sentinela confere o site a cada 20 minutos e tranca a conta se perceber sinais de invasão.
- Cada link de download vale só alguns minutos.

Veja o [passo a passo de segurança](/blog/passo-a-passo-conta-senha-e-seguranca) e a [Política de privacidade](/privacidade).
`
  },
  {
    slug: "designers-e-graficas-arquivos-pesados",
    titulo: "Para designers e gráficas: tire os arquivos pesados (PSD, AI, CDR, RAW) do computador",
    descricao: "Projetos do Photoshop, Illustrator e Corel ocupam muito espaço. Veja como guardar com segurança e liberar o seu HD.",
    palavras: "photoshop, psd, arquivos pesados, backup designer, gráfica, corel, illustrator, onde guardar arquivos",
    categoria: "Dicas",
    publicar: "2026-11-07",
    leitura: 4,
    corpo: `
Arquivos de design crescem rápido: um PSD com muitas camadas passa fácil de 1 GB, e uma gráfica acumula anos de artes de clientes. Quando o HD enche, o computador fica lento, e um defeito pode levar anos de trabalho.

## O que guardar na nuvem

- Projetos finalizados (PSD, AI, CDR, INDD) e as artes aprovadas.
- Fotos RAW e bancos de imagens que você já comprou.
- Pacotes de fontes e materiais de clientes.

## Como enviar

1. Em [Meus arquivos](/arquivos), escolha ou arraste os arquivos.
2. Projetos com muitos arquivos pequenos (links, fontes, imagens) ficam mais organizados se você **compactar em ZIP** antes.
3. Cada arquivo pode ter até 4,5 GB. Maior que isso, divida o ZIP em partes.

## Entregar a arte para o cliente

Use o [Portal do Cliente](/blog/portal-do-cliente-para-fotografos): o cliente recebe login e senha, vê só os arquivos dele e baixa sem precisar de conta no Google. Se quiser, cobre pelo portal e libere os arquivos só depois do pagamento.

## Quanto espaço eu preciso?

Some o tamanho da pasta de projetos do seu computador e deixe uma folga. Veja [quanto espaço eu preciso](/blog/quanto-espaco-eu-preciso) e simule na [calculadora](/#calculadora).
`
  },
  {
    slug: "quanto-espaco-eu-preciso",
    titulo: "Quanto espaço eu preciso? Quantas fotos e vídeos cabem em cada plano",
    descricao: "Uma conta simples para escolher entre GB e TB: quantas fotos de celular, fotos RAW e minutos de vídeo cabem em cada tamanho.",
    palavras: "quantas fotos cabem em 1 gb, quantas fotos cabem em 1 tb, diferença entre gb e tb, quanto espaço preciso, armazenamento",
    categoria: "Dicas",
    publicar: "2026-11-04",
    leitura: 3,
    corpo: `
## GB, TB e MB

- 1 TB (terabyte) = 1.000 GB (gigabytes)
- 1 GB = 1.000 MB (megabytes)

## Conta rápida (aproximada)

- **Foto de celular (JPG)**: cerca de 3 a 5 MB → 1 GB guarda umas **200 fotos**; 1 TB, umas **200 mil**.
- **Foto RAW de câmera**: cerca de 25 a 50 MB → 1 GB guarda de **20 a 40 fotos**.
- **Vídeo Full HD**: cerca de 100 a 150 MB por minuto.
- **Vídeo 4K**: cerca de 350 MB por minuto.
- **Documento PDF**: geralmente menos de 1 MB.

## Exemplos

- **Casamento** com 2.000 fotos RAW (cerca de 40 MB cada) → uns **80 GB**.
- **Corrida** com 3.000 fotos JPG editadas (cerca de 8 MB cada) → uns **24 GB**, mais as prévias com marca d'água, que são bem pequenas.
- **Escritório** com 10 anos de PDFs → muitas vezes cabe em **5 a 20 GB**.

## Dica

Escolha o tamanho com uma folga de 20% e aumente quando precisar: no [Painel](/painel), é só clicar em **Renovar ou aumentar**. Simule o preço na [calculadora](/#calculadora).
`
  },
  {
    slug: "seguranca-dos-seus-arquivos",
    titulo: "Seus arquivos estão seguros? Como a Master Nuvem protege a sua conta",
    descricao: "Bucket privado, links que expiram, verificação em duas etapas, limite de tentativas e a sentinela que vigia o site a cada 20 minutos.",
    palavras: "segurança na nuvem, arquivos seguros, verificação em duas etapas, conta invadida, senha vazada, sentinela",
    categoria: "Segurança",
    publicar: "2026-11-11",
    leitura: 4,
    corpo: `
## Onde os arquivos ficam

Num armazenamento profissional em nuvem, **privado**: nenhum arquivo tem link público. Cada download usa um link temporário que vale só alguns minutos. Detalhes na [Política de privacidade](/privacidade).

## Como a sua conta é protegida

- **Senha embaralhada**: não guardamos a sua senha, só uma versão embaralhada que não dá para desfazer.
- **Verificação em duas etapas**: além da senha, um código do seu celular. Ative no botão vermelho do [Painel](/painel).
- **Limite de tentativas**: depois de muitas senhas erradas, o login pausa por 1 hora. Isso barra robôs que tentam adivinhar senhas.
- **Sentinela**: um vigia automático confere o site a cada 20 minutos. Se perceber sinais de invasão, tranca a conta, desconecta todos os aparelhos e avisa você por e-mail.

## O que você pode fazer

1. Use uma senha que você não usa em nenhum outro site.
2. Ative a verificação em duas etapas e guarde a chave anotada.
3. Desconfie de e-mails pedindo a sua senha: a Master Nuvem **nunca** pede a sua senha por e-mail ou WhatsApp.

## Minha conta foi trancada

É a sentinela protegendo você. Clique em **Esqueci minha senha** na tela de [Entrar](/entrar) e crie uma senha nova: a conta destrava na hora. Passo a passo completo em [conta, senha e segurança](/blog/passo-a-passo-conta-senha-e-seguranca).
`
  },
  {
    slug: "marca-dagua-protege-mesmo",
    titulo: "Marca d'água protege mesmo? O que funciona para não perder venda de fotos",
    descricao: "Marca d'água ajuda, mas não basta. Entenda por que a proteção de verdade é nunca entregar o original antes do pagamento.",
    palavras: "marca d'água, proteger fotos, marca d'água em fotos, cópia de fotos, print de fotos, fotógrafo",
    categoria: "Fotógrafos",
    publicar: "2026-11-14",
    leitura: 4,
    corpo: `
Todo fotógrafo já viu a sua foto circulando sem pagar. A marca d'água é a defesa mais conhecida, mas ela sozinha não resolve.

## O que a marca d'água faz bem

- Deixa claro que a foto **tem dono** e de quem é.
- Desestimula o print: a foto marcada não serve para postar.
- Funciona como **propaganda** do seu trabalho quando a prévia circula.

## O que ela não faz

Hoje existem ferramentas, inclusive de inteligência artificial, que tentam remover marcas d'água. Uma marca pequena num canto é cortada em segundos.

## A proteção de verdade

**Nunca entregar o arquivo original antes do pagamento.** É assim que a [galeria de evento](/blog/vender-fotos-de-eventos-e-corridas) da Master Nuvem funciona:

1. O seu navegador cria uma **prévia pequena** (no máximo 1.400 pixels) com a marca repetida na diagonal, difícil de cortar.
2. Quem visita a galeria **só recebe a prévia**. O original fica guardado e escondido.
3. Depois que você confirma o pagamento, a pessoa baixa o original, na qualidade máxima e sem marca.

Mesmo que alguém remova a marca da prévia, fica com uma foto pequena, que não serve para imprimir nem para um post de qualidade.

> Para álbuns de contrato (casamento, 15 anos), o Portal do Cliente permite **trancar o álbum** até o pagamento: o cliente não vê nem baixa nada antes.
`
  },
  {
    slug: "lgpd-para-fotografos",
    titulo: "LGPD para fotógrafos: cuidados ao guardar e entregar fotos de clientes",
    descricao: "Fotos de pessoas são dados pessoais. Veja cuidados práticos para guardar, entregar e apagar o trabalho dos seus clientes.",
    palavras: "lgpd fotógrafo, lgpd fotos, dados pessoais, direito de imagem, contrato fotógrafo, guardar fotos de clientes",
    categoria: "Fotógrafos",
    publicar: "2026-11-18",
    leitura: 5,
    corpo: `
A foto de uma pessoa é um **dado pessoal** para a Lei Geral de Proteção de Dados (LGPD). Isso não impede o seu trabalho, mas pede alguns cuidados.

> Este texto é informativo e não substitui a orientação de um advogado. Para o seu contrato, consulte um profissional.

## Cuidados práticos

1. **Contrato claro**: diga por quanto tempo você guarda as fotos e como elas serão entregues.
2. **Entregue só para quem é dono**: link aberto do Google Drive pode ser encaminhado para qualquer um. Prefira acesso com login e senha individual, como no [Portal do Cliente](/blog/portal-do-cliente-para-fotografos).
3. **Proteja a sua conta**: ative a verificação em duas etapas. Conta invadida é vazamento das fotos dos seus clientes.
4. **Não guarde para sempre sem motivo**: combine um prazo e apague depois. Na Master Nuvem, apagar um arquivo é definitivo.
5. **Uso em portfólio**: peça autorização por escrito antes de postar fotos de clientes, principalmente de crianças.

## Fotos de eventos abertos (corrida, rua)

Na galeria de evento, as pessoas veem prévias com marca d'água e compram as próprias fotos. Se alguém pedir para tirar uma foto da galeria, atenda: em [Meu portal → Criar novo → Link aberto](/meu-portal?aba=abertos) você apaga qualquer foto com um clique.

## E a Master Nuvem?

Somos o "operador" que guarda os arquivos para você. Explicamos tudo na [Política de privacidade](/privacidade): onde os dados ficam, por quanto tempo e como pedir a exclusão.
`
  },
  {
    slug: "pix-cartao-e-cobranca-sem-comissao",
    titulo: "PIX, cartão e cobrança: como você e seus clientes pagam (sem comissão)",
    descricao: "Como pagar o seu plano no PIX dentro do site, e como o fotógrafo cobra os clientes recebendo direto, sem intermediário.",
    palavras: "pix, pagamento pix, cobrança de clientes, receber pix, fotógrafo cobrança, sem comissão, mercado pago",
    categoria: "Passo a passo",
    publicar: "2026-11-21",
    leitura: 4,
    corpo: `
## Pagar o seu plano

1. No [Painel](/painel), clique em **Contratar** (ou **Renovar ou aumentar**).
2. Escolha os GB e clique em **Pagar com PIX**.
3. Leia o QR code ou copie o código "copia e cola" no app do seu banco.
4. Deixe a tela aberta: ela muda sozinha para **Pagamento confirmado** em poucos segundos.

No app do banco, o recebedor aparece com o nome do titular da Master Nuvem: é normal. Preferiu cartão? Clique em **Prefiro cartão de crédito** e pague na página segura do Mercado Pago.

> Não há cobrança automática. Cada pagamento vale 30 dias.

## Cobrar os seus clientes (fotógrafos)

Na Master Nuvem, **o dinheiro dos seus clientes vai direto para você**. Nós só organizamos quem pagou.

- **Álbuns de contrato**: em [Meu portal](/meu-portal) → Acesso e cobranças, cadastre a sua chave PIX, monte a tabela de preços, crie a cobrança e, se quiser, tranque o álbum até marcar como pago.
- **Fotos de eventos**: em [Meu portal → Criar novo → Link aberto](/meu-portal?aba=abertos), o comprador escolhe as fotos, paga no seu PIX e você libera com um clique. Veja o [guia completo](/blog/vender-fotos-de-eventos-e-corridas).

## Por que não cobramos comissão?

Porque o nosso negócio é o **espaço**. Você paga pelos GB que usa, e o que você vende é seu.
`
  },
  {
    slug: "portfolio-do-fotografo-no-google",
    titulo: "Portfólio do fotógrafo: sua página de vendas no Google, dentro do seu plano",
    descricao: "Monte uma página com as suas melhores fotos, WhatsApp, Instagram e um botão de orçamento, sem pagar site à parte.",
    palavras: "portfolio fotografo, site para fotografo, pagina de fotografo, orcamento fotografia, aparecer no google, link na bio",
    categoria: "Fotógrafos",
    publicar: "2026-11-25",
    leitura: 4,
    corpo: `
Muita gente descobre um fotógrafo pelo Instagram, mas na hora de decidir quer ver **mais trabalhos, num lugar organizado**, e falar com você sem complicação. É para isso que serve o portfólio.

## O que é

Uma página pública com o seu nome, em **masternuvem.com.br/f/seu-estudio**, que qualquer pessoa abre, inclusive pelo Google. Ela mostra:

- uma **capa** grande, com o seu nome e uma frase de destaque;
- **galerias** separadas por tipo de trabalho (Casamentos, 15 anos, Ensaios...);
- o texto **Sobre**, a sua logo e a sua cor;
- botões de **WhatsApp** e **Instagram**;
- o formulário **Pedir orçamento**, que chega direto no seu e-mail.

Não tem custo extra: faz parte do seu plano.

## Como montar em 5 minutos

1. Entre em [Meu estúdio](/meu-portal?aba=portfolio) e clique em **🌟 Portfólio**.
2. Clique em **➕ Nova galeria** e dê um nome, por exemplo "Casamentos".
3. Clique em **⬆️ Enviar fotos** e escolha as suas melhores. O site reduz as fotos no seu navegador antes de enviar: ficam leves e **não são o original**.
4. Toque na **⭐** da foto que vai ser a capa.
5. Em **Textos e contatos**, preencha a frase de destaque, a cidade, o WhatsApp e o Instagram.
6. Clique em **🚀 Colocar no ar** e depois em **Abrir minha página**.

> Escolha poucas e boas. Cada galeria aceita até 60 fotos, mas 15 a 25 fotos fortes vendem mais do que 60 parecidas.

## Pedidos de orçamento

Quando alguém preenche o formulário, o pedido aparece na aba **Orçamentos** com um 🔴 e chega no seu e-mail. Dali dá para responder pelo WhatsApp com uma mensagem já pronta.

## Dicas para aparecer mais

- Coloque o link na **bio do Instagram** e no seu **Perfil da Empresa no Google**.
- Use na frase de destaque o que as pessoas procuram: "Fotografia de casamento em Goiânia" funciona melhor do que só o nome do estúdio.
- Atualize as galerias a cada trabalho novo que você ama.

A página só fica no ar enquanto o seu plano está ativo e tem pelo menos uma foto.
`
  },
  {
    slug: "contrato-de-fotografia-assinado-online",
    titulo: "Contrato de fotografia assinado online: como funciona e o que ele registra",
    descricao: "Mande o contrato pelo site, o cliente assina pelo celular com um código no e-mail e os dois recebem o comprovante.",
    palavras: "contrato fotografia, contrato de casamento fotografo, assinatura online, assinar contrato pelo celular, contrato digital",
    categoria: "Fotógrafos",
    publicar: "2026-12-02",
    leitura: 5,
    corpo: `
Imprimir, levar para assinar, escanear e guardar: o contrato de papel dá trabalho e às vezes nem volta. Na Master Nuvem o contrato vai pelo link e é assinado no celular do cliente.

## Como mandar

1. Em [Meu estúdio](/meu-portal), clique em **📝 Contratos**.
2. Escolha um modelo (casamento, 15 anos e festas, ensaio, vídeo, contador ou em branco) e o cliente.
3. O texto já vem preenchido com os dados do cliente, do estúdio e as regras do álbum (quantas fotos estão incluídas e o preço da foto a mais).
4. Revise, mude o que quiser e clique em **Enviar**. O cliente recebe por e-mail, e você ainda pode mandar o link pelo WhatsApp.

Dá para salvar os seus próprios textos em **⭐ Meus modelos**.

## Como o cliente assina

1. Abre o link e lê o contrato.
2. Coloca o nome completo e o CPF ou CNPJ. O site confere se os números são válidos.
3. Marca **"Li e concordo"**.
4. Digita o código de 6 números que chegou no e-mail dele.

Pronto: os dois recebem um e-mail de confirmação, e o contrato fica com o botão **📄 Baixar PDF**.

## O que fica registrado

O comprovante guarda a **data e a hora**, o **e-mail** que recebeu o código, o **IP** e o **navegador** usados e uma "impressão digital" do texto (um código que muda se qualquer letra do contrato for alterada depois).

## Mais de uma pessoa

Casamento tem dois noivos; 15 anos tem os pais. Você pode colocar várias pessoas para assinar, cada uma com o próprio link e código, e escolher a regra: **todos** precisam assinar para liberar as fotos, **basta um**, ou **nenhum** trava as fotos.

Se a contratante for menor de idade, quem assina são os responsáveis, e o contrato ganha uma cláusula própria para isso.

## Contrato antes das fotos

Ligando a opção de contrato obrigatório, o cliente só vê o álbum depois de assinar. Ao entrar, ele vê o aviso "Antes de ver suas fotos, assine o contrato".

> Os modelos são um ponto de partida e não substituem a orientação de um advogado. Se o seu trabalho tem regras próprias (multa, remarcação, direito de imagem), ajuste o texto antes de enviar.
`
  },
  {
    slug: "quanto-custa-guardar-1-tb",
    titulo: "Quanto custa guardar 1 TB? Google Drive, Dropbox e Master Nuvem lado a lado",
    descricao: "Uma comparação honesta: quando um plano pessoal resolve e quando vale um espaço feito para trabalhar com clientes.",
    palavras: "quanto custa 1 tb, google one preço, dropbox preço, armazenamento em nuvem barato, nuvem para fotografo, comparação nuvem",
    categoria: "Dicas",
    publicar: "2026-12-09",
    leitura: 4,
    corpo: `
Se o seu espaço acabou, a primeira ideia é pagar mais no serviço que você já usa. Às vezes é o certo. Às vezes não.

## Como os grandes cobram

Google Drive (Google One) e Dropbox vendem **planos fixos**: você escolhe um degrau (100 GB, 2 TB...) e paga por ele, use ou não. Os preços mudam com frequência, então confira o valor atual no site de cada um antes de decidir.

Eles são ótimos para **uso pessoal**: fotos da família, documentos, celular.

## Como a Master Nuvem cobra

Você escolhe **exatamente quantos GB** quer, de 1 GB até 5 TB, e paga só por isso. Alguns exemplos de preço por mês:

- **100 GB**: R$ 10,40
- **1 TB**: R$ 59,00
- **5 TB**: R$ 299,00

O valor de qualquer tamanho aparece na hora na [calculadora da página inicial](/#calculadora). O pagamento é no PIX ou no cartão, sem renovação automática.

## Então qual escolher?

Se você só quer guardar as suas coisas, um plano pessoal de um serviço grande pode sair mais barato. Somos honestos sobre isso.

A diferença aparece quando o espaço é **para trabalhar com clientes**:

- o seu cliente entra num **portal com a sua marca**, sem precisar de conta no Google;
- cada cliente vê **só a pasta dele**, com prazo de acesso e limite de downloads;
- dá para **cobrar foto extra**, mandar **contrato para assinar** e **vender fotos de eventos** sem comissão;
- você tem um **portfólio público** para receber pedidos de orçamento.

Tudo isso entra no preço do espaço. Veja o [guia do Portal do Cliente](/blog/portal-do-cliente-para-fotografos).

> Dá para testar antes: o teste grátis libera um espaço pequeno por 24 horas, sem cartão.
`
  },
  {
    slug: "organizar-e-entregar-fotos-de-casamento",
    titulo: "Como organizar e entregar as fotos de um casamento sem dor de cabeça",
    descricao: "Um roteiro do cartão de memória até o casal baixar as fotos: pastas, seleção, prazo, favoritas e edição.",
    palavras: "entregar fotos de casamento, organizar fotos casamento, galeria para clientes, seleção de fotos, prazo de entrega fotografo",
    categoria: "Fotógrafos",
    publicar: "2026-12-16",
    leitura: 5,
    corpo: `
Um casamento rende milhares de arquivos. Sem um caminho definido, a entrega vira uma maratona de WhatsApp. Este é um roteiro simples que funciona.

## 1. No dia seguinte: copie e duplique

- Copie os cartões para o computador numa pasta com **data e nome do casal** (ex.: "2026-12-12 Ana e Pedro").
- Faça uma **segunda cópia** fora do computador (HD externo ou nuvem) antes de formatar qualquer cartão.

## 2. Separe por momentos

Dentro da pasta: making of, cerimônia, retratos, festa. Fica mais fácil editar e o casal acha o que quer.

## 3. Crie o álbum do casal

Em [Meu estúdio](/meu-portal) → **➕ Criar novo** → **Link fechado**, o passo a passo pergunta uma coisa por vez:

- **Prazo** de acesso (por exemplo, 60 dias);
- se o casal pode **escolher favoritas** e até quantas (ótimo para a seleção do álbum impresso);
- se pode **pedir edição** e em quantas fotos;
- se pode **baixar**, quantas vezes por foto e quantas fotos no total;
- se precisa **assinar o contrato** antes de ver.

Os dois noivos podem ter **acesso próprio**, cada um com o seu login.

## 4. Envie e deixe o site trabalhar

Ao enviar, o seu navegador cria uma **prévia leve** de cada foto. O casal navega rápido pelas prévias e só baixa o original quando você liberar.

## 5. Acompanhe sem perguntar

Na central do Meu estúdio você vê quem já entrou, quantas fotos baixou, quais escolheu e quais pedidos de edição chegaram.

> Mande o link pelo botão de WhatsApp do álbum: a mensagem já vai pronta, sem a senha. O casal cria a própria senha no primeiro acesso.
`
  },
  {
    slug: "backup-regra-3-2-1-para-fotografos",
    titulo: "Backup do jeito certo: a regra 3-2-1 para quem vive de fotos e vídeos",
    descricao: "Três cópias, dois tipos de lugar, uma fora de casa. Como aplicar sem gastar muito.",
    palavras: "backup de fotos, regra 3-2-1, hd externo, perder fotos, cópia de segurança, backup fotografo",
    categoria: "Dicas",
    publicar: "2026-12-23",
    leitura: 4,
    corpo: `
HD queima, notebook é roubado, cartão corrompe. Quem trabalha com fotos de clientes não pode depender de uma cópia só.

## A regra

- **3 cópias** de cada trabalho importante;
- em **2 tipos** de lugar diferentes (por exemplo, computador e HD externo);
- **1 cópia fora de casa** (na nuvem ou em outro endereço).

## Um jeito simples de montar

1. **Cópia 1:** o computador onde você edita.
2. **Cópia 2:** um HD externo, atualizado toda semana.
3. **Cópia 3:** a nuvem, que fica longe de roubo, incêndio e queda de energia.

Na Master Nuvem os arquivos ficam em data centers profissionais, com criptografia e redundância (cada arquivo é guardado em vários discos ao mesmo tempo).

## Erros comuns

- **Sincronizar não é backup.** Se você apaga no computador e a pasta sincroniza, apaga nos dois lugares.
- **Nunca testar a cópia.** De vez em quando, abra um arquivo antigo do backup para ver se está inteiro.
- **Formatar o cartão cedo demais.** Só formate depois que existirem duas cópias.

## E quando o plano vence?

Na Master Nuvem não existe renovação automática. Se o plano vencer, o envio de arquivos novos para, mas os seus arquivos ficam guardados por **15 dias** para você renovar ou baixar, e você recebe avisos por e-mail antes. Veja os [Termos de uso](/termos).

> Quanto espaço você precisa? Veja [quantas fotos e vídeos cabem em cada plano](/blog/quanto-espaco-eu-preciso).
`
  },
  {
    slug: "vender-fotos-de-formatura-e-eventos-de-fim-de-ano",
    titulo: "Formaturas e eventos de fim de ano: como vender as fotos por foto, sem comissão",
    descricao: "Galeria aberta com marca d'água, busca por número, preço por foto com desconto e pagamento direto no seu PIX.",
    palavras: "vender fotos de formatura, fotos de evento, vender fotos online, preço por foto, desconto por quantidade, fotografo de eventos",
    categoria: "Fotógrafos",
    publicar: "2026-12-30",
    leitura: 4,
    corpo: `
Formatura, confraternização, apresentação de fim de ano: muita gente quer as fotos, e cada pessoa quer só as dela. Vender por foto resolve.

## Como funciona

1. Em [Meu estúdio](/meu-portal?aba=abertos) → **➕ Criar novo** → **Link aberto**, dê um nome ao evento e defina o **preço por foto**.
2. Se quiser, crie **faixas de desconto** (por exemplo, a partir de 10 fotos o preço cai).
3. Envie as fotos. O seu navegador cria uma **prévia com marca d'água** de cada uma; o original nunca aparece antes do pagamento.
4. Divulgue o link no grupo da turma ou da empresa.

## O que o comprador faz

- Abre o link, procura as fotos em que aparece e, quando você cadastra números (de camisa, de peito), busca pelo número.
- Escolhe as fotos, vê o total já com o desconto e faz o pedido.
- Paga no **seu PIX** (ou no seu link de pagamento).

## O que você faz

Quando o dinheiro cair na sua conta, clique em **✔ Pago**. O comprador recebe um e-mail e baixa as fotos **sem marca d'água**.

## Por que sem comissão?

O dinheiro vai direto para você. A Master Nuvem cobra só o espaço que as fotos ocupam. Leia também [se a marca d'água protege mesmo](/blog/marca-dagua-protege-mesmo).

> Precisa emitir nota? Ligue a opção de nota fiscal e o pedido já pede o CPF ou CNPJ de quem compra. Quem emite a nota é você.
`
  },
  {
    slug: "como-cobrar-foto-extra-do-cliente",
    titulo: "Como cobrar foto extra do cliente sem constrangimento",
    descricao: "Defina quantas fotos estão no pacote, o preço da foto a mais e deixe o site fazer a conta e o pedido.",
    palavras: "foto extra, cobrar fotos extras, pacote de fotos, fotografo cobrança, limite de fotos, vender mais fotos",
    categoria: "Fotógrafos",
    publicar: "2027-01-06",
    leitura: 4,
    corpo: `
O cliente ama as fotos e quer mais do que o pacote. Ótimo! O problema é pedir o dinheiro sem parecer chato. A saída é deixar a regra clara desde o começo.

## Combine antes

No contrato e na conversa de venda, diga quantas fotos estão incluídas e quanto custa cada foto a mais. Os [modelos de contrato](/blog/contrato-de-fotografia-assinado-online) já trazem esses números das regras do álbum.

## Configure no álbum

Ao criar o álbum (ou na aba **Regras**), em **Baixar**:

- **Limite de fotos**: quantas fotos diferentes o cliente pode baixar (baixar de novo a mesma não conta);
- **Cobrar as fotos a mais**: o preço de cada uma;
- **Desconto por quantidade**: se quiser, o preço cai a partir de um número de fotos.

## O que o cliente vê

Ao chegar no limite, o site avisa e oferece **pedir fotos a mais**. Ele escolhe quantas, vê o valor já com desconto, e o pedido vira uma cobrança com o seu PIX ou link de pagamento.

Você recebe um **e-mail** avisando. Quando o pagamento cair, marque como **pago** e as fotos extras são liberadas na hora.

## Por que funciona

- O cliente vê a regra na tela, não precisa ouvir de você.
- Ninguém esquece de cobrar, e ninguém baixa sem pagar.
- O desconto por quantidade incentiva a levar mais.

> Comece com um preço por foto que você ficaria feliz em receber muitas vezes. É melhor vender 30 fotos extras com desconto do que 3 caras.
`
  },
  {
    slug: "planejamento-2027-para-fotografos",
    titulo: "Planejamento 2027 para fotógrafos: arquivos, clientes e vendas em ordem",
    descricao: "Uma lista curta para começar o ano organizado: limpar arquivos, revisar backup, contratos, preços e portfólio.",
    palavras: "planejamento fotografo, organizar arquivos, metas 2027 fotografia, checklist fotografo, como conseguir mais clientes fotografia",
    categoria: "Dicas",
    publicar: "2027-01-13",
    leitura: 4,
    corpo: `
Janeiro é o melhor mês para arrumar a casa antes da temporada. Uma tarde com esta lista economiza semanas no resto do ano.

## Arquivos

- Apague **duplicadas e fotos descartadas** dos trabalhos já entregues.
- Confira se todo trabalho de 2026 tem a **cópia fora de casa**. Veja a [regra 3-2-1](/blog/backup-regra-3-2-1-para-fotografos).
- Veja quanto espaço você usa de verdade e ajuste o plano. Dá para **aumentar e pagar só os dias que faltam**: veja [como aumentar o espaço](/blog/aumentar-espaco-so-pelos-dias).

## Clientes e privacidade

- Defina **por quanto tempo** você guarda as fotos de cada cliente e avise isso no contrato.
- Revise quem ainda tem acesso a álbuns antigos. Leia os [cuidados de LGPD para fotógrafos](/blog/lgpd-para-fotografos).

## Contratos e preços

- Atualize o seu **modelo de contrato** com as regras de 2027.
- Revise a **tabela de preços**: pacote, foto extra, edição, deslocamento.

## Vendas

- Atualize o **portfólio** com os melhores trabalhos do ano. Veja [como montar o seu](/blog/portfolio-do-fotografo-no-google).
- Peça **avaliação no Google** para os clientes satisfeitos de 2026.
- Planeje os eventos da temporada (formaturas, festas) e [como vender as fotos por foto](/blog/vender-fotos-de-formatura-e-eventos-de-fim-de-ano).

> Escolha uma meta só para o primeiro trimestre, por exemplo "10 pedidos de orçamento por mês pelo portfólio", e acompanhe toda semana.
`
  }
];
