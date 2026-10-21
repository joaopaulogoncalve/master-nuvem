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
- Deploy: `npx wrangler deploy` (ou integração Git da Cloudflare com o repositório `master-nuvem` no GitHub).

## 3. Segredos / variáveis (só nomes; valores ficam na Cloudflare → Settings → Variables and Secrets)
| Nome | Para quê |
|---|---|
| `MP_ACCESS_TOKEN` | Token do Mercado Pago (checkout). **O atual é temporário — trocar pelo definitivo.** |
| `B2_KEY_ID` | ID da chave de aplicação do Backblaze |
| `B2_APP_KEY` | Chave secreta do Backblaze |
| `B2_BUCKET` | `master-nuvem-cliente` (bucket **privado**) |
| `B2_ENDPOINT` | `s3.us-east-005.backblazeb2.com` (a região é extraída do 2º pedaço do host) |

Local: usar `.dev.vars` (no `.gitignore`!) para rodar `wrangler dev`. Nunca commitar.

## 4. Arquivos do repositório
| Arquivo | Função |
|---|---|
| `src/worker.js` | Roteador. Auth (cadastro, login, logout, `/api/me`), 2FA TOTP, `/api/checkout`, delega `/api/files*` |
| `src/arquivos.js` | Arquivos: lista, URL assinada de upload/download (AWS SigV4 feito à mão com WebCrypto), conclusão, exclusão, cota |
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
| `/api/me` | GET | sim | `{email,nome,role,totp}` |
| `/api/2fa/setup` | POST | sim | gera segredo e URI `otpauth://` |
| `/api/2fa/enable` | POST | sim | confirma com 1º código |
| `/api/2fa/disable` | POST | sim | exige senha + código |
| `/api/checkout` | POST | **não** | `{gb}` → cria preferência no Mercado Pago, devolve `{init_point}` |
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

**Lacunas conhecidas (por prioridade):**
1. **Pagamento não vira plano.** `/api/checkout` não grava nada e não há webhook. A tabela `subscriptions` só é preenchida à mão,
   então cliente que paga continua "sem plano". Falta: ligar o pedido ao usuário logado (exigir login no checkout, enviar
   `external_reference = userId:gb`, `notification_url = /api/mp/webhook`), criar o webhook (validar assinatura/consultar o pagamento
   na API do MP, nunca confiar no corpo), inserir/renovar `subscriptions` (`status='active'`, `paid_until`, `quota_gb`).
2. **Checkout sem login** — qualquer um gera link; decidir se exige conta antes de pagar (recomendado).
3. **Renovação/expiração** — mensal? Definir ciclo, aviso de vencimento, e o que acontece com arquivos após `paid_until` (bloqueio de upload já existe; download/retenção não).
4. **CORS do bucket B2** — upload/download direto do navegador precisa de regra CORS no bucket (origem do site, métodos PUT/GET/HEAD). Conferir se está configurado.
5. **Painel admin** — existe `role` mas nenhuma rota/tela de admin (listar clientes, planos, uso, conceder plano manual, bloquear).
6. **Ativar 2FA no admin** antes de vender de verdade.
7. **Sem recuperação de senha** nem verificação de e-mail; **sem rate-limit** em login/cadastro (só o 2FA tem limite). Considerar Cloudflare Turnstile.
8. **Preço duplicado** em `app.js` e `worker.js` (`calcularPreco`). O servidor é a fonte da verdade; manter igual ou expor o preço por endpoint.
9. Arquivo máx. 4,5 GB (upload simples PUT). Maior que isso exige multipart upload.
10. Limpeza: registros `pending` antigos só são apagados na próxima tentativa de upload do próprio usuário (e o objeto órfão no B2 não é removido) — criar tarefa agendada (Cron Trigger).
11. Páginas legais (termos, privacidade/LGPD), política de reembolso, contato/WhatsApp.

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

## 9. Próximos passos sugeridos (ordem)
1. ~~Versionar o esquema do D1 (`migrations/`).~~ Feito em 2026-10-21.
2. Exigir login no checkout + `external_reference` + webhook do Mercado Pago → criar `subscriptions` automaticamente.
3. Testar compra real de valor mínimo (PIX) ponta a ponta: pagar → plano ativo → enviar arquivo → baixar → apagar.
4. Conferir CORS do B2; ativar 2FA do admin.
5. Painel admin básico (clientes, uso, plano manual).
6. Renovação mensal + avisos; Cron de limpeza.
7. Termos/Privacidade, recuperação de senha, Turnstile.
