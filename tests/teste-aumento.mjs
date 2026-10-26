import { fileURLToPath } from "node:url";
// Teste local do fluxo checkout -> webhook, com banco SQLite em memória e Mercado Pago simulado.
import { DatabaseSync } from "node:sqlite";
import { readFileSync } from "node:fs";
import { createHmac } from "node:crypto";

const RAIZ = fileURLToPath(new URL("../", import.meta.url)).replace(/\\/g, "/");
const worker = (await import(new URL("../", import.meta.url).href + "src/worker.js")).default;

const db = new DatabaseSync(":memory:");
for (const m of ["0001_init", "0002_recuperar_senha", "0003_aceite_termos", "0004_avisos", "0005_portal", "0006_cobrancas", "0007_cupons", "0008_tabela_precos", "0009_cupom_preco", "0010_assistente", "0011_sentinela", "0012_faq_mais", "0013_eventos", "0014_faq_blog_eventos", "0015_regras_acesso", "0016_faq_estudio", "0017_lixeira", "0018_visual", "0019_aumentar_espaco", "0020_fotos_extras", "0021_bancos", "0022_contratos", "0023_copias", "0024_contrato_obrigatorio"]) db.exec(readFileSync(RAIZ + "migrations/" + m + ".sql", "utf8"));

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


const reg = async (email) => { cookie = ""; await chamar("/api/register", { email, senha: "senha-forte-1", nome: "Ana", aceite: true }); return cookie; };
const ana = await reg("ana@t.com");
const anaId = db.prepare("SELECT id FROM users WHERE email = 'ana@t.com'").get().id;
const venc = db.prepare("SELECT datetime('now', '+15 days') AS d").get().d;
db.prepare("INSERT INTO subscriptions (user_id, quota_gb, status, paid_until, mp_payment_id, valor_centavos) VALUES (?, 100, 'active', ?, '111', 1040)").run(anaId, venc);

cookie = ana;
let r = await chamar("/api/plano/aumento?gb=500");
confere("preço do aumento: 100 → 500 GB com 15 dias = R$ 10,80", r.dados.pode && Math.abs(r.dados.valor_centavos - 1080) <= 1 && r.dados.atual_gb === 100, r.dados);
r = await chamar("/api/plano/aumento?gb=50");
confere("tamanho menor ou igual não é aumento", r.dados.pode === false, r.dados);
r = await chamar("/api/plano/aumento?gb=101");
confere("aumento pequeno cobra o mínimo de R$ 2,00", r.dados.valor_centavos === 200, r.dados);

r = await chamar("/api/checkout", { gb: 50, modo: "aumentar" });
confere("checkout recusa aumentar para menos", r.status === 400, r);
r = await chamar("/api/checkout", { gb: 500, modo: "aumentar" });
const ped = db.prepare("SELECT * FROM subscriptions WHERE status = 'pending' ORDER BY id DESC").get();
confere("cria o pedido de aumento com o valor proporcional e o vencimento atual", r.dados.init_point && Math.abs(ped.valor_centavos - 1080) <= 1 && ped.aumento_ate === venc && ped.quota_gb === 500 && Math.abs(ultimaPreferencia.items[0].unit_price - 10.8) < 0.02, ped);

pagamentos["900"] = { id: 900, status: "approved", transaction_amount: ped.valor_centavos / 100, currency_id: "BRL", external_reference: String(ped.id) };
await aviso(900);
const s = subs();
const novo = s.find(x => x.id === ped.id), velho = s.find(x => x.mp_payment_id === "111");
confere("pago: passa para 500 GB na hora, com o MESMO vencimento", novo.status === "active" && novo.quota_gb === 500 && novo.paid_until === venc, novo);
confere("o plano antigo de 100 GB fica como substituído", velho.status === "replaced", velho);
r = await chamar("/api/files");
confere("a cota já é de 500 GB", r.dados.quota_bytes === 500 * 1e9, r.dados.quota_bytes);

// renovar normal continua somando 30 dias no mesmo tamanho
r = await chamar("/api/checkout", { gb: 500 });
const ren = db.prepare("SELECT * FROM subscriptions WHERE status = 'pending' ORDER BY id DESC").get();
confere("renovar continua sem aumento_ate e com o preço cheio", ren.aumento_ate === null && ren.valor_centavos === 3200, ren);
pagamentos["901"] = { id: 901, status: "approved", transaction_amount: 32, currency_id: "BRL", external_reference: String(ren.id) };
await aviso(901);
const renovado = subs().find(x => x.id === ren.id);
const esperado = db.prepare("SELECT datetime(?, '+30 days') AS d").get(venc).d;
confere("renovar soma 30 dias ao vencimento", renovado.paid_until === esperado, renovado);

// teste grátis por cupom não pode aumentar
const bia = await reg("bia@t.com");
const biaId = db.prepare("SELECT id FROM users WHERE email = 'bia@t.com'").get().id;
db.prepare("INSERT INTO subscriptions (user_id, quota_gb, status, paid_until, mp_payment_id) VALUES (?, 0.02, 'active', datetime('now','+1 day'), 'cupom:NUVEM1DIA')").run(biaId);
cookie = bia;
r = await chamar("/api/checkout", { gb: 10, modo: "aumentar" });
confere("teste grátis não usa o aumento (contrata plano normal)", r.status === 400, r);

console.log(falhas ? "\n" + falhas + " FALHA(S)" : "\nTODOS OS TESTES PASSARAM");
process.exit(falhas ? 1 : 0);
