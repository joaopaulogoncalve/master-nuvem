import { fileURLToPath } from "node:url";
// Teste do portfólio público do fotógrafo: galerias, fotos, capa, orçamento e sitemap.
import { DatabaseSync } from "node:sqlite";
import { readFileSync } from "node:fs";
import { createHmac } from "node:crypto";

const RAIZ = fileURLToPath(new URL("../", import.meta.url)).replace(/\\/g, "/");
const worker = (await import(new URL("../", import.meta.url).href + "src/worker.js")).default;

const db = new DatabaseSync(":memory:");
for (const m of ["0001_init", "0002_recuperar_senha", "0003_aceite_termos", "0004_avisos", "0005_portal", "0006_cobrancas", "0007_cupons", "0008_tabela_precos", "0009_cupom_preco", "0010_assistente", "0011_sentinela", "0012_faq_mais", "0013_eventos", "0014_faq_blog_eventos", "0015_regras_acesso", "0016_faq_estudio", "0017_lixeira", "0018_visual", "0019_aumentar_espaco", "0020_fotos_extras", "0021_bancos", "0022_contratos", "0023_copias", "0024_contrato_obrigatorio", "0025_senha_cliente", "0026_varias_pessoas", "0027_confirmar_email", "0028_portfolio", "0029_faq_avaliar"]) db.exec(readFileSync(RAIZ + "migrations/" + m + ".sql", "utf8"));

const DB = {
  prepare(sql) {
    let args = [];
    const st = {
      bind(...a) { args = a; return st; },
      async first() { return db.prepare(sql).get(...args) || null; },
      async run() {
        const r = db.prepare(sql).run(...args);
        return { meta: { changes: Number(r.changes), last_row_id: Number(r.lastInsertRowid) } };
      },
      async all() { return { results: db.prepare(sql).all(...args) }; }
    };
    return st;
  }
};

const SEGREDO = "segredo-teste";
const env = { DB, MP_ACCESS_TOKEN: "TEST-fake", MP_WEBHOOK_SECRET: SEGREDO, ASSETS: { fetch: () => new Response("") } };

// Mercado Pago simulado
const pagamentos = {};
let ultimaPreferencia = null;
const fetchMp = async (url, op) => {
  url = String(url);
  if (url.includes("/checkout/preferences")) {
    ultimaPreferencia = JSON.parse(op.body);
    return new Response(JSON.stringify({ init_point: "https://mp/checkout/1" }));
  }
  const m = url.match(/\/v1\/payments\/(\d+)/);
  if (m) {
    if (!pagamentos[m[1]]) return new Response("{}", { status: 404 });
    return new Response(JSON.stringify(pagamentos[m[1]]));
  }
  throw new Error("fetch inesperado " + url);
};

const BASE = "https://masternuvem.com.br";
let cookie = "";
async function chamar(caminho, corpo, extra) {
  const h = Object.assign({ "Content-Type": "application/json", "Origin": BASE, "CF-Connecting-IP": caminho === "/api/register" ? "10.9." + Math.random() : "10.0.0.1" }, extra || {});
  if (cookie) h.Cookie = cookie;
  const r = await worker.fetch(new Request(BASE + caminho, {
    method: corpo === undefined ? "GET" : "POST", headers: h, body: corpo === undefined ? undefined : JSON.stringify(corpo)
  }), env);
  // Nos testes, conta nova já sai com o e-mail confirmado (o teste da confirmação desliga isso).
  if (caminho === "/api/register" && !globalThis.__semConfirmar) db.prepare("UPDATE users SET email_confirmado_em = COALESCE(email_confirmado_em, datetime('now'))").run();
  const sc = r.headers.get("Set-Cookie");
  if (sc) cookie = sc.split(";")[0];
  return { status: r.status, dados: await r.json() };
}

function assinar(id, reqId, ts) {
  const v1 = createHmac("sha256", SEGREDO).update("id:" + id + ";request-id:" + reqId + ";ts:" + ts + ";").digest("hex");
  return { "x-signature": "ts=" + ts + ",v1=" + v1, "x-request-id": reqId };
}
async function aviso(id, assinado = true) {
  return chamar("/api/mp/webhook?data.id=" + id + "&type=payment", { type: "payment", data: { id: String(id) } },
    assinado ? assinar(String(id), "req-" + id, "1700000000") : { "x-signature": "ts=1,v1=00", "x-request-id": "x" });
}
const subs = () => db.prepare("SELECT id, quota_gb, status, paid_until, mp_payment_id FROM subscriptions ORDER BY id").all();
let falhas = 0;
function confere(nome, ok, info) { console.log((ok ? "OK   " : "FALHA") + " " + nome + (ok ? "" : "  -> " + JSON.stringify(info))); if (!ok) falhas++; }


let r;
db.exec("PRAGMA foreign_keys = ON");
Object.assign(env, { B2_ENDPOINT: "s3.us-east-005.backblazeb2.com", B2_BUCKET: "balde", B2_KEY_ID: "005abc", B2_APP_KEY: "K005xyz", RESEND_API_KEY: "re_x" });
const apagados = [], emails = [];
globalThis.fetch = async (url, op) => {
  url = String(url);
  if (url.includes("api.resend.com")) { emails.push(JSON.parse(op.body)); return new Response("{}"); }
  if (url.includes("backblazeb2.com")) {
    const m = (op && op.method) || "GET";
    if (m === "HEAD") return new Response(null, { status: 200, headers: { "Content-Length": "5000" } });
    if (m === "DELETE") { apagados.push(url.split("?")[0].split("/balde/")[1]); return new Response(null, { status: 204 }); }
  }
  return fetchMp(url, op);
};
const reg = async (email) => { cookie = ""; await chamar("/api/register", { email, senha: "senha-forte-1", nome: email.split("@")[0], aceite: true }); return cookie; };
const dono = await reg("foto@t.com");
const outro = await reg("outro@t.com");
db.prepare("INSERT INTO subscriptions (user_id, quota_gb, status, paid_until) VALUES (1, 10, 'active', datetime('now','+30 days')), (2, 10, 'active', datetime('now','+30 days'))").run();
async function enviarFoto(quem, uso) {
  cookie = quem;
  const o = await chamar("/api/files/upload-url", { name: "foto.jpg", size: 5000, uso: uso || "portfolio" });
  await chamar("/api/files/complete", { id: o.dados.id });
  return o.dados.id;
}
async function pagina(slug) {
  const resp = await worker.fetch(new Request(BASE + "/api/f/info?slug=" + slug), env);
  return { status: resp.status, dados: await resp.json() };
}
const contatos = () => db.prepare("SELECT whatsapp, instagram FROM portais WHERE slug = 'luz'").get();

cookie = dono;
r = await chamar("/api/portfolio");
confere("sem estúdio: pede para criar a página primeiro", r.status === 404 && r.dados.sem_portal, r);
await chamar("/api/portal/salvar", { nome: "Luz Fotografia", slug: "luz", cor: "#0d9488", tema: "classico" });
await chamar("/api/portal/marca", { bio: "Fotógrafa de casamentos em Goiânia" });
cookie = outro;
await chamar("/api/portal/salvar", { nome: "Outro", slug: "outro", cor: "#000000", tema: "classico" });

cookie = dono;
r = await chamar("/api/portfolio/salvar", { ativo: false, titulo: "Casamentos e família", cidade: "Goiânia - GO", whatsapp: "(62) 98284-0000", instagram: "https://instagram.com/luz.foto/" });
confere("salva textos; WhatsApp e Instagram limpos", r.status === 200 && contatos().instagram === "luz.foto" && contatos().whatsapp === "62982840000", contatos());
r = await chamar("/api/portfolio/salvar", { whatsapp: "123" });
confere("WhatsApp curto recusado", r.status === 400, r);
r = await chamar("/api/portfolio/salvar", { instagram: "<script>" });
confere("Instagram inválido recusado", r.status === 400, r);

r = await chamar("/api/portfolio/galerias/nova", { titulo: "Casamentos" });
const gal = r.dados.id;
confere("cria galeria", r.status === 200 && gal, r);
r = await chamar("/api/portfolio/galerias/nova", { titulo: "  " });
confere("galeria sem nome recusada", r.status === 400, r);

const f1 = await enviarFoto(dono), f2 = await enviarFoto(dono);
cookie = dono;
r = await chamar("/api/files");
confere("fotos do portfólio fora de Meus arquivos (mas contam na cota)", r.dados.arquivos.length === 0 && r.dados.usado_bytes === 10000, r.dados);
r = await chamar("/api/portfolio/fotos/adicionar", { galeria_id: gal, file_id: f1 });
const pf1 = r.dados.id;
confere("foto entra na galeria", r.status === 200, r);
await chamar("/api/portfolio/fotos/adicionar", { galeria_id: gal, file_id: f2 });
r = await chamar("/api/portfolio/fotos/adicionar", { galeria_id: gal, file_id: f1 });
confere("mesma foto não entra 2 vezes", r.status === 400, r);
const logo = await enviarFoto(dono, "logo");
cookie = dono;
r = await chamar("/api/portfolio/fotos/adicionar", { galeria_id: gal, file_id: logo });
confere("arquivo que não é do portfólio recusado", r.status === 404, r);
const fOutro = await enviarFoto(outro);
cookie = dono;
r = await chamar("/api/portfolio/fotos/adicionar", { galeria_id: gal, file_id: fOutro });
confere("foto de outra pessoa recusada", r.status === 404, r);
cookie = outro;
r = await chamar("/api/portfolio/fotos/adicionar", { galeria_id: gal, file_id: fOutro });
confere("outra pessoa não mexe na minha galeria", r.status === 404, r);

let pub = await pagina("luz");
confere("desligado: página não aparece", pub.status === 404, pub);

cookie = dono;
r = await chamar("/api/portfolio/salvar", { ativo: true, titulo: "Casamentos e família", cidade: "Goiânia - GO", whatsapp: "62982840000", instagram: "luz.foto", capa_id: f2 });
confere("liga a página com capa", r.status === 200 && r.dados.link === BASE + "/f/luz", r);
r = await chamar("/api/portfolio/salvar", { ativo: true, capa_id: fOutro });
confere("capa de outra pessoa recusada", r.status === 404, r);
r = await chamar("/api/portfolio");
confere("fotógrafo vê galeria, fotos e link", r.dados.portfolio.ativo && r.dados.galerias[0].fotos.length === 2 && r.dados.portfolio.capa_id === f2 && r.dados.portfolio.link.endsWith("/f/luz"), r.dados);

pub = await pagina("luz");
confere("página pública no ar", pub.status === 200 && pub.dados.nome === "Luz Fotografia" && pub.dados.bio && pub.dados.galerias.length === 1 && pub.dados.galerias[0].fotos.length === 2, pub);
confere("página pública tem capa e contatos, sem e-mail nem ids", pub.dados.capa && pub.dados.whatsapp === "62982840000" && !JSON.stringify(pub.dados).includes("foto@t.com") && pub.dados.galerias[0].fotos.every(f => typeof f === "string"), pub.dados);
await chamar("/api/portfolio/galerias/nova", { titulo: "Vazia" });
confere("galeria vazia não aparece", (await pagina("luz")).dados.galerias.length === 1, "");
confere("endereço inválido", (await pagina("..%2Fx")).status === 404, "");

// a página /f/<slug> abre o portfolio.html
let pedidoAsset = null;
env.ASSETS = { fetch: (req) => { pedidoAsset = new URL(req.url).pathname; return new Response("<html>"); } };
await worker.fetch(new Request(BASE + "/f/luz"), env);
confere("/f/luz abre a página do portfólio", pedidoAsset === "/portfolio", pedidoAsset);

// sitemap
let sm = await (await worker.fetch(new Request(BASE + "/sitemap.xml"), env)).text();
confere("portfólio no ar entra no sitemap", sm.includes(BASE + "/f/luz") && !sm.includes("/f/outro"), sm.slice(-300));

// orçamento
cookie = "";
emails.length = 0;
r = await chamar("/api/f/orcamento", { slug: "luz", nome: "Carla", email: "carla@t.com", whatsapp: "(62) 99999-1111", tipo: "Casamento", quando: "maio/2027", mensagem: "Casamento para 150 pessoas" });
confere("pedido de orçamento aceito", r.status === 200, r);
confere("fotógrafo recebe e-mail com o pedido", emails.length === 1 && emails[0].to[0] === "foto@t.com" && /Carla/.test(emails[0].subject) && /99999/.test(emails[0].text), emails);
r = await chamar("/api/f/orcamento", { slug: "luz", nome: "Sem contato" });
confere("orçamento sem e-mail nem WhatsApp recusado", r.status === 400, r);
r = await chamar("/api/f/orcamento", { slug: "outro", nome: "X", email: "x@t.com" });
confere("orçamento para página desligada recusado", r.status === 404, r);
for (let i = 0; i < 5; i++) await chamar("/api/f/orcamento", { slug: "luz", nome: "Robô " + i, email: "r@t.com" });
r = await chamar("/api/f/orcamento", { slug: "luz", nome: "Robô 6", email: "r@t.com" });
confere("limite de 5 pedidos por hora por conexão", r.status === 429, r);

cookie = dono;
r = await chamar("/api/portfolio");
const orc = r.dados.orcamentos.find(o => o.nome === "Carla");
confere("fotógrafo vê o pedido como novo", orc && orc.status === "novo" && orc.tipo === "Casamento", r.dados.orcamentos);
r = await chamar("/api/portfolio/orcamentos/status", { id: orc.id, status: "arquivado" });
confere("arquiva o pedido", r.status === 200 && !(await chamar("/api/portfolio")).dados.orcamentos.some(o => o.id === orc.id), r);
cookie = outro;
r = await chamar("/api/portfolio/orcamentos/status", { id: orc.id, status: "novo" });
confere("outra pessoa não mexe no meu pedido", r.status === 404, r);

// plano vencido tira a página do ar e do sitemap
db.prepare("UPDATE subscriptions SET paid_until = datetime('now','-1 day') WHERE user_id = 1").run();
confere("plano vencido: página sai do ar", (await pagina("luz")).status === 404, "");
sm = await (await worker.fetch(new Request(BASE + "/sitemap.xml"), env)).text();
confere("plano vencido: sai do sitemap", !sm.includes("/f/luz"), "");
db.prepare("UPDATE subscriptions SET paid_until = datetime('now','+30 days') WHERE user_id = 1").run();

// apagar foto e galeria
cookie = dono;
apagados.length = 0;
r = await chamar("/api/portfolio/fotos/remover", { id: pf1 });
confere("apaga a foto (armazenamento + banco)", r.status === 200 && apagados.length === 1 && !db.prepare("SELECT id FROM files WHERE id = ?").get(f1), apagados);
r = await chamar("/api/portfolio/galerias/remover", { id: gal });
confere("apaga a galeria e a foto que sobrou; capa volta a ser nula", r.status === 200 && r.dados.restam === 0 && apagados.length === 2 && db.prepare("SELECT portfolio_capa_id c FROM portais WHERE slug = 'luz'").get().c === null, { r, apagados });
confere("sem fotos: página sai do ar", (await pagina("luz")).status === 404, "");

console.log(falhas ? "\n" + falhas + " FALHA(S)" : "\nTODOS OS TESTES PASSARAM");
process.exit(falhas ? 1 : 0);
