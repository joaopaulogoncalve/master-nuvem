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

// 1) checkout sem login
let r = await chamar("/api/checkout", { gb: 100 });
confere("checkout sem login pede login (401)", r.status === 401 && r.dados.login === true, r);

// 2) cadastro + checkout
r = await chamar("/api/register", { email: "cliente@teste.com", senha: "senha-forte-1", nome: "Cliente", aceite: true });
confere("cadastro", r.status === 200, r);
r = await chamar("/api/checkout", { gb: 100 });
confere("checkout logado devolve link", r.status === 200 && r.dados.init_point, r);
confere("preferência leva external_reference/notification_url/email",
  ultimaPreferencia.external_reference === "1" && ultimaPreferencia.notification_url === BASE + "/api/mp/webhook" &&
  ultimaPreferencia.payer.email === "cliente@teste.com" && ultimaPreferencia.items[0].unit_price === 10.4, ultimaPreferencia);
confere("pedido criado como pending", subs()[0].status === "pending", subs());

// 3) checkout de outra origem
r = await chamar("/api/checkout", { gb: 100 }, { Origin: "https://site-malicioso.com" });
confere("checkout de outra origem bloqueado (403)", r.status === 403, r);

// 4) webhook com assinatura errada
pagamentos["111"] = { id: 111, status: "approved", external_reference: "1", transaction_amount: 10.4, currency_id: "BRL" };
r = await aviso(111, false);
confere("webhook com assinatura errada recusado (401)", r.status === 401, r);
confere("plano continua pending", subs()[0].status === "pending", subs());

// 5) pagamento pendente (PIX ainda não pago) não ativa
pagamentos["110"] = { id: 110, status: "pending", external_reference: "1", transaction_amount: 10.4, currency_id: "BRL" };
r = await aviso(110);
confere("pagamento pendente não ativa", r.status === 200 && subs()[0].status === "pending", subs());

// 6) valor menor que o preço não ativa
pagamentos["112"] = { id: 112, status: "approved", external_reference: "1", transaction_amount: 1.0, currency_id: "BRL" };
r = await aviso(112);
confere("valor menor não ativa", subs()[0].status === "pending", subs());

// 7) aprovado ativa por 30 dias
r = await aviso(111);
let s = subs()[0];
confere("aprovado ativa o plano", s.status === "active" && s.mp_payment_id === "111", s);
const dias = (Date.parse(s.paid_until + "Z") - Date.now()) / 86400000;
confere("validade ~30 dias", dias > 29.9 && dias < 30.1, s.paid_until);

// 8) aviso repetido não muda nada
const antes = JSON.stringify(subs());
await aviso(111);
confere("aviso repetido é ignorado", JSON.stringify(subs()) === antes, subs());

// 9) /api/me e /api/files mostram o plano
r = await chamar("/api/me");
confere("/api/me mostra plano", r.dados.plano && r.dados.plano.quota_gb === 100, r.dados);
r = await chamar("/api/files");
confere("/api/files libera cota de 100 GB", r.dados.plano === true && r.dados.quota_bytes === 100e9, r.dados);

// 10) renovação do mesmo tamanho soma os dias
r = await chamar("/api/checkout", { gb: 100 });
pagamentos["120"] = { id: 120, status: "approved", external_reference: "2", transaction_amount: 10.4, currency_id: "BRL" };
await aviso(120);
s = subs();
const dias2 = (Date.parse(s[1].paid_until + "Z") - Date.now()) / 86400000;
confere("renovação soma: ~60 dias e antigo vira replaced", s[1].status === "active" && dias2 > 59.9 && dias2 < 60.1 && s[0].status === "replaced", s);

// 11) troca de tamanho começa hoje
r = await chamar("/api/checkout", { gb: 1000 });
pagamentos["130"] = { id: 130, status: "approved", external_reference: "3", transaction_amount: 59, currency_id: "BRL" };
await aviso(130);
s = subs();
const dias3 = (Date.parse(s[2].paid_until + "Z") - Date.now()) / 86400000;
confere("troca para 1 TB: 30 dias a partir de hoje", s[2].status === "active" && s[2].quota_gb === 1000 && dias3 > 29.9 && dias3 < 30.1 && s[1].status === "replaced", s);

// 12) estorno cancela
pagamentos["130"].status = "refunded";
await aviso(130);
confere("estorno cancela o plano", subs()[2].status === "cancelled", subs());
r = await chamar("/api/me");
confere("depois do estorno fica sem plano", r.dados.plano === null, r.dados);

// 13) avisos de outros tipos e ids inválidos são ignorados
r = await chamar("/api/mp/webhook?type=merchant_order&data.id=5", {});
confere("aviso de outro tipo é ignorado (200)", r.status === 200, r);
r = await aviso(999999);
confere("pagamento inexistente é ignorado (200)", r.status === 200, r);

console.log(falhas ? "\n" + falhas + " FALHA(S)" : "\nTODOS OS TESTES PASSARAM");
process.exit(falhas ? 1 : 0);
