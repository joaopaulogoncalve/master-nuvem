# Robô do WhatsApp (Nuvenzinha no WhatsApp) — passo a passo

O código já está pronto (`src/whatsapp.js`, teste `tests/teste-whatsapp.mjs`). Ele só começa a funcionar
depois que o João ligar o número na Meta e gravar os 4 segredos abaixo. Sem os segredos, não faz nada.

## O que o robô faz
- Responde no WhatsApp com as **mesmas respostas da Nuvenzinha do site** (tabela `faq`). Ensinou resposta nova
  no /admin → vale no site e no WhatsApp.
- "oi", "bom dia" → menu (preço, teste grátis, portal, sites).
- Não sabe, ou a pessoa escreve **atendente** → manda e-mail para contato@ com o link `wa.me` da pessoa e
  **fica quieto 12 horas** naquela conversa.
- O João responde pelo **/admin → 💬 WhatsApp** (conversas com 🔴 = esperando ele). Ao responder, o robô sai
  da conversa por 12 horas; o botão "🤖 Devolver para o robô" faz ele voltar na hora.
- Áudio/foto → pede para escrever. Máximo 15 respostas por hora por número. Conversas guardadas 180 dias.
- Responder quem chamou primeiro é **grátis** na Meta (conversa de atendimento). Só mensagem que a Master Nuvem
  começa (propaganda, lembrete) é paga e precisa de modelo aprovado — o robô não faz isso.

## Situação em 2026-11-20 (o que já foi feito e o que aprendemos)
- App **"Master Nuvem Atendimento"** (id 1679122323651006) criado no portfólio **João Paulo** (o mesmo do China em Casa),
  caso de uso WhatsApp, **publicado** (política /privacidade e termos /termos preenchidos). Webhook verificado e campo `messages` assinado.
- Os 4 segredos gravados. `WHATSAPP_PHONE_ID` ainda é o do **número de teste** da Meta (+1 555 137-7320, conta 914078901698331).
- O robô recebe, responde e a Meta aceita, mas o número de teste **não entrega no Brasil** (erro 130497 "restricted from messaging
  users in this country"): número americano → brasileiro é bloqueado. Resolve com o número brasileiro de verdade (e a verificação da empresa).
- **Token passa de 256 letras**: a janelinha do `segredo.ps1` corta. Para token, copiar e rodar
  `powershell -STA -ExecutionPolicy Bypass -File scripts\segredo-copiado.ps1 -Nome WHATSAPP_TOKEN` (lê do Ctrl+C e limpa).
- **/admin → 💬 WhatsApp → "🔧 Conferir ligação com a Meta"**: testa o token e assina a conta (WABA) no app. Sem essa assinatura a
  Meta não manda as mensagens. Usar de novo quando trocar de número ou de token (WABA da conta de verdade aparece no painel da Meta).
- Celular brasileiro antigo chega sem o 9 (556298163109); o robô acrescenta o 9 ao responder (`paraEnvio`).
- Erros de entrega aparecem em `npx wrangler tail master-nuvem` ("entrega falhou para ...").

## Número escolhido (decisão do João em 2026-11-20): "Jeito 1"
O mesmo número de hoje, **(62) 98284-6067**, sai do app do WhatsApp Business e vai **direto para a API da Meta**
(grátis, sem empresa parceira). Depois disso o número **não abre mais no app**: o João lê e responde tudo em
**masternuvem.com.br/admin → 💬 WhatsApp** (no computador ou no navegador do celular). O e-mail de aviso traz o link.
Resposta de graça só até **24 horas** depois da última mensagem da pessoa (a tela avisa e bloqueia depois disso).

Outras opções (não escolhidas): chip novo só para o robô; ou "coexistência" (app + robô no mesmo número), que
a Meta só oferece por cadastro especial, normalmente via empresa parceira com mensalidade.

## Antes de tirar o número do app (o João faz, no celular)
1. Guardar o que importa das conversas: em cada conversa importante → ⋮ → Mais → **Exportar conversa**.
   (As conversas antigas **não** vão para o site.)
2. Anotar as respostas rápidas, catálogo e etiquetas, se quiser recriar depois.
3. Só depois do app criado na Meta (passo 1 abaixo): WhatsApp Business → Configurações → Conta →
   **Apagar minha conta** (número (62) 98284-6067). Isso não tem volta no app. Esperar uns 5 minutos.
4. Manter o chip num celular qualquer (mesmo sem WhatsApp) para receber o SMS da Meta no passo 2.

## Passo a passo na Meta (o João faz; o Claude não cria conta)
1. Entrar em developers.facebook.com com a conta da empresa → **Meus apps → Criar app** → tipo **Empresa**
   → produto **WhatsApp**. Ligar ao portfólio empresarial "Master Nuvem" (business.facebook.com).
2. Em WhatsApp → **Configuração da API**: adicionar o número (62) 98284-6067 e confirmar o código por SMS.
   Copiar o **ID do número de telefone** → segredo `WHATSAPP_PHONE_ID`.
3. Token permanente: business.facebook.com → Configurações → **Usuários do sistema** → criar (Admin) →
   adicionar o app → **Gerar token** com `whatsapp_business_messaging` e `whatsapp_business_management`,
   sem validade → segredo `WHATSAPP_TOKEN`.
4. App → Configurações → Básico → **Chave secreta do app** → segredo `META_APP_SECRET`.
5. Inventar uma palavra longa qualquer → segredo `WHATSAPP_VERIFY_TOKEN`.
6. Gravar os 4 segredos (um de cada vez, o PowerShell pede o valor e não mostra na tela):
   ```
   scripts\segredo.ps1 -Nome WHATSAPP_TOKEN
   scripts\segredo.ps1 -Nome WHATSAPP_PHONE_ID
   scripts\segredo.ps1 -Nome META_APP_SECRET
   scripts\segredo.ps1 -Nome WHATSAPP_VERIFY_TOKEN
   ```
7. WhatsApp → **Configuração** → Webhook → URL `https://masternuvem.com.br/api/whatsapp/webhook`,
   token de verificação = a palavra do passo 5 → **Verificar e salvar**. Assinar o campo **messages**.
8. Publicar o app (modo **Ativo**) e mandar "quanto custa 1 TB?" de outro celular para testar.
   Erros aparecem em `npx wrangler tail master-nuvem`.

Nada disso aparece no site antes do João ligar. Segredo nunca vai para arquivo nem para o chat.
