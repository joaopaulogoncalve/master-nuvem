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
fs.writeFileSync(path.join(OUT, 'index.html'), site);

// ---------- /simular ----------
fs.mkdirSync(path.join(OUT, 'simular'), { recursive: true });
let sim = comum(M('modelo-2.html'));
const T3 = 'Simule sem compromisso · Rezende Soluções Corporativas';
sim = sim.replace(/<title>[^<]*<\/title>/, `<title>${T3}</title>\n${cabeca(T3, URL + '/simular/', 'Peça sua análise de crédito, consignado, consórcio ou consultoria financeira com a Rezende, direto pelo WhatsApp e sem compromisso.')}`);
sim = sim.replace('href="base.css"', 'href="/base.css"');
sim = sim.replace('<a href="#" class="marca">', '<a href="/" class="marca">');
sim = sim.replace('<span class="tel">(62) 99456-1967 · WhatsApp</span>', '<a class="tel" href="/">← Site completo</a>');
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
fs.writeFileSync(path.join(OUT, 'links', 'index.html'), links);

// contato pro celular
fs.writeFileSync(path.join(OUT, 'emilly-rezende.vcf'), [
  'BEGIN:VCARD', 'VERSION:3.0', 'N:Rezende;Emilly;;;', 'FN:Emilly Rezende', 'ORG:Rezende Soluções Corporativas',
  'TITLE:Correspondente bancário', 'TEL;TYPE=CELL,VOICE:+5562994561967', 'EMAIL:rezendesolucoescorporativas@gmail.com',
  'URL:' + URL, 'ADR;TYPE=WORK:;;;Trindade;GO;;Brasil', 'END:VCARD', ''].join('\r\n'));

fs.copyFileSync(path.join(__dirname, 'modelos', 'base.css'), path.join(OUT, 'base.css'));
fs.writeFileSync(path.join(OUT, 'robots.txt'), `User-agent: *\nAllow: /\nSitemap: ${URL}/sitemap.xml\n`);
fs.writeFileSync(path.join(OUT, 'sitemap.xml'), `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n<url><loc>${URL}/</loc></url>\n<url><loc>${URL}/simular/</loc></url>\n<url><loc>${URL}/links/</loc></url>\n</urlset>\n`);
// www → domínio principal
fs.writeFileSync(path.join(OUT, '_headers'), `/*\n  X-Content-Type-Options: nosniff\n  Referrer-Policy: strict-origin-when-cross-origin\n  X-Frame-Options: SAMEORIGIN\n  Strict-Transport-Security: max-age=31536000\n`);

const sobra = ['trocar', 'noindex', 'modelo-', 'Foto da Emilly'].filter(k => (site + links).includes(k));
console.log('publico/ ok', fs.readdirSync(OUT), 'sobrou:', sobra);
