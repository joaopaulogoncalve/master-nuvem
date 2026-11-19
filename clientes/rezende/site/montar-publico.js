// Gera o site final da Rezende em publico/ a partir dos modelos.
// Site principal = modelo Unido (1 + formulário do 2) · /links = modelo 3 (cartão digital).
// Rodar: node montar-unido.js && node montar-publico.js
const fs = require('fs'), path = require('path');
const M = f => fs.readFileSync(path.join(__dirname, 'modelos', f), 'utf8');
const OUT = path.join(__dirname, 'publico');
const URL = 'https://rezendecredito.com.br';
const DESC = 'Rezende Soluções Corporativas: correspondente bancário em Trindade – GO com atendimento nacional. Crédito pessoal, consignado, consórcio, alavancagem patrimonial e consultoria financeira.';
fs.mkdirSync(path.join(OUT, 'links'), { recursive: true });

const R_SVG = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><rect width="100" height="100" rx="22" fill="#122A43"/><g transform="translate(26 14) scale(.72)"><path d="M6 94V6h30a24 24 0 0 1 0 48H22" fill="none" stroke="#FAF8F3" stroke-width="6" stroke-linecap="round" stroke-linejoin="round"/><path d="M22 54h10c6 0 9 2 13 7l17 31" fill="none" stroke="#A9C4D9" stroke-width="6" stroke-linecap="round"/></g></svg>';
fs.writeFileSync(path.join(OUT, 'favicon.svg'), R_SVG);

const cabeca = (titulo, canon, desc) => `<meta name="description" content="${desc}">
<link rel="canonical" href="${canon}">
<link rel="icon" href="/favicon.svg" type="image/svg+xml">
<meta name="theme-color" content="#122A43">
<meta property="og:type" content="website"><meta property="og:locale" content="pt_BR">
<meta property="og:site_name" content="Rezende Soluções Corporativas">
<meta property="og:title" content="${titulo}"><meta property="og:description" content="${desc}"><meta property="og:url" content="${canon}">`;

const comum = s => s
  .replace('<meta name="robots" content="noindex,nofollow">\n', '')
  .replace('<meta name="robots" content="noindex,nofollow">', '');

// ---------- site principal ----------
// principal = modelo 1 · /simular = modelo 2 · /links = modelo 3 (pedido do João, 18/11)
let site = comum(M('modelo-1.html'));
site = site.replace('<a href="#duvidas">Dúvidas</a>', '<a href="#duvidas">Dúvidas</a><a href="/simular/">Simular</a>');
site = site.replace('<a class="btn btn-borda" style="color:#fff;margin-left:10px" href="#servicos">Ver serviços</a>', '<a class="btn btn-borda" style="color:#fff;margin-left:10px" href="/simular/">Simular agora</a>');
site = site.replace('<a href="#" class="marca"', '<a href="/" class="marca"');
site = site.replace('<div><h4>Contato</h4>', '<div><h4>Páginas</h4><p><a href="/simular/">Simular</a><br><a href="/links/">Cartão digital</a></p><h4 style="margin-top:14px">Contato</h4>');
const T1 = 'Rezende Soluções Corporativas · Correspondente bancário';
site = site.replace(/<title>[^<]*<\/title>/, `<title>${T1}</title>\n${cabeca(T1, URL + '/', DESC)}
<script type="application/ld+json">${JSON.stringify({
  '@context': 'https://schema.org', '@type': 'FinancialService', name: 'Rezende Soluções Corporativas',
  url: URL + '/', telephone: '+55-62-99456-1967', email: 'rezendesolucoescorporativas@gmail.com',
  taxID: '69.164.083/0001-50', areaServed: 'BR',
  address: { '@type': 'PostalAddress', addressLocality: 'Trindade', addressRegion: 'GO', addressCountry: 'BR' },
})}</script>`);
site = site.replace('href="base.css"', 'href="/base.css"');
site = site.replace('href="modelo-3.html"', 'href="/links/"');
site = site.replace('Ver o cartão digital (/links)', 'Abrir o cartão digital');
// enquanto não chega a foto: o "R" no lugar
site = site.replace('<div class="foto">Foto da Emilly<br>(retrato, fundo claro)</div>',
  '<div class="foto"><svg viewBox="0 0 70 100" style="height:45%"><path d="M6 94V6h30a24 24 0 0 1 0 48H22" fill="none" stroke="#FAF8F3" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"/><path d="M22 54h10c6 0 9 2 13 7l17 31" fill="none" stroke="#A9C4D9" stroke-width="3" stroke-linecap="round"/></svg></div>');
site = site.replace('© 2026 Rezende', '© <span id="ano">2026</span> Rezende');
site = site.replace('Rezende Soluções Corporativas.</div>', 'Rezende Soluções Corporativas. <a href="/privacidade/" style="color:inherit">Privacidade</a></div>');
fs.writeFileSync(path.join(OUT, 'index.html'), site);

// ---------- /simular ----------
fs.mkdirSync(path.join(OUT, 'simular'), { recursive: true });
let sim = comum(M('modelo-2.html'));
const T3 = 'Simule sem compromisso · Rezende Soluções Corporativas';
sim = sim.replace(/<title>[^<]*<\/title>/, `<title>${T3}</title>\n${cabeca(T3, URL + '/simular/', 'Peça sua análise de crédito, consignado, consórcio ou consultoria financeira com a Rezende, direto pelo WhatsApp e sem compromisso.')}`);
sim = sim.replace('href="base.css"', 'href="/base.css"');
sim = sim.replace('<a href="#" class="marca">', '<a href="/" class="marca">');
sim = sim.replace('<span class="tel">(62) 99456-1967 · WhatsApp</span>', '<a class="tel" href="/">← Site completo</a>');
sim = sim.replace('Crédito sujeito a análise. © 2026 Rezende Soluções Corporativas.</div>', 'Correspondente bancário de Banco do Brasil S.A. Crédito sujeito a análise. © 2026 Rezende Soluções Corporativas. <a href="/privacidade/" style="color:inherit">Privacidade</a></div>');
fs.writeFileSync(path.join(OUT, 'simular', 'index.html'), sim);

// ---------- /links ----------
let links = comum(M('modelo-3.html'));
const T2 = 'Emilly Rezende · Rezende Soluções Corporativas';
links = links.replace(/<title>[^<]*<\/title>/, `<title>${T2}</title>\n${cabeca(T2, URL + '/links/', 'Fale com a Emilly, da Rezende Soluções Corporativas: crédito, consignado, consórcio e consultoria financeira pelo WhatsApp.')}`);
links = links.replace('href="base.css"', 'href="/base.css"');
// Instagram fica escondido até termos o @
links = links.replace(/\s*<a class="item" href="#"><div class="ic">[\s\S]*?<\/a>/, '');
links = links.replace(/<a class="salvar" href="#">Salvar contato no celular<\/a>/,
  '<a class="salvar" href="/emilly-rezende.vcf" download>Salvar contato no celular</a>\n  <a class="item" href="/simular/" style="margin-top:18px;justify-content:center"><div><b>Simular sem compromisso</b></div></a>\n  <a class="item" href="/" style="margin-top:10px;justify-content:center"><div><b>Ver o site completo</b></div></a>');
links = links.replace('Crédito sujeito a análise.</div>', 'Crédito sujeito a análise.<br><a href="/privacidade/" style="color:inherit">Privacidade</a></div>');
fs.writeFileSync(path.join(OUT, 'links', 'index.html'), links);

// ---------- /privacidade (LGPD) ----------
// Revisar com a Emilly: prazos de guarda e com quem os dados são compartilhados dependem do contrato dela com o banco.
fs.mkdirSync(path.join(OUT, 'privacidade'), { recursive: true });
const T4 = 'Política de privacidade · Rezende Soluções Corporativas';
fs.writeFileSync(path.join(OUT, 'privacidade', 'index.html'), `<!doctype html>
<html lang="pt-BR"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>${T4}</title>
${cabeca(T4, URL + '/privacidade/', 'Como a Rezende Soluções Corporativas trata os seus dados pessoais, conforme a LGPD (Lei 13.709/2018).')}
<link rel="stylesheet" href="/base.css">
<style>body{background:#FAF8F3;color:#122A43;margin:0}
.topo{background:#122A43;padding:16px}.topo a{color:#fff;text-decoration:none;font-weight:600}
main{max-width:760px;margin:0 auto;padding:32px 16px 56px;line-height:1.65}
h1{font-size:30px;margin:0 0 6px}h2{font-size:20px;margin:30px 0 8px}
p,li{font-size:16px}ul{padding-left:20px}a{color:#122A43}
.data{color:#5a6b7d;font-size:14px;margin-bottom:24px}
.aviso{background:#fff;border-left:4px solid #122A43;padding:14px 16px;border-radius:8px;margin:24px 0}</style>
</head><body>
<div class="topo"><a href="/">← Rezende Soluções Corporativas</a></div>
<main>
<h1>Política de privacidade</h1>
<div class="data">Atualizada em 19 de novembro de 2026</div>

<p>Esta página explica como a <b>Rezende Soluções Corporativas</b> (CNPJ 69.164.083/0001-50, Trindade – GO), correspondente bancário de Banco do Brasil S.A., trata os seus dados pessoais, de acordo com a Lei Geral de Proteção de Dados (Lei 13.709/2018).</p>

<h2>1. O que o site coleta</h2>
<p>Este site <b>não pede nem guarda dados pessoais</b>. O formulário "Simule sem compromisso" só monta uma mensagem e abre o seu WhatsApp: nada é enviado ou gravado pelo site.</p>
<p>Para saber quantas pessoas visitam o site, usamos uma contagem de visitas anônima, sem cookies e sem identificar você.</p>

<h2>2. Dados no atendimento</h2>
<p>Quando você fala com a gente pelo WhatsApp, por telefone ou por e-mail, podemos pedir dados como nome, CPF, telefone, endereço, renda, dados do benefício ou do emprego e documentos. Esses dados servem para:</p>
<ul>
<li>analisar o que você pediu e montar a proposta;</li>
<li>encaminhar a proposta para análise da instituição financeira;</li>
<li>cumprir as regras do Banco Central e da instituição parceira, inclusive de prevenção a fraudes e à lavagem de dinheiro.</li>
</ul>

<h2>3. Com quem compartilhamos</h2>
<p>Só com a instituição financeira responsável pelo produto que você escolheu (por exemplo, o Banco do Brasil) e com órgãos públicos quando a lei exigir. <b>Não vendemos nem emprestamos os seus dados</b> para ninguém.</p>

<h2>4. Por quanto tempo guardamos</h2>
<p>Pelo tempo necessário para o atendimento e pelo prazo exigido pelas normas do Banco Central e da instituição parceira. Depois disso, os dados são apagados.</p>

<h2>5. Os seus direitos</h2>
<p>Você pode, a qualquer momento, pedir para saber quais dados temos sobre você, corrigir, receber uma cópia ou pedir que sejam apagados (quando a lei permitir). Basta escrever para <a href="mailto:rezendesolucoescorporativas@gmail.com">rezendesolucoescorporativas@gmail.com</a> ou chamar no WhatsApp <a href="https://wa.me/5562994561967">(62) 99456-1967</a>.</p>

<div class="aviso"><b>Proteja-se contra golpes:</b> a Rezende <b>nunca</b> pede depósito, PIX ou taxa antecipada para liberar crédito, e atende somente pelo (62) 99456-1967. Desconfie de qualquer outro número usando o nosso nome.</div>

<p style="font-size:14px;color:#5a6b7d">Crédito sujeito a análise. © 2026 Rezende Soluções Corporativas.</p>
</main></body></html>
`);

// contato pro celular
fs.writeFileSync(path.join(OUT, 'emilly-rezende.vcf'), [
  'BEGIN:VCARD', 'VERSION:3.0', 'N:Rezende;Emilly;;;', 'FN:Emilly Rezende', 'ORG:Rezende Soluções Corporativas',
  'TITLE:Correspondente bancário', 'TEL;TYPE=CELL,VOICE:+5562994561967', 'EMAIL:rezendesolucoescorporativas@gmail.com',
  'URL:' + URL, 'ADR;TYPE=WORK:;;;Trindade;GO;;Brasil', 'END:VCARD', ''].join('\r\n'));

fs.copyFileSync(path.join(__dirname, 'modelos', 'base.css'), path.join(OUT, 'base.css'));
// Robôs de IA não podem copiar o site (o Google e o Bing continuam liberados, por causa da busca).
const ROBOS_IA = ['GPTBot', 'ChatGPT-User', 'OAI-SearchBot', 'ClaudeBot', 'Claude-Web', 'anthropic-ai', 'Google-Extended',
  'Applebot-Extended', 'CCBot', 'PerplexityBot', 'Perplexity-User', 'Bytespider', 'Amazonbot', 'meta-externalagent',
  'FacebookBot', 'cohere-ai', 'Diffbot', 'ImagesiftBot', 'Omgilibot', 'Timpibot', 'YouBot', 'DeepSeekBot'];
fs.writeFileSync(path.join(OUT, 'robots.txt'),
  ROBOS_IA.map(r => `User-agent: ${r}\nDisallow: /\n`).join('\n') +
  `\nUser-agent: *\nAllow: /\nSitemap: ${URL}/sitemap.xml\n`);
// Links colados em mensagens às vezes levam a pontuação junto (ex.: "rezendecredito.com.br/simular:" no WhatsApp).
// Esses endereços e os nomes antigos dos rascunhos levam para a página certa.
const DESVIOS = [];
for (const [de, para] of [['/simular', '/simular/'], ['/links', '/links/']]) {
  // Cuidado: "/links/:" seria um coringa da Cloudflare (pegaria o próprio /links/ e daria vaivém infinito).
  for (const p of [':', '%3A', '%3a', '.', ',', ')', ';', '!']) { DESVIOS.push(`${de}${p} ${para} 301`); }
}
DESVIOS.push('/modelo-1.html / 301', '/modelo-2.html /simular/ 301', '/modelo-3.html /links/ 301', '/modelo-unido.html / 301',
  '/cartao /links/ 301', '/simulacao /simular/ 301', '/simule /simular/ 301', '/contato /simular/ 301',
  '/whatsapp https://wa.me/5562994561967 302');
fs.writeFileSync(path.join(OUT, '_redirects'), DESVIOS.join('\n') + '\n');
fs.writeFileSync(path.join(OUT, 'sitemap.xml'), `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n<url><loc>${URL}/</loc></url>\n<url><loc>${URL}/simular/</loc></url>\n<url><loc>${URL}/links/</loc></url>\n<url><loc>${URL}/privacidade/</loc></url>\n</urlset>\n`);
// Proteções de todas as páginas. CSP: só carrega coisas do próprio site + fontes do Google
// (scripts embutidos continuam liberados: o formulário e o JSON do Google usam).
const CSP = [
  "default-src 'self'",
  "script-src 'self' 'unsafe-inline' https://static.cloudflareinsights.com", // contador de visitas da Cloudflare
  "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
  "font-src 'self' https://fonts.gstatic.com",
  "img-src 'self' data:",
  "connect-src 'self' https://cloudflareinsights.com",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "frame-ancestors 'self'",
  'upgrade-insecure-requests',
].join('; ');
fs.writeFileSync(path.join(OUT, '_headers'), [
  '/*',
  '  X-Content-Type-Options: nosniff',
  '  Referrer-Policy: strict-origin-when-cross-origin',
  '  X-Frame-Options: SAMEORIGIN',
  '  Strict-Transport-Security: max-age=31536000',
  '  Content-Security-Policy: ' + CSP,
  '  Permissions-Policy: camera=(), microphone=(), geolocation=(), payment=(), usb=(), interest-cohort=()',
  '',
  // endereço provisório: o Google não deve mostrar (o oficial é rezendecredito.com.br)
  'https://rezende-site.pages.dev/*',
  '  X-Robots-Tag: noindex',
  'https://:versao.rezende-site.pages.dev/*',
  '  X-Robots-Tag: noindex',
  '',
].join('\n'));

// Página "não encontrada" (sem ela, qualquer endereço errado abria a página inicial)
fs.writeFileSync(path.join(OUT, '404.html'), `<!doctype html>
<html lang="pt-BR"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Página não encontrada · Rezende Soluções Corporativas</title>
<meta name="robots" content="noindex">
<link rel="icon" href="/favicon.svg" type="image/svg+xml">
<link rel="stylesheet" href="/base.css">
<style>body{min-height:100vh;display:flex;align-items:center;justify-content:center;text-align:center;padding:24px 16px;background:#FAF8F3;color:#122A43}
.caixa{max-width:440px}.caixa h1{font-size:30px;margin:14px 0 10px}.caixa p{margin:0 0 22px;line-height:1.5}
.caixa a{display:inline-block;margin:6px;padding:12px 20px;border-radius:999px;text-decoration:none;font-weight:600}
.um{background:#122A43;color:#fff}.dois{border:2px solid #122A43;color:#122A43}</style>
</head><body><div class="caixa">
${R_SVG.replace('<svg ', '<svg width="64" height="64" ')}
<h1>Página não encontrada</h1>
<p>Esse endereço não existe no site da Rezende Soluções Corporativas. Confira o link ou use um dos botões abaixo.</p>
<a class="um" href="/">Ir para o site</a><a class="dois" href="/simular/">Simular sem compromisso</a>
<p style="margin-top:22px;font-size:14px">A Rezende nunca pede depósito antecipado. Atendimento só pelo (62) 99456-1967.</p>
</div></body></html>
`);

const sobra = ['trocar', 'noindex', 'modelo-', 'Foto da Emilly'].filter(k => (site + links).includes(k));
console.log('publico/ ok', fs.readdirSync(OUT), 'sobrou:', sobra);
