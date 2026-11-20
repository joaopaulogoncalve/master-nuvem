# Robô do WhatsApp (Nuvenzinha no WhatsApp) — passo a passo

O código já está pronto (`src/whatsapp.js`, teste `tests/teste-whatsapp.mjs`). Ele só começa a funcionar
depois que o João ligar o número na Meta e gravar os 4 segredos abaixo. Sem os segredos, não faz nada.

## O que o robô faz
- Responde no WhatsApp com as **mesmas respostas da Nuvenzinha do site** (tabela `faq`). Ensinou resposta nova
  no /admin → vale no site e no WhatsApp.
- "oi", "bom dia" → menu (preço, teste grátis, portal, sites).
- Não sabe, ou a pessoa escreve **atendente** → manda e-mail para contato@ com o link `wa.me` da pessoa e
  **fica quieto 12 horas** naquela conversa.
- Se o João responder pelo celular (só no modo coexistência), o robô também sai da conversa por 12 horas.
- Áudio/foto → pede para escrever. Máximo 15 respostas por hora por número. Conversas guardadas 180 dias.
- Responder quem chamou primeiro é **grátis** na Meta (conversa de atendimento). Só mensagem que a Master Nuvem
  começa (propaganda, lembrete) é paga e precisa de modelo aprovado — o robô não faz isso.

## Qual número usar (decisão do João)
1. **Chip novo só para o robô (mais simples e grátis).** O número vai direto para a API da Meta. Ele **deixa de
   abrir no app** do WhatsApp: o João acompanha pelos e-mails e responde pelo painel da Meta ou pelo site (a fazer).
2. **O mesmo número de hoje, (62) 98284-6067, no app e no robô ("coexistência").** A Meta só oferece isso por um
   cadastro especial ("Embedded Signup"), que normalmente é feito por uma empresa parceira (ex.: 360dialog),
   com mensalidade. Se o painel da Meta oferecer "conectar o número do WhatsApp Business app", dá para fazer direto.
   **Nunca apagar a conta do app** para migrar: perde o histórico.

## Passo a passo na Meta (o João faz; o Claude não cria conta)
1. Entrar em developers.facebook.com com a conta da empresa → **Meus apps → Criar app** → tipo **Empresa**
   → produto **WhatsApp**. Ligar ao portfólio empresarial "Master Nuvem" (business.facebook.com).
2. Em WhatsApp → **Configuração da API**: adicionar o número (chip novo) e confirmar o código por SMS.
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
   token de verificação = a palavra do passo 5 → **Verificar e salvar**. Assinar o campo **messages**
   (e **smb_message_echoes**, se for coexistência).
8. Publicar o app (modo **Ativo**) e mandar "quanto custa 1 TB?" de outro celular para testar.
   Erros aparecem em `npx wrangler tail master-nuvem`.

Nada disso aparece no site antes do João ligar. Segredo nunca vai para arquivo nem para o chat.
