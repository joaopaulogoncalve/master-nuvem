import { fileURLToPath } from "node:url";
// Teste do blog: páginas, agenda automática, sitemap e segurança do texto.
const RAIZ = fileURLToPath(new URL("../", import.meta.url)).replace(/\\/g, "/");
const worker = (await import(new URL("../", import.meta.url).href + "src/worker.js")).default;
const { markdown, postsPublicados } = await import(new URL("../", import.meta.url).href + "src/blog.js");
const { POSTS } = await import(new URL("../", import.meta.url).href + "src/blog-posts.js");
const env = { ASSETS: { fetch: () => new Response("asset") } };
let falhas = 0;
function confere(nome, ok, info) { console.log((ok ? "OK   " : "FALHA") + " " + nome + (ok ? "" : "  -> " + JSON.stringify(info))); if (!ok) falhas++; }
const pegar = async (c) => { const r = await worker.fetch(new Request("https://masternuvem.com.br" + c), env); return { status: r.status, tipo: r.headers.get("Content-Type"), xfo: r.headers.get("X-Frame-Options"), html: await r.text() }; };

const hoje = new Date(Date.now() - 3 * 3600000).toISOString().slice(0, 10);
const publicados = POSTS.filter(p => p.publicar <= hoje);
const futuros = POSTS.filter(p => p.publicar > hoje);
confere("tem posts publicados e agendados", publicados.length >= 5 && futuros.length >= 1, { publicados: publicados.length, futuros: futuros.length });
confere("slugs únicos", new Set(POSTS.map(p => p.slug)).size === POSTS.length, "");

let r = await pegar("/blog");
confere("lista do blog abre como HTML com proteção", r.status === 200 && /text\/html/.test(r.tipo) && r.xfo === "SAMEORIGIN", r.status);
confere("lista mostra só os publicados", publicados.every(p => r.html.includes("/blog/" + p.slug)) && futuros.every(p => !r.html.includes("/blog/" + p.slug)), "");
confere("lista tem busca e palavras em alta", r.html.includes("id=\"busca\"") && r.html.includes("google drive cheio"), "");

r = await pegar("/blog/" + publicados[0].slug);
confere("post publicado abre com título, descrição e dados para o Google", r.status === 200 && r.html.includes("<title>" + publicados[0].titulo.replace(/'/g, "'")) && r.html.includes("application/ld+json") && r.html.includes("rel=\"canonical\""), r.status);
if (futuros.length) {
  r = await pegar("/blog/" + futuros[0].slug);
  confere("post agendado ainda não abre (404)", r.status === 404, r.status);
}
r = await pegar("/blog/nao-existe");
confere("post inexistente dá 404", r.status === 404, r.status);
r = await pegar("/blog/");
confere("/blog/ com barra também abre", r.status === 200, r.status);

r = await pegar("/sitemap.xml");
confere("sitemap com os publicados e sem os agendados", r.status === 200 && /xml/.test(r.tipo) && publicados.every(p => r.html.includes("/blog/" + p.slug)) && futuros.every(p => !r.html.includes(p.slug)), "");

const html = markdown("## Oi <script>alert(1)</script>\n\nTexto **forte** [ok](/painel) [ruim](javascript:alert(1)) [fora](https://exemplo.com)\n\n- um\n- dois\n\n> dica");
confere("texto do post é escapado (sem script)", !html.includes("<script>") && html.includes("&lt;script&gt;"), html);
confere("só links seguros viram link", html.includes("href=\"/painel\"") && !html.includes("href=\"javascript") && html.includes("rel=\"noopener nofollow\""), html);
confere("listas, negrito e dica", html.includes("<ul><li>um</li><li>dois</li></ul>") && html.includes("<strong>forte</strong>") && html.includes("class=\"dica\""), html);

// Nenhum post aponta para um post que ainda não saiu na data dele.
let antes = [];
const datas = Object.fromEntries(POSTS.map(p => [p.slug, p.publicar]));
for (const p of POSTS) for (const m of p.corpo.matchAll(/\]\(\/blog\/([a-z0-9-]+)\)/g)) if (!datas[m[1]] || datas[m[1]] > p.publicar) antes.push(p.slug + " -> " + m[1]);
confere("nenhum link para post inexistente ou ainda agendado", antes.length === 0, antes);

r = await pegar("/");
confere("outras páginas continuam vindo dos arquivos do site", r.html === "asset", r.html.slice(0, 50));
confere("postsPublicados em ordem do mais novo", postsPublicados().every((p, i, a) => i === 0 || a[i - 1].publicar >= p.publicar), "");

console.log(falhas ? "\n" + falhas + " FALHA(S)" : "\nTODOS OS TESTES PASSARAM");
process.exit(falhas ? 1 : 0);
