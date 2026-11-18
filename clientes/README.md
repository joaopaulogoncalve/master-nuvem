# Clientes de sites (criação de sites da Master Nuvem)

Cada cliente tem uma pasta: `clientes/<nome>/`.

- `site/` = o código do site (vai para o GitHub, que é **público**: só coisa que já aparece no site).
- `privado/` = manual da marca, logos, PDFs, conversas e passo a passo com dados do cliente. **Fica só no PC** (está no `.gitignore`).
- `_modelo/briefing-cliente.md` = o texto para mandar no WhatsApp pedindo o material.

## Como trabalhar com cada cliente
1. Mandar o briefing (`_modelo/briefing-cliente.md`).
2. Montar 3 modelos + 1 "unido" com a marca do cliente e publicar os rascunhos num `*.pages.dev` com `noindex`.
3. Cliente escolhe → versão final no Cloudflare Pages.
4. Domínio sempre no CPF/CNPJ do cliente → zona na Cloudflare → Custom domain no projeto do Pages.
5. Conferir no celular (375 px, sem rolagem para o lado) e no PC.
6. Rodapé: "Site criado por Master Nuvem" com link para https://masternuvem.com.br/sites (com o OK do cliente).
7. Lançar ganhos e gastos no Lucro Online (projeto "master").

## Rezende Soluções Corporativas (1º cliente)
- Pasta: `rezende/site/` (trazida do Renda-Online em 2026-11-18; esta é a cópia oficial agora).
- Montar depois de mexer nos modelos: `node montar-unido.js` e `node montar-publico.js` (dentro de `rezende/site`).
- Publicar (pelo Terminal do app, o wrangler pede login): `powershell -ExecutionPolicy Bypass -File publicar-site.ps1` (site final, projeto `rezende-site`) ou `publicar-modelos.ps1` (rascunhos, `rezende-modelos`).
- Regras do ramo: mostrar "correspondente bancário de Banco do Brasil S.A." e "nunca pedimos depósito antecipado"; nunca CPF ou documento no site; seguir o manual da marca à risca.
