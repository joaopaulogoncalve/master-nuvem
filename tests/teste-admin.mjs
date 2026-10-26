import { fileURLToPath } from "node:url";
// Teste local do fluxo checkout -> webhook, com banco SQLite em memória e Mercado Pago simulado.
import { DatabaseSync } from "node:sqlite";
import { readFileSync } from "node:fs";
import { createHmac } from "node:crypto";

const RAIZ = fileURLToPath(new URL("../", import.meta.url)).replace(/\\/g, "/");
const worker = (await import(new URL("../", import.meta.url).href + "src/worker.js")).default;

const db = new DatabaseSync(":memory:");
for (const m of ["0001_init", "0002_recuperar_senha", "0003_aceite_termos", "0004_avisos", "0005_portal", "0006_cobrancas", "0007_cupons", "0008_tabela_precos", "0009_cupom_preco", "0010_assistente", "0011_sentinela", "0012_faq_mais", "0013_eventos", "0014_faq_blog_eventos", "0015_regras_acesso", "0016_faq_estudio", "0017_lixeira", "0018_visual", "0019_aumentar_espaco", "0020_fotos_extras", "0021_bancos", "0022_contratos", "0023_copias"]) db.exec(readFileSync(RAIZ + "migrations/" + m + ".sql", "utf8"));

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

// Admin = primeiro usuário, promovido direto no banco
let r = await chamar("/api/register", { email: "admin@teste.com", senha: "senha-forte-1", nome: "Admin", aceite: true });
const cookieAdmin = cookie;
db.prepare("UPDATE users SET role = 'admin' WHERE id = 1").run();
cookie = "";
r = await chamar("/api/register", { email: "cli@teste.com", senha: "senha-forte-2", nome: "<b>Cliente</b>", aceite: true });
const cookieCli = cookie;

cookie = "";
r = await chamar("/api/admin/clientes");
confere("sem login: 401", r.status === 401, r);
cookie = cookieCli;
r = await chamar("/api/admin/clientes");
confere("cliente comum: 403", r.status === 403, r);
r = await chamar("/api/admin/plano", { user_id: 2, gb: 100, dias: 30 });
confere("cliente comum não dá plano: 403", r.status === 403, r);

cookie = cookieAdmin;
r = await chamar("/api/admin/clientes");
confere("admin lista 2 clientes", r.status === 200 && r.dados.clientes.length === 2 && r.dados.receita_mensal === 0, r.dados);

r = await chamar("/api/admin/plano", { user_id: 2, gb: 50, dias: 30 }, { Origin: "https://mal.com" });
confere("origem errada: 403", r.status === 403, r);
r = await chamar("/api/admin/plano", { user_id: 2, gb: 0, dias: 30 });
confere("GB inválido: 400", r.status === 400, r);
r = await chamar("/api/admin/plano", { user_id: 99, gb: 10, dias: 30 });
confere("cliente inexistente: 404", r.status === 404, r);

r = await chamar("/api/admin/plano", { user_id: 2, gb: 50, dias: 30 });
confere("admin dá 50 GB", r.status === 200, r);
r = await chamar("/api/admin/clientes");
let c = r.dados.clientes.find(x => x.id === 2);
confere("plano manual aparece", c.plano && c.plano.quota_gb === 50 && c.plano.manual === true && r.dados.receita_mensal === 0, c);

r = await chamar("/api/admin/plano", { user_id: 2, gb: 200, dias: 60 });
r = await chamar("/api/admin/clientes");
c = r.dados.clientes.find(x => x.id === 2);
confere("trocar plano: 200 GB e antigo replaced", c.plano.quota_gb === 200 && db.prepare("SELECT COUNT(*) n FROM subscriptions WHERE user_id=2 AND status='active'").get().n === 1, subs());

// plano pago aparece na receita
db.prepare("INSERT INTO subscriptions (user_id, quota_gb, status, paid_until, mp_payment_id) VALUES (1, 1000, 'active', datetime('now','+30 days'), '555')").run();
r = await chamar("/api/admin/clientes");
confere("receita conta plano pago (R$ 59)", r.dados.receita_mensal === 59, r.dados.receita_mensal);

r = await chamar("/api/admin/plano/remover", { user_id: 2 });
r = await chamar("/api/admin/clientes");
c = r.dados.clientes.find(x => x.id === 2);
confere("remover plano", c.plano === null, c);

cookie = cookieCli;
r = await chamar("/api/files");
confere("cliente sem plano não envia", r.dados.plano === false, r.dados);

console.log(falhas ? "\n" + falhas + " FALHA(S)" : "\nTODOS OS TESTES PASSARAM");
process.exit(falhas ? 1 : 0);
