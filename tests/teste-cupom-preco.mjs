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

db.exec("PRAGMA foreign_keys = ON");
const reg = async (email) => { cookie = ""; await chamar("/api/register", { email, senha: "senha-forte-1", nome: email.split("@")[0], aceite: true }); return cookie; };
const admin = await reg("adm@t.com");
db.prepare("UPDATE users SET role = 'admin' WHERE email = 'adm@t.com'").run();
const teste = await reg("teste@t.com");
const intruso = await reg("intruso@t.com");

cookie = admin;
let r = await chamar("/api/admin/cupons/salvar", { codigo: "PIX1REAL", quota_mb: 1000, horas: 720, max_usos: 1, preco: "1,00", so_email: "naoexiste@t.com" });
confere("e-mail inexistente recusado", r.status === 400, r);
r = await chamar("/api/admin/cupons/salvar", { codigo: "PIX1REAL", quota_mb: 500, horas: 720, preco: "1,00" });
confere("cupom com preço exige 1 GB ou mais", r.status === 400, r);
r = await chamar("/api/admin/cupons/salvar", { codigo: "PIX1REAL", quota_mb: 1000, horas: 720, max_usos: 1, preco: "1,00", so_email: "TESTE@t.com" });
confere("admin cria PIX1REAL (1 GB por R$ 1, só para teste@t.com)", r.status === 200, r);
r = await chamar("/api/admin/cupons");
const c = r.dados.cupons[0];
confere("lista mostra preço e dono", c.preco_centavos === 100 && c.so_email === "teste@t.com", c);

cookie = intruso;
r = await chamar("/api/cupom", { codigo: "PIX1REAL" });
confere("outra conta não usa o cupom", r.status === 400, r);

cookie = teste;
r = await chamar("/api/cupom", { codigo: "pix1real" });
confere("cupom de preço devolve o link de pagamento", r.status === 200 && r.dados.init_point, r);
confere("Mercado Pago recebe R$ 1,00 por 1GB", ultimaPreferencia.items[0].unit_price === 1 && /1GB/.test(ultimaPreferencia.items[0].title), ultimaPreferencia.items[0]);
const pedido = db.prepare("SELECT id, quota_gb, status, valor_centavos FROM subscriptions WHERE user_id = 2").get();
confere("pedido pendente guarda o valor de R$ 1,00", pedido.status === "pending" && pedido.quota_gb === 1 && pedido.valor_centavos === 100, pedido);
r = await chamar("/api/cupom", { codigo: "PIX1REAL" });
confere("limite de 1 uso", r.status === 400, r);

// pagamento de R$ 1,00 ativa o plano
pagamentos["777"] = { id: 777, status: "approved", external_reference: String(pedido.id), transaction_amount: 1.0, currency_id: "BRL" };
await aviso(777);
const ativo = db.prepare("SELECT status, paid_until FROM subscriptions WHERE id = ?").get(pedido.id);
confere("PIX de R$ 1,00 ativa 1 GB por 30 dias", ativo.status === "active", ativo);

// compra normal continua cobrando o preço da calculadora
cookie = intruso;
r = await chamar("/api/checkout", { gb: 100 });
const normal = db.prepare("SELECT id, valor_centavos FROM subscriptions WHERE user_id = 3").get();
confere("compra normal guarda R$ 10,40", normal.valor_centavos === 1040 && ultimaPreferencia.items[0].unit_price === 10.4, normal);
pagamentos["778"] = { id: 778, status: "approved", external_reference: String(normal.id), transaction_amount: 1.0, currency_id: "BRL" };
await aviso(778);
confere("pagar R$ 1 numa compra normal NÃO ativa", db.prepare("SELECT status FROM subscriptions WHERE id = ?").get(normal.id).status === "pending", "");

// pedido antigo (sem valor guardado) continua conferindo pela calculadora
db.prepare("INSERT INTO subscriptions (id, user_id, quota_gb, status) VALUES (900, 3, 100, 'pending')").run();
pagamentos["779"] = { id: 779, status: "approved", external_reference: "900", transaction_amount: 10.4, currency_id: "BRL" };
await aviso(779);
confere("pedido antigo sem valor guardado ativa pelo preço da calculadora", db.prepare("SELECT status FROM subscriptions WHERE id = 900").get().status === "active", "");

console.log(falhas ? "\n" + falhas + " FALHA(S)" : "\nTODOS OS TESTES PASSARAM");
process.exit(falhas ? 1 : 0);
