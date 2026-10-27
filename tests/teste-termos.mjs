import { fileURLToPath } from "node:url";
// Teste local do fluxo checkout -> webhook, com banco SQLite em memória e Mercado Pago simulado.
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

let r = await chamar("/api/register", { email: "sem@teste.com", senha: "senha-forte-1", nome: "Sem" });
confere("cadastro sem aceite: 400", r.status === 400 && /Termos/.test(r.dados.error), r);
r = await chamar("/api/register", { email: "sem@teste.com", senha: "senha-forte-1", nome: "Sem", aceite: "true" });
confere("aceite tem que ser true de verdade", r.status === 400, r);
r = await chamar("/api/register", { email: "com@teste.com", senha: "senha-forte-1", nome: "Com", aceite: true });
const u = db.prepare("SELECT terms_accepted_at FROM users WHERE email='com@teste.com'").get();
confere("cadastro com aceite grava a data", r.status === 200 && u && /^\d{4}-\d\d-\d\d \d\d:\d\d:\d\d$/.test(u.terms_accepted_at), u);
console.log(falhas ? "\n" + falhas + " FALHA(S)" : "\nTODOS OS TESTES PASSARAM");
process.exit(falhas ? 1 : 0);
