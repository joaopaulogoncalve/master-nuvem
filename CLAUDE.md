# Master Nuvem — Guia de contexto (leia isto ANTES de qualquer coisa)

> Documento de passagem de bastão. Quem ler (humano ou Claude) não precisa pesquisar de novo:
> aqui está o que o projeto é, como está montado, o que já funciona e o que falta.
> **Nunca escreva senhas, tokens ou chaves em arquivos.** Só os NOMES dos segredos ficam documentados.

## 1. O que é o projeto
Site de **revenda de armazenamento em nuvem** do João Paulo. O cliente escolhe quantos GB quer (1 a 5000 GB),
vê o preço na hora, paga por PIX/cartão (Mercado Pago), cria conta e envia/baixa arquivos num painel.
Os arquivos ficam no Backblaze B2 (barato); o João revende com margem.

- Preço de referência: **R$ 59 por TB** (≈ R$ 0,054/GB + base de R$ 5). Mínimo R$ 9,90. Planos até 5 TB.
- Taxas do Mercado Pago: PIX ≈ 0,99%, cartão ≈ 4,99% (considerar na margem).
- Idioma do site e das mensagens: **português do Brasil**.

## 2. Arquitetura (tudo na Cloudflare, sem servidor próprio)
```
Navegador ──► Cloudflare Worker (src/worker.js)
               ├─ /api/*  → lógica (login, 2FA, checkout, arquivos)
               └─ resto   → arquivos estáticos de /public (binding ASSETS)
Worker ──► D1 (SQLite) binding DB  → usuários, sessões, planos, arquivos
Worker ──► Mercado Pago (REST)     → cria link de pagamento (Checkout Pro)
Navegador ◄──► Backblaze B2 (S3)   → upload/download DIRETO por URL assinada (o Worker só assina)
```
- `wrangler.jsonc`: nome `master-nuvem`, entrada `src/worker.js`, assets em `./public`, D1 `master-nuvem-db`
  (id `b60c217f-b668-4f05-a94a-ba8a8620f085`), observability ligada.
- Sem framework, sem build: JS puro nos dois lados. Tailwind via CDN no front.
- Domínio: **masternuvem.com.br** (Registro.br, DNS na Cloudflare: brit/carlos.ns.cloudflare.com).
  `masternuvem.com.br` e `www.` ligados ao Worker como Custom Domains pela API em 2026-10-21 (não estão no `wrangler.jsonc`).
- E-mail: **contato@masternuvem.com.br** → `masternuvem.contato@gmail.com` (Cloudflare Email Routing, só recebe; testado em 2026-10-23).
  Novos endereços: regra em Email → Email Routing (ou API). Responder como @masternuvem.com.br ainda não está configurado.
- Google Search Console: propriedade de domínio `masternuvem.com.br` verificada pela Cloudflare (registro TXT `google-site-verification`, não apagar)
  e `https://masternuvem.com.br/sitemap.xml` enviado em 2026-10-26 (conta Google do João).
- Deploy: `npx wrangler deploy` (ou integração Git da Cloudflare com o repositório `master-nuvem` no GitHub).

## 3. Segredos / variáveis (só nomes; valores ficam na Cloudflare → Settings → Variables and Secrets)
| Nome | Para quê |
|---|---|
| `MP_ACCESS_TOKEN` | Token do Mercado Pago (checkout e consulta de pagamentos no webhook). Token **definitivo** (de produção) gravado; PIX real testado em 2026-10-25. |
| `RESEND_API_KEY` | **2026-10-26: a chave antiga estava inválida (Resend 401 Malformed access token) e nenhum e-mail saía; chave nova `site-master-nuvem` gravada e testada (Delivered).** Para conferir erros de e-mail: `npx wrangler tail master-nuvem`. Envio de e-mail (Resend, remetente `nao-responda@masternuvem.com.br`). Gravar com `scripts\segredo.ps1 -Nome RESEND_API_KEY` |
| `MP_WEBHOOK_SECRET` | Opcional. Se existir, o webhook exige a assinatura `x-signature` do MP. Só criar depois de confirmar que os avisos chegam assinados (senão nenhum plano ativa). A segurança principal é consultar o pagamento na API. |
| `B2_KEY_ID` | ID da chave de aplicação do Backblaze (`site-master-nuvem`, só o bucket, Read and Write). A Master Key **não** funciona na API S3. Trocar: `scripts\b2-chave-site.ps1 -KeyId 005...` |
| `B2_APP_KEY` | Chave secreta do Backblaze |
| `B2_BUCKET` | `master-nuvem-cliente` (bucket **privado**) |
| `B2_ENDPOINT` | `s3.us-east-005.backblazeb2.com` (a região é extraída do 2º pedaço do host) |

Local: usar `.dev.vars` (no `.gitignore`!) para rodar `wrangler dev`. Nunca commitar.

## 4. Arquivos do repositório
| Arquivo | Função |
|---|---|
| `src/worker.js` | Roteador. Auth (cadastro, login, logout, `/api/me`), 2FA TOTP, `/api/checkout`, delega `/api/files*` |
| `src/arquivos.js` | Arquivos: lista, URL assinada de upload/download (AWS SigV4 feito à mão com WebCrypto), conclusão, exclusão, cota |
| `src/portal.js` | Portal do Cliente: rotas do fotógrafo (`/api/portal*`) e do cliente final (`/api/p/*`) |
| `public/meu-portal.html` / `portal-cliente.html` / `portais.html` | Tela do fotógrafo / tela do cliente final (`/p/<slug>`) / vitrine dos ramos |
| `public/index.html` + `app.js` | Página de vendas: slider de GB, chips, preço em tempo real, botão de pagamento |
| `public/entrar.html` | Login / criar conta (abas) + etapa do código 2FA |
| `public/painel.html` | Painel: saudação, selo "Administrador", ativar/desativar 2FA (QR), link p/ arquivos |
| `public/arquivos.html` | Gerenciador: uso/cota, upload (várias vezes, com progresso), lista, baixar, apagar |

## 5. API (todas em `/api/...`, JSON)
| Rota | Método | Auth | O que faz |
|---|---|---|---|
| `/api/register` | POST | não | `{email,senha,nome}` → cria usuário (senha 8–100) e já loga |
| `/api/login` | POST | não | `{email,senha}` → cookie de sessão, ou `{need2fa:true}` com sessão pendente de 10 min |
| `/api/login/2fa` | POST | sessão pendente | `{codigo}`; máx. 5 tentativas; anti-replay via `totp_last` |
| `/api/logout` | POST | sim | apaga sessão |
| `/api/senha/esqueci` | POST | não | `{email}` → sempre `{ok}`; se a conta existe, grava hash do token em `password_resets` (30 min, máx. 3/hora) e manda link `/redefinir?token=` pelo Resend |
| `/api/senha/redefinir` | POST | token | `{token,senha}` → troca a senha, derruba todas as sessões e invalida outros links |
| `/api/me` | GET | sim | `{email,nome,role,totp}` |
| `/api/2fa/setup` | POST | sim | gera segredo e URI `otpauth://` |
| `/api/2fa/enable` | POST | sim | confirma com 1º código |
| `/api/2fa/disable` | POST | sim | exige senha + código |
| `/api/checkout` | POST | sim | `{gb}` → grava pedido `subscriptions` `pending`, cria preferência no MP (`external_reference` = id do pedido, `notification_url` = webhook), devolve `{init_point}`. Sem login: 401 `{login:true}` |
| `/api/mp/webhook` | POST | não (MP) | Aviso do MP. Consulta o pagamento na API do MP; `approved` + valor certo → plano `active` por 30 dias (mesmo tamanho soma dias; outro tamanho começa hoje; anteriores viram `replaced`). Estorno → `cancelled` |
| `/api/admin/clientes` | GET | admin | clientes com plano ativo, uso e nº de arquivos + `receita_mensal` estimada (sem planos manuais) |
| `/api/admin/backblaze` | GET | admin | lista o bucket (S3 ListObjectsV2) e soma bytes; custo B2 (US$ 6,95/TB, 10 GB grátis, constantes no topo do worker) em US$/R$ (dólar AwesomeAPI, reserva 5,5); espaço vendido; diferença bucket × site = objetos órfãos |
| `/api/admin/plano` | POST | admin | `{user_id,gb,dias}` → plano manual `active` (`mp_payment_id='manual:<adminId>'`); anteriores viram `replaced` |
| `/api/admin/plano/remover` | POST | admin | `{user_id}` → planos ativos viram `cancelled` (arquivos ficam) |
| `/api/files` | GET | sim | `{plano,quota_bytes,usado_bytes,max_arquivo,arquivos[]}` |
| `/api/files/upload-url` | POST | sim | `{name,size}` → registra `pending` e devolve URL PUT assinada (1 h) |
| `/api/files/complete` | POST | sim | `{id}` → faz HEAD no B2, confere tamanho real/cota, marca `ready` |
| `/api/files/download?id=` | GET | sim | URL GET assinada (5 min) com `Content-Disposition` |
| `/api/files/delete` | POST | sim | apaga no B2 e no D1 |

Segurança já implementada: PBKDF2-SHA256 100k iterações + salt; sessão = cookie `sessao` (HttpOnly, Secure, SameSite=Lax),
no banco só o **hash** SHA-256 do token; checagem de `Origin` nos POST; comparação em tempo constante;
chaves de objeto aleatórias `u{userId}/{hex}`; bucket privado; cota verificada antes e depois do upload.

## 6. Banco D1
Esquema versionado em `migrations/0001_init.sql`, copiado do banco real de produção em 2026-10-21.
Tabelas: `users`, `sessions`, `subscriptions`, `files`. Detalhes que importam:
`users.role` padrão é `'client'` (admin = `'admin'`); `subscriptions.status` padrão é `'pending'`,
`paid_until` pode ser nulo e `mp_payment_id` já existe (usar no webhook); `files.object_key` é UNIQUE.
Mudança nova no banco → criar `migrations/0002_....sql` (nunca editar a 0001).
Atenção: a tabela `d1_migrations` da produção ainda não marca a 0001 como aplicada; antes do primeiro
`wrangler d1 migrations apply --remote`, confirmar com o João (a 0001 usa `IF NOT EXISTS`, então é inofensiva).
Conferir o esquema real: `npx wrangler d1 execute master-nuvem-db --remote --command "SELECT name, sql FROM sqlite_master"`.

## 7. Estado atual
**Funciona (testado):** site de vendas com cálculo de preço; checkout abre o Mercado Pago; cadastro/login; conta admin criada;
código de 2FA pronto (admin ainda **sem** 2FA ativado); fluxo de arquivos implementado (upload direto ao B2, cota, download, apagar).

**Atualização 2026-10-24:** os itens 1, 2, 3, 6 e 10 abaixo foram resolvidos (pagamento automático por webhook, login no
checkout, ciclo de 30 dias com avisos, 2FA do admin ativado, limpeza por Cron). Veja a seção 9 para o que falta.

**Lacunas conhecidas (por prioridade, histórico):**
1. **Pagamento não vira plano.** `/api/checkout` não grava nada e não há webhook. A tabela `subscriptions` só é preenchida à mão,
   então cliente que paga continua "sem plano". Falta: ligar o pedido ao usuário logado (exigir login no checkout, enviar
   `external_reference = userId:gb`, `notification_url = /api/mp/webhook`), criar o webhook (validar assinatura/consultar o pagamento
   na API do MP, nunca confiar no corpo), inserir/renovar `subscriptions` (`status='active'`, `paid_until`, `quota_gb`).
2. **Checkout sem login** — qualquer um gera link; decidir se exige conta antes de pagar (recomendado).
3. **Renovação/expiração** — mensal? Definir ciclo, aviso de vencimento, e o que acontece com arquivos após `paid_until` (bloqueio de upload já existe; download/retenção não).
4. ~~**CORS do bucket B2**~~ Resolvido em 2026-10-23 com `scripts\b2-cors.ps1` (regra personalizada: PUT/GET/HEAD para masternuvem.com.br, www e workers.dev).
   **Não salvar nada na tela "Regras do CORS" do Backblaze**: ela só libera download e apaga a regra personalizada.
   Upload/download testados no site com sucesso.
   **Ciclo de vida do bucket: "Manter somente a última versão"** (desde 2026-10-23). Antes havia uma regra que ESCONDIA todo arquivo 1 dia após o envio — nunca usar regra com "Dias até ocultar" sem prefixo. Erro de chave no B2 aparece no navegador como "Falha de conexão... CORS".
5. **Painel admin** — `/admin` (link no painel para `role='admin'`): lista clientes, plano, uso, receita estimada; dar/trocar/remover plano manual.
   Falta: bloquear conta, apagar cliente, ver arquivos do cliente. Recomendado exigir 2FA para admin.
6. **Ativar 2FA no admin** antes de vender de verdade.
7. ~~Sem recuperação de senha~~ "Esqueci minha senha" no ar desde 2026-10-23 (Resend, tabela `password_resets` via `migrations/0002`, aplicada com `d1 execute --remote --file`). Sem verificação de e-mail; **sem rate-limit** em login/cadastro (só o 2FA tem limite). Considerar Cloudflare Turnstile.
8. **Preço duplicado** em `app.js` e `worker.js` (`calcularPreco`). O servidor é a fonte da verdade; manter igual ou expor o preço por endpoint.
9. Arquivo máx. 4,5 GB (upload simples PUT). Maior que isso exige multipart upload.
10. Limpeza: registros `pending` antigos só são apagados na próxima tentativa de upload do próprio usuário (e o objeto órfão no B2 não é removido) — criar tarefa agendada (Cron Trigger).
11. `/termos` e `/privacidade` (LGPD) criadas em 2026-10-23: plano de 30 dias sem renovação automática, arquivos guardados
    **15 dias** após o vencimento e depois podem ser apagados, reembolso só nos 7 dias do CDC, foro Goiânia-GO.
    Cadastro exige aceite (`users.terms_accepted_at`, `migrations/0003`). WhatsApp: (62) 98284-6067.
12. **Limpeza automática** (`scheduled` no worker, Cron `0 * * * *`, função `limpeza`): e-mails "vence em 3 dias", "venceu"
    e "último aviso" (3 dias antes de apagar), registrados em `avisos` (`migrations/0004`) para não repetir; apaga arquivos de
    quem está sem plano há 15+ dias (nunca admin; "fim" = maior `paid_until` entre active/replaced/cancelled — cancelar grava
    `paid_until = agora`); apaga envios `pending` com 1+ dia; faxina de sessões, links de senha e pedidos abandonados.
    **Apagar arquivos de cliente só acontece com a variável `APAGAR_ARQUIVOS = "sim"`**; sem ela fica em modo teste (só log).
    Limites por rodada: 10 e-mails e 30 exclusões (plano grátis = 50 subrequests).
    Se mudar regra de cobrança/retenção no código, atualizar os textos também.

**Ideias futuras:** **Respostas rápidas do WhatsApp Business** (pedido do João em 2026-10-26: saudação e ausência já configuradas no app; faltam os atalhos `/preco`, `/teste`... Vão ser muitas: dá para gerar a lista a partir das 68 respostas da Nuvenzinha, tabela `faq`, e o João cadastra no app em Ferramentas → Respostas rápidas); **Portal do contador** (pedido do João em 2026-10-25, anotado, não feito): arquivos compartilhados entre o contador e os clientes dele (ex.: supermercados), cada cliente com a sua pasta (notas, guias, extratos por mês), e no futuro uma API para os sistemas contábeis enviarem/buscarem documentos sozinhos; bot de WhatsApp para suporte/venda; "Fase 2" com HD/NAS próprio para baratear; planos pré-definidos além do slider; e-mails transacionais.

## 8. Como trabalhar neste projeto (regras para o Claude da pasta local)
1. Responda **em português**, passo a passo, com blocos de código simples; o João não é programador de carreira.
2. Rode primeiro `git status` e leia este arquivo. Não pesquise o que já está aqui.
3. Mudanças pequenas e testáveis; explique o que mudou em 2–3 linhas.
4. **Testes automáticos:** `node tests/rodar.mjs` (28 grupos, banco SQLite em memória + Mercado Pago/B2/Resend simulados; nada toca a produção). Rodar antes de todo deploy. Teste novo: copiar um `tests/teste-*.mjs` parecido.
   Testar local: `npx wrangler dev` (precisa de `.dev.vars`). Banco local: `--local`; produção: `--remote` (**confirmar antes de mexer em produção**).
5. Nunca imprimir, commitar ou pedir para colar segredos no chat. Novo segredo → `npx wrangler secret put NOME`.
6. Não quebrar o que funciona (login, cota, URLs assinadas). Qualquer mudança em preço/cobrança: mostrar a conta antes.
7. Estilo do código: funções em português, `var`/`function` simples, sem dependências novas sem necessidade.
8. Commits só quando o João pedir.

## 9. Próximos passos (ordem combinada com o João em 2026-10-24)
Já feito: migrations, pagamento automático (webhook), CORS/chave/ciclo de vida do B2, 2FA do admin, painel admin,
recuperação de senha, Termos/Privacidade, limpeza automática (modo teste), botão Entrar. Tudo no PR #1.

1. ~~Trocar o token do Mercado Pago~~ Feito: token definitivo gravado e PIX real testado (2026-10-25).
2. ~~Contador/CNAE~~ Resolvido (2026-10-25): o João tem CNAE de e-commerce e o contador confirmou que o serviço se enquadra. Não tocar mais nesse assunto.
3. **Depois dos primeiros clientes pagantes:** ligar o apagamento de verdade (`APAGAR_ARQUIVOS = "sim"` como variável do Worker),
   só depois de ver um ciclo completo de avisos (vence → venceu → último aviso) funcionando em modo teste.
4. **Depois: Portal do Cliente** (fotógrafos, gráficas, contadores). Ideia do João: cada assinante tem um espaço com a cara dele
   (logo, cor, modelo por profissão), cria os próprios clientes com login e senha, e cada cliente só vê a pasta dele; o espaço
   gasto é só o do assinante. Versões: v1 = clientes + pastas + login do cliente final; v2 = modelos por profissão
   (galeria de fotos, aprovação de arte, pastas por mês); v3 = domínio próprio do assinante. Argumento de venda:
   "seu cliente não precisa de conta no Google nem de espaço próprio, e entra num portal com a sua marca".
   **v1 de fotografia e vídeo feita em 2026-10-24** (`src/portal.js`, `migrations/0005_portal.sql`):
   - Tabelas: `portais` (1 por assinante, `slug` único), `portal_clientes` (login próprio, PBKDF2), `albuns` (de 1 cliente,
     `tipo` = subnicho), `files.album_id`, `favoritos` (cascade), `portal_sessoes` (cookie `portal_sessao`, separado de `sessao`).
   - Fotógrafo: `/meu-portal` + `/api/portal*` (salvar portal, clientes novo/senha/remover, álbuns novo/remover em lotes de 40,
     ver álbum paginado de 40 e lista de favoritas). Envio usa `/api/files/upload-url` com `album_id` (gasta a cota do dono).
   - Cliente final: `/p/<slug>` (o worker serve `portal-cliente.html`) + `/api/p/*` (info, login, logout, me, album, baixar, favorito).
   - `/portais` = vitrine/demonstração dos 8 ramos (dados fictícios).
   - Falta (v1.1): miniaturas leves (hoje a prévia é a foto original), "baixar tudo" (zip), marca d'água, limite de tentativas
     no login do cliente, e-mail automático com o acesso, outros ramos (gráfica, contador...).
   **Central de cobranças, modo manual — feita em 2026-10-24** (`migrations/0006_cobrancas.sql`): `portais.instrucoes_pagamento`
   (PIX/banco do fotógrafo) + tabela `cobrancas` (cliente, álbum opcional, valor em centavos, vencimento, link https opcional,
   `bloqueia_album`, status pendente/pago/cancelado). Rotas: `/api/portal/pagamento`, `/api/portal/cobrancas` (lista + resumo
   a receber/atrasado/recebido no mês), `/cobrancas/nova`, `/cobrancas/status`. Álbum trancado = cobrança pendente com
   `bloqueia_album=1`: o cliente não recebe prévia nem link de download (402). O cliente vê as cobranças em `/p/<slug>`.
   **Cupons de teste grátis — 2026-10-24** (`migrations/0007_cupons.sql`): tabela `cupons` (codigo maiúsculo, quota_mb, horas,
   max_usos, usos, valido_ate, ativo) e `cupom_usos` (1 cupom por conta). `POST /api/cupom {codigo}` (logado, sem plano ativo) cria
   `subscriptions` com `quota_gb = quota_mb/1000` (ex.: 0.02 = 20 MB) e `mp_payment_id = 'cupom:<CODIGO>'` (conta como manual, fora da
   receita; não recebe aviso "vence em breve"). Admin: `/api/admin/cupons`, `/cupons/salvar`, `/cupons/ativo` + seção no `/admin`.
   Painel: campo "Tem um cupom?"; link de divulgação `masternuvem.com.br/painel?cupom=NUVEM1DIA` (passa pelo login e já preenche).
   Cupom criado em produção: **NUVEM1DIA = 20 MB por 24 horas, sem limite de usos**.
   **Cupom de preço (2026-10-24, `migrations/0009_cupom_preco.sql`)**: `cupons.preco_centavos` + `so_user_id`; o cupom leva ao
   pagamento de quota_mb (≥ 1 GB) por esse preço (função `criarPagamento`, reaproveitada pelo `/api/checkout`).
   `subscriptions.valor_centavos` guarda o valor cobrado e o webhook confere contra ele (pedidos antigos: preço da calculadora).
   Criado `PIX1REAL` = 1 GB por R$ 1,00, 1 uso, só para a conta de teste do João (para testar o PIX real).
   **Acesso livre × cobrar + tabela de preços — 2026-10-24** (`migrations/0008_tabela_precos.sql`): `portais.cobrar` (0 = acesso
   livre: nada tranca e o cliente não vê cobranças; 1 = usa a central), tabela `precos` (nome, unidade foto/edicao/video/minuto/
   hora/pacote/km, valor), `cobrancas.itens` (JSON com cópia do preço). `/api/portal/precos/salvar|remover`; `/cobrancas/nova`
   aceita `itens:[{preco_id,qtd}]` (preço sempre do banco) + `valor` avulso; descrição automática pelos itens.
   **Ideia seguinte do João: fotógrafo de rua/corrida/evento** — galeria pública do evento, cliente escolhe as fotos, preço por
   foto definido pelo fotógrafo com desconto por quantidade, paga e baixa sem marca d'água. Prévia com marca d'água (logo do
   fotógrafo) gerada no navegador do fotógrafo ao enviar (canvas), original só depois de pago. QR code/aviso de direitos autorais
   na marca d'água ajuda como aviso, mas NÃO impede uma IA de remover a marca — a proteção real é só entregar o original após pagar.
   **Assistente "Nuvem" (chat) — 2026-10-24** (`migrations/0010_assistente.sql`, `public/assistente.js`): botão flutuante com o
   mascote em quase todas as páginas (não no admin nem no portal do fotógrafo). Respostas da tabela `faq` (29 iniciais; busca por
   `palavras` sem acento, no navegador). Toda pergunta vai para `perguntas_chat` (faq_id NULL = não soube; guardadas 180 dias);
   o que não souber vira chamado (`chamados`) com e-mail para contato@ e confirmação para a pessoa; prazo prometido: 48 horas.
   Limite por IP (hash do dia) em `assistente_limite`: 40 perguntas e 3 chamados por hora. Admin: seção "Assistente" no /admin
   (chamados, perguntas sem resposta com "Ensinar resposta", editar/desligar respostas). Rotas `/api/assistente/*` e
   `/api/admin/assistente|faq/salvar|faq/remover|chamados/status`. Painel: campo de cupom também ao lado do "Pagar".
   **Ideias do João para o Portal (2026-10-24, ainda não feitas):**
   - v1.1: seleção "Para o álbum impresso" com limite do pacote (ex.: 32/60), prévia em páginas duplas, "enviar seleção"
     (trava); botão "Pedir edição" por foto com comentário e status "feito".
   - Central de cobranças do fotógrafo (o dinheiro vai DIRETO para a conta dele, nunca passa pela do João — limite do MEI e
     responsabilidade). Passo 1 manual: valor + chave PIX/link do fotógrafo + "marcar como pago" + liberar download só quando
     pago. Passo 2 automático, por provedor: InfinitePay (só o InfiniteTag/handle; checkout PIX e cartão 12x; `webhook_url` +
     conferência em `api.checkout.infinitepay.io/payment_check`), Mercado Pago (OAuth/conta conectada; comissão via
     marketplace_fee), Asaas (chave de API do fotógrafo), PagBank (token/Connect), Pagar.me (Stone). Bancos com API Pix por
     certificado (Efí, Inter...) e Cielo: trabalhosos. Ton, Nubank PJ: sem API pública encontrada → só modo manual.
     Chaves de API de fotógrafos precisariam ser guardadas criptografadas. Comissão: falar com o contador antes.
   **Revisão de segurança + Sentinela — 2026-10-25** (`src/limite.js`, `src/sentinela.js`, `migrations/0011_sentinela.sql`,
   `public/_headers`; FAQ nova em `migrations/0012_faq_mais.sql`, 29 respostas → 58). **Ainda não publicado nem aplicado em produção.**
   - Limites (tabela `assistente_limite`, contam por hora): login 20 erros por IP e 10 por conta (inclusive no portal do cliente);
     2FA 10 erros por conta (além dos 5 por tentativa); cadastro 5 contas por IP. Resposta 429.
   - Diário `seguranca_eventos` (90 dias; tipos login_ok/login_erro/2fa_erro/senha_redefinida/destravada/download/
     portal_login_ok/portal_login_erro; IP só como hash do dia), gravado por `registrarEvento`.
   - Sentinela (Cron `*/20 * * * *`; o `0 * * * *` continua sendo a limpeza — `scheduled` separa pelo `event.cron`):
     TRANCA (`users.travada_em` / `portal_clientes.travada_em`, derruba sessões, e-mail ao dono e a contato@) quando há 6+ códigos
     2FA errados em 1 h (senha certa) ou entrada de 5+ conexões diferentes em 1 h. AVISA: 10+ senhas erradas numa conta, 60+ no site
     em 20 min, 300+ downloads em 20 min, admin novo, cada entrada no admin. Alertas em `sentinela_alertas` (chave única = sem repetir).
     Conta trancada: login dá 423; destrava com "Esqueci minha senha" (cliente de portal: fotógrafo dá "Nova senha") ou no /admin.
     Só contam eventos depois da última senha nova/destravamento. Regras no topo de `src/sentinela.js` (`REGRAS`).
   - Corrigido: redirecionamento aberto em `entrar.html` (`?volta=/%09/site`), cabeçalhos de proteção (X-Frame-Options, HSTS,
     nosniff, Referrer-Policy) nas páginas (`_headers`) e na API (`comProtecao`, + `Cache-Control: no-store`).
   - Conhecido, não corrigido: a URL de envio assinada não trava o tamanho (quem pede URL para 1 byte pode subir até 4,5 GB e
     não concluir; o objeto fica até a limpeza apagar o `pending` com 1 dia). Cupom de preço conta o uso ao clicar, não ao pagar.
   **PIX dentro do site — 2026-10-25**: `/api/checkout` e `/api/cupom` aceitam `metodo: "pix"` → `criarPix` chama
   `POST /v1/payments` do MP (`payment_method_id: pix`, validade 30 min, `X-Idempotency-Key = pedido-<id>`) e devolve o QR
   (`qr_code` + `qr_code_base64`); o id do pagamento fica em `subscriptions.mp_payment_id` enquanto o pedido está `pending`.
   `GET /api/pagamento/status?pedido=` (dono do pedido) consulta o MP se o webhook atrasar e usa `aplicarPagamento` (mesma conferência
   de valor). Tela `#pixTela` no painel (QR, copia e cola, contagem, "Pagamento confirmado"). Cartão continua no Checkout Pro
   ("Prefiro cartão de crédito"). O "Contratar" da página inicial leva a `/painel?gb=N&contratar=1`.
   Teste real do PIX (Checkout Pro) feito em 2026-10-25: R$ 1,00 com o cupom PIX1REAL na conta jovensnovaliancaadmim@ → ativou sozinho em ~1 min.
   **Galeria de evento (fotógrafo de rua/corrida/festa) — 2026-10-25** (`src/eventos.js`, `migrations/0013_eventos.sql`,
   `public/meus-eventos.html`, `public/evento.html`). Tabelas `eventos` (slug único, preço por foto, `faixas` JSON de desconto),
   `evento_fotos` (original_id + previa_id → files, `numeros` ",123,45,"), `evento_pedidos` (token de 48 hex guardado em claro: só libera
   aquele pedido), `files.evento_id` (fora de Meus arquivos, conta na cota). A prévia (1400 px, marca d'água diagonal) é criada no
   navegador do fotógrafo (canvas) e enviada como outro arquivo. Público em `/e/<slug>` só recebe prévias; original só via
   `/api/e/baixar` com pedido `pago`. Pagamento no PIX do fotógrafo (`portais.instrucoes_pagamento`), confirmação manual
   ("✔ Pago" → e-mail ao comprador). Limite 10 pedidos/h por IP. Preço sempre calculado no servidor (`calcularTotal`).
   **Blog — 2026-10-25** (`src/blog.js` + `src/blog-posts.js`): `/blog`, `/blog/<slug>` e `/sitemap.xml` montados no worker.
   Agenda automática: post com `publicar` futuro (data de Brasília) não aparece até o dia. 13 posts (5 no ar, 8 agendados até 21/11).
   Busca e "mais procurados" (`PALAVRAS_EM_ALTA`, lista fixa — não vem do Google Trends). Admin: seção "Blog" (agenda).
   `public/robots.txt`. Nuvenzinha aponta para os posts (`migrations/0014_faq_blog_eventos.sql`, 60 respostas).
   Regra: post publicado não pode linkar post agendado para depois dele (o teste confere).
   **Meu estúdio (reforma do Meu portal) — 2026-10-25** (`migrations/0015_regras_acesso.sql`, `0016_faq_estudio.sql`):
   - `/meu-portal` virou o lugar único: painel (recebido no mês, a receber, links abertos/fechados), "➕ Criar novo" passo a passo
     (🌐 link aberto = evento | 🔒 link fechado = cliente + álbum + regras num formulário só), "📋 Central de acesso"
     (`GET /api/portal/central`: por cliente visitas, último acesso, downloads, escolhidas, edições, cobranças; sinais 🔴/❓/✅),
     configurações (nome, endereço, cor, **layout**, PIX) num painel que abre e fecha, e as cobranças.
   - A venda de eventos foi embutida: `public/eventos-painel.js` (gerado da antiga meus-eventos.html, ids com prefixo `ev_`,
     dentro de uma IIFE; `window.EV`). `/meus-eventos` agora só redireciona para `/meu-portal?aba=abertos`.
   - Regras do álbum (`albuns.acesso_ate`, `max_downloads` por foto, `pode_baixar`, `pode_escolher` + `limite_escolha`,
     `pode_editar`); `POST /api/portal/albuns/regras` (prazo_dias: 0 = sem prazo, ausente = mantém). Cliente: `album_downloads`,
     `pedidos_edicao` (`POST /api/p/edicao`, fotógrafo marca em `/api/portal/edicoes/status`). Visita ao álbum vira evento
     `portal_album` em `seguranca_eventos` (é o que a central conta como acesso).
   - Prévia leve das fotos do álbum: o navegador do fotógrafo cria um JPG de 1600 px e envia com `previa: true`
     (`files.e_previa = 1`), ligado ao original por `POST /api/portal/previa` (`files.previa_id`). O cliente vê a prévia; o original só
     no download. Fotos antigas sem prévia continuam usando o original.
   - 4 layouts da área do cliente (`portais.tema`: classico | escuro | minimalista | delicado), capa do álbum = 1ª foto.
   - **Telas limpas (pedido do João, 2026-10-25):** uma tela por vez (`mostrarTela`: home | criar | config | cobrancas | album |
     evento). Home = 3 números + "➕ Criar novo" + cartões dos links (álbuns e eventos, filtros, 🔴 primeiro). Criar novo =
     assistente com uma pergunta por tela (álbum: cliente → nome → regras; evento: dados → preço; os campos do formulário do
     evento são movidos para os passos por `montarEventos`). Álbum e evento abrem com abas (Fotos | Regras | Escolhas e edições |
     Mais; Fotos | Pedidos | Mais). Regra de UX: não colocar muita coisa numa tela só; cada função atrás de um clique.
   - Álbum mostra o link do cliente (copiar, WhatsApp com mensagem pronta sem a senha) e atalho "🎨 Visual". O layout do portal
     vale também para a página pública do evento (`evento.html` usa `tema` de `/api/e/info`).
   - **Visual e marca (`migrations/0018_visual.sql`):** layout **por cliente** (`portal_clientes.tema`, escolhido ao cadastrar; vale
     para toda a área dele) e por evento (`eventos.tema`); NULL = layout do estúdio. Álbum e evento têm `descricao` (recado/texto) e
     `capa_file_id` (sem capa = 1ª foto; no evento, a prévia com marca). Estúdio tem `logo_file_id` e `bio`. Logo e capa são `files`
     com `uso` = 'logo'/'capa' (fora de Meus arquivos, contam na cota), reduzidos no navegador. Rotas: `/api/portal/marca`,
     `/clientes/visual`, `/albuns/visual`, `/api/eventos/capa`. Nota fiscal: `portais.emite_nota` + `evento_pedidos.nota_doc`
     (CPF 11 / CNPJ 14 números; quem emite é o fotógrafo, a Master Nuvem não gera nota). `portais.link_pagamento` = botão "Pagar"
     no pedido. O assistente de evento pede o PIX quando falta. Rodapé "Portal criado com Master Nuvem" no portal do cliente.
     **Cuidado ao editar com PowerShell:** `funcao 'a' + "x" + 'b'` vira 3 argumentos — sempre usar parênteses `funcao ('a' + "x")`.
   - **Publicado em 2026-10-25:** 4 layouts temáticos `casamento`, `quinze`, `infantil`, `festa`
     (CSS em `portal-cliente.html` e `evento.html`, fontes Google, opções em `meu-portal.html`, `TEMAS` em `portal.js`) + capa do
     evento sempre visível (`body.com-capa`). No ar junto com o aumento de espaço.
   - **Lixeira (`migrations/0017_lixeira.sql`, `src/lixeira.js`):** remover álbum, cliente (com todos os álbuns) ou evento pede 2
     confirmações e só marca `removido_em` → some na hora para o cliente/comprador. 30 min para "Desfazer" (`/api/portal/restaurar`,
     `/api/eventos/restaurar`). `purgarLixeira` roda no Cron de 20 min depois da sentinela e apaga de verdade (até 25 arquivos por
     rodada). Os antigos `/albuns/remover` e `/eventos/remover` (apagar na hora) continuam no servidor, mas a tela não usa mais.
   **Aumentar espaço — 2026-10-25** (`migrations/0019_aumentar_espaco.sql`, no ar): `subscriptions.aumento_ate`; `/api/checkout` com `modo: "aumentar"` cobra (preço novo − preço atual) × dias que faltam ÷ 30, mínimo R$ 2,00 (`precoAumento`), e o webhook mantém o vencimento. `GET /api/plano/aumento?gb=` mostra o valor no painel. Teste grátis por cupom não aumenta.
   **Publicado em 2026-10-26** (migração 0020 aplicada em produção):
   - **Avisos dentro da página** (`public/avisos.js`: `avisar`, `await confirmar(titulo, texto, botaoSim, perigo)`, `await pedirTexto`, `avisoCopiar`): substituem TODAS as janelas do navegador (alert/confirm/prompt) no Meu estúdio, eventos, portal do cliente, evento, arquivos, painel e admin. Não usar mais alert/confirm/prompt. Ao criar cliente, a tela "Pronto!" tem Copiar e WhatsApp.
   - **Prévia dos layouts:** `/p/previa?previa=<tema>&nome=&cor=` abre o `portal-cliente.html` com dados de exemplo (sem servidor). No Meu estúdio, "👁️ Ver como fica" ao lado de cada lista de layout e "Ver os layouts em tela cheia" nas configurações (◀ ▶ + "Usar este layout"). `X-Frame-Options` passou de DENY para SAMEORIGIN para a prévia abrir dentro do site.
   - **Cartão "💸 Cobre dos seus clientes sem pagar taxa"** no `/painel` (abaixo do plano): mostra se o PIX/link já está configurado e leva para `/meu-portal?aba=receber`, que abre Configurações direto em "Como você recebe" (`#blocoPix`, destacado). Argumento de venda: a Master Nuvem não cobra comissão, só o armazenamento.
   - **Limite de fotos para baixar + fotos a mais (0020):** `albuns.max_fotos` (fotos diferentes; baixar de novo a mesma não conta), `preco_extra_centavos`, `faixas_extra` (desconto, igual aos eventos), `fotos_extras` (já pagas). Chegou no limite → 402 `limite_fotos`; o cliente pede em `POST /api/p/fotos-extras {album_id,qtd}` → vira cobrança (`cobrancas.fotos_extra`, 1 em aberto por álbum, aparece para o cliente mesmo no acesso livre). Fotógrafo marca como pago → soma em `fotos_extras`; desfazer tira.
   **Publicado em 2026-10-26** (migração 0021 aplicada em produção):
   - Configurações separadas em 2 telas: **🎨 Minha página** (`secConfig`: nome, endereço, cor, logo, sobre você, layout; o Salvar grava também a bio) e **💳 Como recebo** (`secReceber`: PIX, link de pagamento, nota fiscal + botões com os links das ajudas oficiais para cadastrar a chave PIX e criar link de pagamento: Mercado Pago, InfinitePay, PagBank, Nubank; `GUIAS` no meu-portal.html, conferir de vez em quando se os links ainda abrem). `?aba=receber` abre Como recebo. Tela inicial com "✨ Complete seu cadastro: X de 3" (página, logo/layout, recebimento) e passos 1-2-3 no primeiro cadastro.
   - **Bancos (0021, `src/bancos.js`):** tabela `bancos` (17 iniciais, com Cielo: links das ajudas oficiais para chave PIX e link de pagamento, `tem_api` = confirmação automática possível no futuro; hoje TODA confirmação é manual pelo fotógrafo) e `bancos_pedidos`. "Como recebo" pergunta "Qual é o seu banco?" e mostra só aquele (+ aviso ✋ manual / 🤖 possível no futuro). Nuvenzinha (`assistente.js`) reconhece o banco na pergunta e responde com os links; banco desconhecido vira pedido (`POST /api/bancos/pedido`, 3/h por IP) → e-mail para contato@ → João aprova no /admin seção Bancos colando o link oficial → quem pediu recebe e-mail na hora e o banco entra para todos. A lista NUNCA muda sozinha (link falso de banco = golpe). Cron de 20 min confere 3 bancos por rodada (1x por dia cada); link quebrado → e-mail para contato@. 401/403/429 contam como OK (sites que bloqueiam robôs: BB, Itaú, Santander, InfinitePay).
   - **Ideia aprovada para fazer depois: Portfólio público do fotógrafo** (página de vendas dele, aberta no Google): capa, sobre, galerias de portfólio escolhidas das fotos dele, contatos (WhatsApp/Instagram), botão "Pedir orçamento", rodapé "Feito com Master Nuvem" (marketing), entra no sitemap. Diferencial: Google Drive/Dropbox só vendem GB.
   **/admin limpo (publicado em 2026-10-26):** tela inicial com quadradinhos (Clientes, Assistente, Sentinela, Bancos, Blog, Backblaze, Cupons), resumo de 1 linha e 🔴 quando precisa do João (chamado aberto, conta trancada/alerta novo, pedido de banco/link quebrado, aviso do B2); o título da aba mostra "(N)". Uma seção por vez (`abrirSecao`), listas com "Ver todos" (`limitarLista`) e formulários atrás de "➕". Os `carregarX` são embrulhados para atualizar os quadradinhos depois de cada carga.
   **Profissional (publicado em 2026-10-26):** página `/sobre` (Quem somos, dados do MEI) no sitemap; rodapé igual em início, termos, privacidade, sobre e blog (links + CNPJ + Mercado Pago/Backblaze/Cloudflare). WhatsApp de atendimento **(62) 98284-6067** (wa.me/5562982846067) no rodapé, no Quem somos e na Nuvenzinha (chip "💬 WhatsApp"). Falta: responder como contato@ (Gmail "Enviar e-mail como" pelo SMTP do Resend, feito pelo João).
   **Contratos com assinatura online (publicado em 2026-10-26, migração 0022 aplicada):** `src/contratos.js`, `src/contratos-modelos.js` (5 modelos: casamento/15 anos/festa, ensaio, vídeo, contador, em branco; campos `{{...}}` em `CAMPOS`), `public/contrato.html` (`/c/<token de 48 hex>`). Meu estúdio → "📝 Contratos": escolhe modelo + cliente + álbum e o texto já vem preenchido (cliente, estúdio, fotos incluídas e preço da foto a mais vindos das regras do álbum; CPF/CNPJ e cidade do fotógrafo lembrados no navegador); edita; envia (e-mail + WhatsApp). Cliente: lê, nome + CPF/CNPJ (dígitos conferidos), "li e concordo", código de 6 números no e-mail (15 min, 5 tentativas, 6 códigos por contrato, 10/h por IP) → assinado. Comprovante: data, IP, navegador, e-mail, SHA-256 do texto; e-mail para os dois. Modelos próprios ("⭐ Meus modelos"). Termos e Privacidade atualizados (modelos sem garantia jurídica; Master Nuvem não é parte). Teste: `tests/teste-contratos.mjs`.
   **Cópia de segurança do banco (publicada em 2026-10-26, migração 0023):** `src/copia.js` (`fazerCopia`): todas as tabelas (menos sessões, limites e links de senha) viram JSON em `backups/banco-dia-DD.json` no bucket do B2 (rodízio de 31 dias), todo dia na limpeza das 06:00 UTC (03h Brasília). Tabela `copias` (log). /admin → "📦 Cópias": lista, "Fazer cópia agora", "Baixar" (link de 5 min); 🔴 se a última falhou ou tem mais de 2 dias. `medirBucket` separa `backups/` (não conta como órfão, mas entra no custo). Restaurar: `node scripts/restaurar-copia.mjs banco-dia-DD.json` gera o SQL; testar com `--local` antes e só usar `--remote` combinando com o João. Teste: `tests/teste-copia.mjs`.
   **Git:** PR #1 juntado na `main` em 2026-10-26 (main = o que está no ar). Trabalho novo em ramo próprio (ex.: `copia-seguranca`).
   **Ajustes de 2026-10-26 (publicados, migração 0024 aplicada):**
   - Passo 3 do álbum vira passo a passo (`wzAtualizarPasso3`): prazo obrigatório (2 a 90 dias, outro, sem prazo) → favoritas sim/não (+ até quantas) → edição sim/não (+ até quantas fotos, `albuns.limite_edicao`) → baixar sim/não (+ vezes por foto, limite de fotos, cobrar a mais, desconto, todos sim/não) → contrato sim/não → botão Criar. As caixinhas escondidas wzEscolher/wzEditar/wzBaixar/wzContrato guardam as respostas.
   - Contrato obrigatório (`contratos.obrigatorio`): o cliente vê "📝 Antes de ver suas fotos, assine o contrato" ao entrar; `/api/p/album` e `/api/p/baixar` dão 403 `{contrato:true}` até assinar; depois de assinar, botão "Ver os meus álbuns". No passo a passo do álbum, "Enviar contrato" abre o Novo contrato já com cliente e álbum.
   - PDF do contrato: "📄 Ver em PDF" antes de enviar, "PDF" na lista e "📄 Baixar PDF" na página do cliente (`?pdf=1`).
   - Pedido de fotos a mais manda e-mail para o fotógrafo (`avisarFotografo` em portal.js). Escolha de layout por quadradinhos com miniatura (`quadradinhosDeTema`) e fileira de layouts na prévia em tela cheia. Ícone das Cópias: 📦.
   - **E-mail de boas-vindas ao cliente do portal:** ao cadastrar (caixinha "Mandar o acesso por e-mail", padrão ligada) o cliente recebe o login e o botão "Criar minha senha" (`/p/<slug>?convite=<token>`, 7 dias, uma vez só, hash em `portal_clientes.convite_hash`); a senha nunca vai no e-mail. `POST /api/p/convite` cria a senha e já entra. Fotógrafo: "✉️ Reenviar acesso por e-mail" no álbum (`/api/portal/clientes/convite`).
   - **Senha do cliente (migração 0025, `portal_clientes.senha_propria`):** quem entra com a senha que o fotógrafo mandou (WhatsApp) é levado para "Crie a sua senha" (`/api/p/senha`); "🔑 Trocar senha" no topo da área do cliente (pede a atual). "Nova senha" do fotógrafo volta `senha_propria` para 0.
   - Criar álbum com contrato = Sim: vai direto para a tela do contrato (`ctNovoPara`) com o aviso "Último passo" e os dados de acesso (copiar/WhatsApp); o botão mostra "Criando o cliente... / Enviando a foto de capa...".
   - No primeiro acesso o cliente pode criar a própria senha OU "Continuar com a senha que recebi" (`/api/p/senha/manter`).
   - **Várias pessoas (migração 0026):** `album_acessos` (pessoas extras no álbum, cada uma com login próprio; "👥 Pessoas com acesso" na aba Mais do álbum e "Mais alguém vai ver as fotos?" no passo a passo); `contrato_assinantes` (cada pessoa com link /c/<token> e código próprios; contrato vira "assinado" quando todos assinam); `contratos.regra` = todos | um | nenhum (trava das fotos). Contrato com álbum trava aquele álbum para todas as pessoas dele; sem álbum, trava os álbuns de quem assina. Quem já assinou vê "Aguardando a assinatura de X". Menor de idade: só o nome, cláusula `{{clausula_menor}}` nos modelos; quem assina são os responsáveis. Dados do fotógrafo para contratos em Minha página (`portais.doc_nome/doc_numero/doc_cidade`).
   - **Painel com avisos:** `GET /api/portal/resumo` → quadradinhos "🔔 Precisa de você" no /painel (contratos esperando, a receber, pedidos de evento, edições, plano vencendo em até 5 dias), com 🔴 e "(N)" no título da aba.
   - Páginas públicas não citam mais os fornecedores (Backblaze/Cloudflare): rodapé, Quem somos, Termos e Privacidade usam termos genéricos. Não anunciar "servidor próprio" (não é verdade: propaganda enganosa).
   - Atenção: ids do bloco de fotos usam `LimiteBox` (`rgLimite`/`wzLimite` já são o campo de favoritas).
   **Profissional, parte 2 (publicado em 2026-10-27, migração 0027):**
   - **Confirmar e-mail:** cadastro manda link (`/api/email/confirmar?t=`, 3 dias, hash em `users.confirmacao_hash`); sem confirmar, `/api/checkout` e `/api/cupom` dão 403 `{confirmar_email:true}`. Painel mostra aviso amarelo + "Mandar o link de novo" (`/api/email/reenviar`, 3/h). Contas antigas já vieram confirmadas. `/api/me` devolve `email_confirmado`. Teste: `tests/teste-email.mjs`.
   - **Turnstile (anti-robô) no login e cadastro:** só funciona com os segredos `TURNSTILE_SITE_KEY` e `TURNSTILE_SECRET` (`scriptssegredo.ps1`); sem eles não verifica. `GET /api/config` entrega só a chave pública. Se a Cloudflare do Turnstile cair, deixa passar.
   - **`GET /api/saude`** (200 / 503 se o banco cair) para monitor externo (UptimeRobot, feito pelo João).
   - **Página inicial:** 3 planos prontos (100 GB, 1 TB, 5 TB; preço calculado por `calcularPreco` via `data-preco`) e prévia real do portal (iframe de `/p/previa?previa=casamento`).
   - **Lembrete do chip do WhatsApp:** `lembreteWhatsapp` na limpeza das 06:00 UTC; a cada 30 dias desde 2026-10-27 (chip TIM) (`DIAS_RECARGA_WHATSAPP`, `INICIO_RECARGA_WHATSAPP`) e-mail para contato@ + alerta na Sentinela (chave `lembrete-whatsapp-<ciclo>`). Teste: `tests/teste-lembrete.mjs`.
   **Portfólio público do fotógrafo (feito em 2026-10-27, ramo `portfolio`, migração 0028 — ainda não publicado):** `src/portfolio.js`, `public/portfolio.html` (`/f/<slug do estúdio>`), tela "🌟 Portfólio" no Meu estúdio (`secPortfolio`, `?aba=portfolio`; abas Fotos | Textos e contatos | Orçamentos). Galerias (`portfolio_galerias`, até 12) com fotos (`portfolio_fotos`, até 60 por galeria) = `files.uso = 'portfolio'` reduzidas a 2000 px no navegador (contam na cota, fora de Meus arquivos). `portais.portfolio_ativo/portfolio_titulo/portfolio_capa_id/whatsapp/instagram/cidade`; bio, logo e cor vêm da Minha página. No ar só com plano ativo + página ligada + 1 foto; entra no `sitemap.xml` (`portfoliosNoAr`). "Pedir orçamento" → tabela `orcamentos` + e-mail ao fotógrafo (5/h por IP). Rotas `/api/portfolio*` (dono) e `/api/f/info|orcamento` (público). Teste: `tests/teste-portfolio.mjs`. Envio de fotos não testado local (sem `.dev.vars`).
   **Google Perfil da Empresa (2026-10-27):** "Master Nuvem" verificado no Google/Maps (conta do João). Link de avaliação em `LINK_AVALIACAO_GOOGLE` (worker); atalho **`/avaliar`** (302) nos rodapés ("⭐ Avalie no Google"), na Nuvenzinha (`migrations/0029_faq_avaliar.sql`, 70 respostas, inclui o portfólio) e no e-mail "Está gostando da Master Nuvem?" (limpeza, tipo `avaliar` em `avisos`: 7 dias depois de pagar, 1 vez por cliente, sem cupom/manual). Fotos para o perfil geradas em `fotos-google/` (não versionar).
5. Pendências menores: upload acima de 4,5 GB (multipart); preço duplicado em
   `app.js` e `worker.js`; responder e-mails como @masternuvem.com.br; WhatsApp.
