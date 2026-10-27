import { fileURLToPath } from "node:url";
// Teste local do fluxo checkout -> webhook, com banco SQLite em memória e Mercado Pago simulado.
import { DatabaseSync } from "node:sqlite";
import { readFileSync } from "node:fs";
import { createHmac } from "node:crypto";

const RAIZ = fileURLToPath(new URL("../", import.meta.url)).replace(/\\/g, "/");
const worker = (await import(new URL("../", import.meta.url).href + "src/worker.js")).default;

const db = new DatabaseSync(":memory:");
for (const m of ["0001_init", "0002_recuperar_senha", "0003_aceite_termos", "0004_avisos", "0005_portal", "0006_cobrancas", "0007_cupons", "0008_tabela_precos", "0009_cupom_preco", "0010_assistente", "0011_sentinela", "0012_faq_mais", "0013_eventos", "0014_faq_blog_eventos", "0015_regras_acesso", "0016_faq_estudio", "0017_lixeira", "0018_visual", "0019_aumentar_espaco", "0020_fotos_extras", "0021_bancos", "0022_contratos", "0023_copias", "0024_contrato_obrigatorio", "0025_senha_cliente", "0026_varias_pessoas"]) db.exec(readFileSync(RAIZ + "migrations/" + m + ".sql", "utf8"));

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
globalThis.fetch = async (url, op) => {
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


const { checarLinksBancos } = await import(new URL("../", import.meta.url).href + "src/bancos.js");
const emails = [];
const status404 = new Set();
globalThis.fetch = async (url, op) => {
  url = String(url);
  if (url.includes("api.resend.com")) { emails.push(JSON.parse(op.body)); return new Response("{}"); }
  if (url.startsWith("https://")) return new Response("ok", { status: status404.has(url) ? 404 : 200 });
  throw new Error("fetch inesperado " + url);
};
env.RESEND_API_KEY = "re_teste";

let r = await chamar("/api/bancos");
confere("lista pública traz os 17 bancos, Mercado Pago primeiro", r.dados.bancos.length === 17 && r.dados.bancos[0].nome === "Mercado Pago" && r.dados.bancos[0].tem_api === true, r.dados.bancos.length);
const nu = r.dados.bancos.find(b => b.nome === "Nubank");
confere("Nubank: só PIX e confirmação manual", nu.link_pix && !nu.link_pagamento && nu.tem_api === false, nu);

r = await chamar("/api/bancos/pedido", { banco: "Banrisul", email: "nao-e-email" });
confere("pedido com e-mail inválido é recusado", r.status === 400, r);
r = await chamar("/api/bancos/pedido", { banco: "Banrisul", nome: "Carla Souza", email: "carla@t.com" });
confere("pedido de banco novo é aceito", r.status === 200 && r.dados.protocolo, r);
const pedidoId = r.dados.protocolo;
confere("suporte recebe e-mail do pedido", emails.some(e => e.to.includes("contato@masternuvem.com.br") && /Banrisul/.test(e.subject)), emails.map(e => e.subject));
await chamar("/api/bancos/pedido", { banco: "Cora", email: "carla@t.com" });
await chamar("/api/bancos/pedido", { banco: "Cora", email: "carla@t.com" });
r = await chamar("/api/bancos/pedido", { banco: "Cora", email: "carla@t.com" });
confere("limite de 3 pedidos por hora por IP", r.status === 429, r.status);

// admin
cookie = "";
await chamar("/api/register", { email: "joao@t.com", senha: "senha-forte-1", nome: "João", aceite: true });
db.prepare("UPDATE users SET role = 'admin' WHERE email = 'joao@t.com'").run();
r = await chamar("/api/admin/bancos");
confere("admin vê os pedidos abertos", r.dados.pedidos.length === 3 && r.dados.pedidos[0].banco === "Banrisul", r.dados.pedidos);
r = await chamar("/api/admin/bancos/salvar", { pedido_id: pedidoId, nome: "Banrisul", link_pix: "http://golpe.com/pix" });
confere("link sem https é recusado", r.status === 400, r);
emails.length = 0;
r = await chamar("/api/admin/bancos/salvar", { pedido_id: pedidoId, nome: "Banrisul", palavras: "banrisul", link_pix: "https://www.banrisul.com.br/pix" });
confere("aprovar o pedido salva o banco e avisa quem pediu", r.status === 200 && r.dados.avisado === "carla@t.com", r);
confere("e-mail da Carla tem o link do PIX", emails.some(e => e.to.includes("carla@t.com") && JSON.stringify(e).includes("https://www.banrisul.com.br/pix")), emails.map(e => e.to));
confere("pedido fica como aprovado", db.prepare("SELECT status FROM bancos_pedidos WHERE id = ?").get(pedidoId).status === "aprovado", "");
cookie = "";
r = await chamar("/api/bancos");
confere("Banrisul já aparece para todo mundo", r.dados.bancos.some(b => b.nome === "Banrisul"), "");
r = await chamar("/api/admin/bancos");
confere("rota de admin bloqueada sem login", r.status === 401, r.status);

// checagem automática: 3 bancos por rodada; link quebrado → e-mail uma vez
const fer = { enviarEmail: async (env, para, assunto) => { emails.push({ to: [para], subject: assunto }); }, escaparHtml: s => s, SITE: "https://x", EMAIL_SUPORTE: "contato@masternuvem.com.br" };
const mp = db.prepare("SELECT link_pix FROM bancos WHERE nome = 'Mercado Pago'").get();
status404.add(mp.link_pix);
emails.length = 0;
const n = await checarLinksBancos(env, fer);
confere("checagem acha o link quebrado do Mercado Pago e avisa", n === 1 && emails.length === 1 && /quebrado/.test(emails[0].subject), { n, emails });
confere("marca o link como quebrado e só confere 3 por rodada", db.prepare("SELECT link_pix_ok FROM bancos WHERE nome = 'Mercado Pago'").get().link_pix_ok === 0 && db.prepare("SELECT COUNT(*) AS n FROM bancos WHERE checado_em IS NOT NULL").get().n === 3, "");
for (let i = 0; i < 6; i++) await checarLinksBancos(env, fer);
confere("depois de várias rodadas todos foram conferidos, sem repetir o aviso", db.prepare("SELECT COUNT(*) AS n FROM bancos WHERE checado_em IS NULL").get().n === 0 && emails.length === 1, emails.length);

console.log(falhas ? "\n" + falhas + " FALHA(S)" : "\nTODOS OS TESTES PASSARAM");
process.exit(falhas ? 1 : 0);
