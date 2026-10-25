// Blog da Master Nuvem. As páginas são montadas aqui no servidor (o Google lê o texto direto).
// AGENDA AUTOMÁTICA: cada post tem "publicar" (AAAA-MM-DD, horário de Brasília). Antes dessa data ele não aparece
// em lugar nenhum (lista, página, sitemap); no dia, entra sozinho. Para agendar um post novo, é só adicioná-lo em
// src/blog-posts.js com a data e publicar o site.
import { POSTS, PALAVRAS_EM_ALTA } from "./blog-posts.js";

const SITE = "https://masternuvem.com.br";

function hojeBrasilia() {
  return new Date(Date.now() - 3 * 3600000).toISOString().slice(0, 10);
}

export function postsPublicados() {
  const hoje = hojeBrasilia();
  return POSTS.filter(function (p) { return p.publicar <= hoje; })
    .sort(function (a, b) { return a.publicar < b.publicar ? 1 : a.publicar > b.publicar ? -1 : 0; });
}

// Para a tela do admin: todos os posts, com a situação de cada um.
export function agendaBlog() {
  const hoje = hojeBrasilia();
  return POSTS.map(function (p) {
    return { slug: p.slug, titulo: p.titulo, categoria: p.categoria, publicar: p.publicar, publicado: p.publicar <= hoje };
  }).sort(function (a, b) { return a.publicar < b.publicar ? -1 : 1; });
}

function esc(t) {
  return String(t).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

function dataBr(d) {
  const p = d.split("-");
  const meses = ["jan", "fev", "mar", "abr", "mai", "jun", "jul", "ago", "set", "out", "nov", "dez"];
  return parseInt(p[2], 10) + " de " + meses[parseInt(p[1], 10) - 1] + " de " + p[0];
}

// Texto do post (Markdown simples) → HTML. Tudo é escapado antes; só links /..., https://... e mailto: viram <a>.
function linha(t) {
  let h = esc(t);
  h = h.replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>");
  h = h.replace(/\[([^\]]+)\]\(((?:\/|https:\/\/|mailto:)[^)\s]*)\)/g, function (_, txt, href) {
    const fora = href.indexOf("https://") === 0;
    return "<a href=\"" + href + "\"" + (fora ? " target=\"_blank\" rel=\"noopener nofollow\"" : "") + ">" + txt + "</a>";
  });
  return h;
}

export function markdown(md) {
  return md.trim().split(/\n\s*\n/).map(function (bloco) {
    const b = bloco.trim();
    if (b.indexOf("### ") === 0) return "<h3>" + linha(b.slice(4)) + "</h3>";
    if (b.indexOf("## ") === 0) return "<h2>" + linha(b.slice(3)) + "</h2>";
    if (b.indexOf("> ") === 0) return "<div class=\"dica\">" + b.split("\n").map(function (l) { return linha(l.replace(/^>\s?/, "")); }).join("<br>") + "</div>";
    const linhas = b.split("\n");
    if (linhas.every(function (l) { return /^- /.test(l.trim()); })) {
      return "<ul>" + linhas.map(function (l) { return "<li>" + linha(l.trim().slice(2)) + "</li>"; }).join("") + "</ul>";
    }
    if (linhas.every(function (l) { return /^\d+\. /.test(l.trim()); })) {
      return "<ol>" + linhas.map(function (l) { return "<li>" + linha(l.trim().replace(/^\d+\. /, "")) + "</li>"; }).join("") + "</ol>";
    }
    return "<p>" + linhas.map(linha).join("<br>") + "</p>";
  }).join("\n");
}

function pagina(opcoes) {
  return "<!DOCTYPE html>\n<html lang=\"pt-BR\">\n<head>\n<meta charset=\"UTF-8\">\n" +
    "<meta name=\"viewport\" content=\"width=device-width, initial-scale=1.0\">\n" +
    "<title>" + esc(opcoes.titulo) + "</title>\n" +
    "<meta name=\"description\" content=\"" + esc(opcoes.descricao) + "\">\n" +
    (opcoes.palavras ? "<meta name=\"keywords\" content=\"" + esc(opcoes.palavras) + "\">\n" : "") +
    "<link rel=\"canonical\" href=\"" + SITE + opcoes.caminho + "\">\n" +
    "<meta property=\"og:type\" content=\"" + (opcoes.artigo ? "article" : "website") + "\">\n" +
    "<meta property=\"og:title\" content=\"" + esc(opcoes.titulo) + "\">\n" +
    "<meta property=\"og:description\" content=\"" + esc(opcoes.descricao) + "\">\n" +
    "<meta property=\"og:url\" content=\"" + SITE + opcoes.caminho + "\">\n" +
    "<meta property=\"og:image\" content=\"" + SITE + "/marca/logo-completa.png\">\n" +
    "<link rel=\"icon\" type=\"image/png\" href=\"/marca/icone-64.png\">\n" +
    "<script src=\"https://cdn.tailwindcss.com\"></script>\n" +
    (opcoes.jsonld ? "<script type=\"application/ld+json\">" + JSON.stringify(opcoes.jsonld).replace(/</g, "\\u003c") + "</script>\n" : "") +
    "<style>\n" +
    "body{background:radial-gradient(900px 500px at 15% -5%,#0b3a8f55,transparent),radial-gradient(800px 500px at 100% 10%,#6d28d933,transparent),#030a1c}\n" +
    ".glass{background:linear-gradient(160deg,#0c1a3dcc,#07102acc);border:1px solid #1e40af88;box-shadow:0 0 50px #38bdf822}\n" +
    ".grad{background:linear-gradient(90deg,#38bdf8,#818cf8,#22d3ee);-webkit-background-clip:text;background-clip:text;color:transparent}\n" +
    ".cta{background:linear-gradient(90deg,#0ea5e9,#6366f1);box-shadow:0 0 30px #38bdf866}\n" +
    ".campo{width:100%;padding:12px 14px;border-radius:12px;background:#0a1633;border:1px solid #1e3a8a;color:#fff;outline:none}\n" +
    ".campo:focus{border-color:#38bdf8}\n" +
    ".chip{padding:5px 12px;border-radius:9999px;border:1px solid #1e40af;background:#0c1a3d;color:#93c5fd;font-size:13px}\n" +
    ".chip:hover,.chip.on{border-color:#38bdf8;color:#fff}\n" +
    ".conteudo{color:#cbd5e1;line-height:1.75;font-size:17px}\n" +
    ".conteudo h2{color:#fff;font-size:1.45rem;font-weight:800;margin:2.2rem 0 .8rem}\n" +
    ".conteudo h3{color:#e2e8f0;font-size:1.15rem;font-weight:700;margin:1.6rem 0 .5rem}\n" +
    ".conteudo p{margin:0 0 1rem}\n" +
    ".conteudo ul,.conteudo ol{margin:0 0 1rem 1.4rem}\n" +
    ".conteudo ul{list-style:disc}.conteudo ol{list-style:decimal}\n" +
    ".conteudo li{margin:.3rem 0}\n" +
    ".conteudo a{color:#67e8f9;text-decoration:underline}\n" +
    ".conteudo strong{color:#fff}\n" +
    ".conteudo .dica{background:#0c1a3d;border-left:4px solid #38bdf8;border-radius:12px;padding:14px 16px;margin:0 0 1rem;color:#e2e8f0}\n" +
    "</style>\n</head>\n<body class=\"text-white font-sans antialiased min-h-screen\">\n" +
    "<nav class=\"border-b border-blue-900/50 bg-slate-950/60 backdrop-blur\"><div class=\"max-w-4xl mx-auto px-4 h-16 flex items-center justify-between\">" +
    "<a href=\"/\" class=\"flex items-center gap-2 font-bold text-xl\"><img src=\"/marca/mascote.svg\" alt=\"\" class=\"h-8 w-auto\">Master<span class=\"grad\">Nuvem</span></a>" +
    "<div class=\"flex gap-5 text-sm font-semibold text-blue-300\"><a href=\"/blog\" class=\"hover:text-white\">Blog</a><a href=\"/painel\" class=\"hover:text-white\">Entrar</a></div></div></nav>\n" +
    opcoes.corpo +
    "\n<footer class=\"border-t border-blue-900/50 mt-10\"><div class=\"max-w-4xl mx-auto px-4 py-8 text-center text-sm text-slate-500 space-x-2\">" +
    "<a href=\"/\" class=\"hover:text-white\">Início</a> · <a href=\"/blog\" class=\"hover:text-white\">Blog</a> · <a href=\"/termos\" class=\"hover:text-white\">Termos de uso</a> · " +
    "<a href=\"/privacidade\" class=\"hover:text-white\">Política de privacidade</a></div></footer>\n" +
    "<script src=\"/assistente.js\" defer></script>\n</body>\n</html>";
}

function htmlResposta(html, status) {
  return new Response(html, { status: status || 200, headers: { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "public, max-age=600" } });
}

function cartaoPost(p) {
  return "<a href=\"/blog/" + p.slug + "\" class=\"post glass rounded-2xl p-5 block hover:border-cyan-400 transition\" data-busca=\"" +
    esc((p.titulo + " " + p.descricao + " " + p.palavras + " " + p.categoria).normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase()) + "\" data-cat=\"" + esc(p.categoria) + "\">" +
    "<p class=\"text-xs uppercase tracking-wider text-cyan-300\">" + esc(p.categoria) + " · " + dataBr(p.publicar) + " · " + p.leitura + " min de leitura</p>" +
    "<h2 class=\"text-lg font-bold mt-1\">" + esc(p.titulo) + "</h2>" +
    "<p class=\"text-sm text-slate-400 mt-1\">" + esc(p.descricao) + "</p></a>";
}

function paginaLista() {
  const posts = postsPublicados();
  const categorias = Array.from(new Set(posts.map(function (p) { return p.categoria; })));
  const corpo =
    "<main class=\"max-w-4xl mx-auto px-4 py-10 space-y-6\">" +
    "<div><h1 class=\"text-3xl md:text-4xl font-extrabold\">Blog da <span class=\"grad\">Master Nuvem</span></h1>" +
    "<p class=\"text-slate-400 mt-2\">Passo a passo da plataforma, dicas para guardar e entregar arquivos, e como a gente melhora o site ouvindo quem usa.</p></div>" +
    "<div class=\"glass rounded-2xl p-4 space-y-3\"><input id=\"busca\" type=\"search\" class=\"campo\" placeholder=\"O que você procura? (ex.: google drive cheio, vender fotos, senha)\" autocomplete=\"off\">" +
    "<div><p class=\"text-xs text-slate-400 mb-2\">Mais procurados:</p><div class=\"flex flex-wrap gap-2\">" +
    PALAVRAS_EM_ALTA.map(function (k) { return "<button type=\"button\" class=\"chip\" data-termo=\"" + esc(k) + "\">" + esc(k) + "</button>"; }).join("") + "</div></div>" +
    "<div class=\"flex flex-wrap gap-2\"><button type=\"button\" class=\"chip on\" data-cat=\"\">Todos</button>" +
    categorias.map(function (c) { return "<button type=\"button\" class=\"chip\" data-cat=\"" + esc(c) + "\">" + esc(c) + "</button>"; }).join("") + "</div></div>" +
    "<p id=\"nada\" class=\"hidden text-slate-400\">Nada encontrado. Tente outra palavra ou pergunte para a nuvenzinha no canto da tela. 😉</p>" +
    "<div id=\"lista\" class=\"space-y-3\">" + posts.map(cartaoPost).join("") + "</div>" +
    "<div class=\"glass rounded-2xl p-6 text-center\"><p class=\"font-bold text-lg\">Quer testar na prática?</p><p class=\"text-slate-400 text-sm mt-1\">20 MB grátis por 24 horas, sem cartão.</p>" +
    "<a href=\"/painel?cupom=NUVEM1DIA\" class=\"cta inline-block font-bold px-6 py-3 rounded-xl mt-4\">Testar grátis</a></div></main>" +
    "<script>(function(){var cat='';var busca=document.getElementById('busca');" +
    "function sem(t){return t.normalize('NFD').replace(/[\\u0300-\\u036f]/g,'').toLowerCase();}" +
    "function filtrar(){var termos=sem(busca.value).split(/\\s+/).filter(function(x){return x.length>1;});var n=0;" +
    "document.querySelectorAll('.post').forEach(function(p){var ok=(!cat||p.getAttribute('data-cat')===cat)&&termos.every(function(t){return p.getAttribute('data-busca').indexOf(t)>-1;});p.style.display=ok?'':'none';if(ok)n++;});" +
    "document.getElementById('nada').classList.toggle('hidden',n>0);}" +
    "busca.addEventListener('input',filtrar);" +
    "document.querySelectorAll('[data-termo]').forEach(function(b){b.addEventListener('click',function(){busca.value=b.getAttribute('data-termo');filtrar();});});" +
    "document.querySelectorAll('button[data-cat]').forEach(function(b){b.addEventListener('click',function(){cat=b.getAttribute('data-cat');document.querySelectorAll('button[data-cat]').forEach(function(x){x.classList.toggle('on',x===b);});filtrar();});});" +
    "var q=new URLSearchParams(location.search).get('q');if(q){busca.value=q;filtrar();}})();</script>";
  return pagina({
    titulo: "Blog Master Nuvem: armazenamento em nuvem, fotos e passo a passo",
    descricao: "Dicas para guardar e entregar arquivos, vender fotos de eventos, alternativas ao Google Drive cheio e o passo a passo completo da Master Nuvem.",
    palavras: PALAVRAS_EM_ALTA.join(", "),
    caminho: "/blog",
    corpo: corpo
  });
}

function paginaPost(p) {
  const relacionados = postsPublicados().filter(function (x) { return x.slug !== p.slug; })
    .sort(function (a, b) { return (b.categoria === p.categoria) - (a.categoria === p.categoria); }).slice(0, 3);
  const corpo =
    "<main class=\"max-w-3xl mx-auto px-4 py-10\">" +
    "<p class=\"text-sm text-slate-400\"><a href=\"/blog\" class=\"hover:text-white\">← Blog</a> · " + esc(p.categoria) + "</p>" +
    "<article><h1 class=\"text-3xl md:text-4xl font-extrabold mt-3 leading-tight\">" + esc(p.titulo) + "</h1>" +
    "<p class=\"text-slate-400 mt-3\">" + esc(p.descricao) + "</p>" +
    "<p class=\"text-xs text-slate-500 mt-2\">Publicado em " + dataBr(p.publicar) + " · " + p.leitura + " min de leitura · Equipe Master Nuvem</p>" +
    "<div class=\"conteudo mt-8\">" + markdown(p.corpo) + "</div></article>" +
    "<div class=\"glass rounded-2xl p-6 mt-10 flex flex-col sm:flex-row items-center gap-4\"><img src=\"/marca/mascote.svg\" alt=\"\" class=\"h-14\">" +
    "<div class=\"flex-1 text-center sm:text-left\"><p class=\"font-bold\">Ficou alguma dúvida?</p><p class=\"text-sm text-slate-400\">Pergunte para a nuvenzinha no canto da tela ou teste grátis por 24 horas.</p></div>" +
    "<a href=\"/painel?cupom=NUVEM1DIA\" class=\"cta font-bold px-5 py-3 rounded-xl whitespace-nowrap\">Testar grátis</a></div>" +
    (relacionados.length ? "<div class=\"mt-10\"><p class=\"font-bold mb-3\">Leia também</p><div class=\"space-y-3\">" + relacionados.map(cartaoPost).join("") + "</div></div>" : "") +
    "</main>";
  return pagina({
    titulo: p.titulo + " | Blog Master Nuvem",
    descricao: p.descricao,
    palavras: p.palavras,
    caminho: "/blog/" + p.slug,
    artigo: true,
    jsonld: {
      "@context": "https://schema.org", "@type": "BlogPosting", headline: p.titulo, description: p.descricao,
      datePublished: p.publicar, inLanguage: "pt-BR", mainEntityOfPage: SITE + "/blog/" + p.slug,
      author: { "@type": "Organization", name: "Master Nuvem" },
      publisher: { "@type": "Organization", name: "Master Nuvem", logo: { "@type": "ImageObject", url: SITE + "/marca/logo-completa.png" } }
    },
    corpo: corpo
  });
}

function sitemap() {
  const fixos = ["/", "/blog", "/portais", "/termos", "/privacidade"];
  const urls = fixos.map(function (c) { return "<url><loc>" + SITE + c + "</loc></url>"; })
    .concat(postsPublicados().map(function (p) { return "<url><loc>" + SITE + "/blog/" + p.slug + "</loc><lastmod>" + p.publicar + "</lastmod></url>"; }));
  return new Response("<?xml version=\"1.0\" encoding=\"UTF-8\"?>\n<urlset xmlns=\"http://www.sitemaps.org/schemas/sitemap/0.9\">\n" + urls.join("\n") + "\n</urlset>", {
    headers: { "Content-Type": "application/xml; charset=utf-8", "Cache-Control": "public, max-age=3600" }
  });
}

// Devolve a resposta para /blog, /blog/<slug> e /sitemap.xml; null se o caminho não é do blog.
export function tratarBlog(url) {
  const c = url.pathname.replace(/\/+$/, "") || "/";
  if (c === "/sitemap.xml") return sitemap();
  if (c === "/blog") return htmlResposta(paginaLista());
  const m = c.match(/^\/blog\/([a-z0-9-]+)$/);
  if (!m) return null;
  const p = postsPublicados().find(function (x) { return x.slug === m[1]; });
  if (!p) {
    return htmlResposta(pagina({
      titulo: "Post não encontrado | Blog Master Nuvem", descricao: "Este post não existe ou ainda não foi publicado.", caminho: "/blog",
      corpo: "<main class=\"max-w-3xl mx-auto px-4 py-20 text-center\"><h1 class=\"text-2xl font-bold\">Post não encontrado</h1>" +
        "<p class=\"text-slate-400 mt-2\">Ele pode ainda não ter sido publicado.</p><a href=\"/blog\" class=\"cta inline-block font-bold px-6 py-3 rounded-xl mt-6\">Ver todos os posts</a></main>"
    }), 404);
  }
  return htmlResposta(paginaPost(p));
}
