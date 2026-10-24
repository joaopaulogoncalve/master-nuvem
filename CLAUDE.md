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
- Deploy: `npx wrangler deploy` (ou integração Git da Cloudflare com o repositório `master-nuvem` no GitHub).

## 3. Segredos / variáveis (só nomes; valores ficam na Cloudflare → Settings → Variables and Secrets)
| Nome | Para quê |
|---|---|
| `MP_ACCESS_TOKEN` | Token do Mercado Pago (checkout e consulta de pagamentos no webhook). **O atual é temporário — trocar pelo definitivo.** |
| `RESEND_API_KEY` | Envio de e-mail (Resend, remetente `nao-responda@masternuvem.com.br`). Gravar com `scripts\segredo.ps1 -Nome RESEND_API_KEY` |
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
    Cadastro exige aceite (`users.terms_accepted_at`, `migrations/0003`). Falta: WhatsApp.
12. **Limpeza automática** (`scheduled` no worker, Cron `0 * * * *`, função `limpeza`): e-mails "vence em 3 dias", "venceu"
    e "último aviso" (3 dias antes de apagar), registrados em `avisos` (`migrations/0004`) para não repetir; apaga arquivos de
    quem está sem plano há 15+ dias (nunca admin; "fim" = maior `paid_until` entre active/replaced/cancelled — cancelar grava
    `paid_until = agora`); apaga envios `pending` com 1+ dia; faxina de sessões, links de senha e pedidos abandonados.
    **Apagar arquivos de cliente só acontece com a variável `APAGAR_ARQUIVOS = "sim"`**; sem ela fica em modo teste (só log).
    Limites por rodada: 10 e-mails e 30 exclusões (plano grátis = 50 subrequests).
    Se mudar regra de cobrança/retenção no código, atualizar os textos também.

**Ideias futuras:** bot de WhatsApp para suporte/venda; "Fase 2" com HD/NAS próprio para baratear; planos pré-definidos além do slider; e-mails transacionais.

## 8. Como trabalhar neste projeto (regras para o Claude da pasta local)
1. Responda **em português**, passo a passo, com blocos de código simples; o João não é programador de carreira.
2. Rode primeiro `git status` e leia este arquivo. Não pesquise o que já está aqui.
3. Mudanças pequenas e testáveis; explique o que mudou em 2–3 linhas.
4. Testar local: `npx wrangler dev` (precisa de `.dev.vars`). Banco local: `--local`; produção: `--remote` (**confirmar antes de mexer em produção**).
5. Nunca imprimir, commitar ou pedir para colar segredos no chat. Novo segredo → `npx wrangler secret put NOME`.
6. Não quebrar o que funciona (login, cota, URLs assinadas). Qualquer mudança em preço/cobrança: mostrar a conta antes.
7. Estilo do código: funções em português, `var`/`function` simples, sem dependências novas sem necessidade.
8. Commits só quando o João pedir.

## 9. Próximos passos (ordem combinada com o João em 2026-10-24)
Já feito: migrations, pagamento automático (webhook), CORS/chave/ciclo de vida do B2, 2FA do admin, painel admin,
recuperação de senha, Termos/Privacidade, limpeza automática (modo teste), botão Entrar. Tudo no PR #1.

1. **Trocar `MP_ACCESS_TOKEN` pelo definitivo** (`scripts\segredo.ps1 -Nome MP_ACCESS_TOKEN`) e testar compra real de R$ 9,90 no PIX:
   pagar → plano ativo sozinho → enviar arquivo → baixar → apagar. Último passo para vender.
2. João: conversar com o contador sobre o CNAE do MEI (hoje nenhuma atividade é de serviço de internet/armazenamento).
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
5. Pendências menores: Turnstile/rate-limit no login e cadastro; upload acima de 4,5 GB (multipart); preço duplicado em
   `app.js` e `worker.js`; responder e-mails como @masternuvem.com.br; WhatsApp.
