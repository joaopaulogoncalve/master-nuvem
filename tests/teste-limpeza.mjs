import { fileURLToPath } from "node:url";
// Teste local do fluxo checkout -> webhook, com banco SQLite em memória e Mercado Pago simulado.
import { DatabaseSync } from "node:sqlite";
import { readFileSync } from "node:fs";
import { createHmac } from "node:crypto";

const RAIZ = fileURLToPath(new URL("../", import.meta.url)).replace(/\\/g, "/");
const worker = (await import(new URL("../", import.meta.url).href + "src/worker.js")).default;

const db = new DatabaseSync(":memory:");
for (const m of ["0001_init", "0002_recuperar_senha", "0003_aceite_termos", "0004_avisos", "0005_portal", "0006_cobrancas", "0007_cupons", "0008_tabela_precos", "0009_cupom_preco", "0010_assistente", "0011_sentinela", "0012_faq_mais", "0013_eventos", "0014_faq_blog_eventos", "0015_regras_acesso", "0016_faq_estudio", "0017_lixeira", "0018_visual", "0019_aumentar_espaco", "0020_fotos_extras", "0021_bancos", "0022_contratos"]) db.exec(readFileSync(RAIZ + "migrations/" + m + ".sql", "utf8"));

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

Object.assign(env, { RESEND_API_KEY: "re_x", B2_ENDPOINT: "s3.us-east-005.backblazeb2.com", B2_BUCKET: "balde", B2_KEY_ID: "005abc", B2_APP_KEY: "K005xyz" });
const emails = [], apagados = [];
globalThis.fetch = async (url, op) => {
  url = String(url);
  if (url.includes("api.resend.com")) { emails.push(JSON.parse(op.body)); return new Response("{}"); }
  if (url.includes("backblazeb2.com") && op && op.method === "DELETE") { apagados.push(url.split("?")[0].split("/balde/")[1]); return new Response(null, { status: 204 }); }
  return fetchMp(url, op);
};
const ex = (sql, ...a) => db.prepare(sql).run(...a);
const usuario = (id, email, role = "client") => ex("INSERT INTO users (id, email, name, password_hash, password_salt, role) VALUES (?, ?, ?, 'h', 's', ?)", id, email, "Cliente " + id, role);
const plano = (uid, status, quando) => ex("INSERT INTO subscriptions (user_id, quota_gb, status, paid_until, mp_payment_id) VALUES (?, 100, ?, datetime('now', ?), '1')", uid, status, quando).lastInsertRowid;
const arquivo = (uid, key, status = "ready", criado = "+0 seconds") => ex("INSERT INTO files (user_id, object_key, name, size_bytes, status, created_at) VALUES (?, ?, 'a', 10, ?, datetime('now', ?))", uid, key, status, criado);

usuario(1, "vence@t.com"); plano(1, "active", "+2 days"); arquivo(1, "u1/a");
usuario(2, "venceu@t.com"); plano(2, "active", "-1 days"); arquivo(2, "u2/a");
usuario(3, "ultimo@t.com"); plano(3, "active", "-13 days"); arquivo(3, "u3/a");
usuario(4, "apagar@t.com"); plano(4, "active", "-16 days"); arquivo(4, "u4/a"); arquivo(4, "u4/b");
usuario(5, "ok@t.com"); plano(5, "active", "+20 days"); arquivo(5, "u5/a");
usuario(6, "admin@t.com", "admin"); plano(6, "active", "-40 days"); arquivo(6, "u6/a");
usuario(7, "renovou@t.com"); plano(7, "replaced", "-20 days"); plano(7, "active", "+10 days"); arquivo(7, "u7/a");
usuario(8, "estorno@t.com"); plano(8, "cancelled", "-16 days"); arquivo(8, "u8/a");
usuario(9, "semplano@t.com"); arquivo(9, "u9/a");
arquivo(5, "u5/orfao", "pending", "-2 days");
arquivo(5, "u5/enviando", "pending");

const ctx = { p: null, waitUntil(p) { this.p = p; } };
await worker.scheduled({ cron: "0 * * * *" }, env, ctx); let rel = await ctx.p;
confere("modo teste: não apaga arquivo de cliente", !apagados.some(k => k.startsWith("u4")) && rel.simulados === 3, { rel, apagados });
const para = t => emails.filter(e => e.to[0] === t).map(e => e.subject);
confere("aviso 'vence em breve' (3 dias antes)", para("vence@t.com").length === 1 && /vence em breve/.test(para("vence@t.com")[0]), emails.map(e => e.to[0] + ": " + e.subject));
confere("aviso 'venceu'", para("venceu@t.com").length === 1 && /venceu/.test(para("venceu@t.com")[0]), "");
confere("último aviso (3 dias antes de apagar)", para("ultimo@t.com").length === 1 && /Último aviso/.test(para("ultimo@t.com")[0]), "");
confere("quem está em dia não recebe nada", para("ok@t.com").length === 0 && para("renovou@t.com").length === 0, "");
confere("órfão de 2 dias apagado; envio em andamento fica", apagados.includes("u5/orfao") && !apagados.includes("u5/enviando"), apagados);
const n1 = emails.length;
await worker.scheduled({ cron: "0 * * * *" }, env, ctx); await ctx.p;
confere("rodar de novo não repete e-mails", emails.length === n1, emails.length);

env.APAGAR_ARQUIVOS = "sim";
await worker.scheduled({ cron: "0 * * * *" }, env, ctx); rel = await ctx.p;
const restam = db.prepare("SELECT object_key FROM files ORDER BY object_key").all().map(r => r.object_key);
confere("apaga 16 dias vencido e estorno de 16 dias", apagados.includes("u4/a") && apagados.includes("u4/b") && apagados.includes("u8/a") && !restam.includes("u4/a"), { apagados, restam });
confere("não apaga: em dia, 13 dias, admin, renovou, sem plano", ["u1/a","u2/a","u3/a","u5/a","u6/a","u7/a","u9/a"].every(k => restam.includes(k)), restam);

// admin vê a data de apagamento
db.prepare("UPDATE users SET role='admin' WHERE id = 6").run();
r0: {
  const s = await chamar("/api/register", { email: "adm2@t.com", senha: "senha-forte-1", nome: "A", aceite: true });
  db.prepare("UPDATE users SET role='admin' WHERE email='adm2@t.com'").run();
  const r = await chamar("/api/admin/clientes");
  const c3 = r.dados.clientes.find(c => c.id === 3);
  confere("admin mostra data de apagamento", c3 && c3.apaga_em && r.dados.apagar_arquivos === true, c3);
}
console.log(falhas ? "\n" + falhas + " FALHA(S)" : "\nTODOS OS TESTES PASSARAM");
process.exit(falhas ? 1 : 0);
