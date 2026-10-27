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

env.RESEND_API_KEY = "re_x";
const emails = [];
const fetchAntes = globalThis.fetch;
globalThis.fetch = async (url, op) => {
  if (String(url).includes("api.resend.com")) { emails.push(JSON.parse(op.body)); return new Response("{}"); }
  return fetchAntes(url, op);
};
const reg = async (email) => { cookie = ""; await chamar("/api/register", { email, senha: "senha-forte-1", nome: "Ana Lima", aceite: true }); return cookie; };
// ---- corpo do teste do PIX dentro do site ----
const criados = [];
let proximoId = 9000;
let recusar = false;
const fetchPix = globalThis.fetch;
globalThis.fetch = async (url, op) => {
  if (String(url) === "https://api.mercadopago.com/v1/payments" && op && op.method === "POST") {
    const b = JSON.parse(op.body);
    criados.push({ corpo: b, idem: op.headers["X-Idempotency-Key"] });
    if (recusar) return new Response(JSON.stringify({ message: "erro" }), { status: 400 });
    const id = proximoId++;
    pagamentos[id] = { id, status: "pending", transaction_amount: b.transaction_amount, currency_id: "BRL", external_reference: b.external_reference };
    return new Response(JSON.stringify({ id, status: "pending", date_of_expiration: b.date_of_expiration,
      point_of_interaction: { transaction_data: { qr_code: "00020126PIX" + id, qr_code_base64: "iVBORw0KGgo=" } } }), { status: 201 });
  }
  return fetchPix(url, op);
};

const adm = await reg("adm@t.com");
db.prepare("UPDATE users SET role = 'admin' WHERE email = 'adm@t.com'").run();
const ana = await reg("ana@t.com");
const anaId = db.prepare("SELECT id FROM users WHERE email = 'ana@t.com'").get().id;

cookie = "";
let r = await chamar("/api/checkout", { gb: 50, metodo: "pix" });
confere("sem login pede login", r.status === 401 && r.dados.login, r);

cookie = ana;
r = await chamar("/api/checkout", { gb: 50, metodo: "pix" });
const p = r.dados.pix;
confere("gera o PIX com QR code e copia e cola", r.status === 200 && p && p.qr_code.startsWith("00020126") && p.qr_code_base64 && p.gb === 50 && p.valor_centavos === 990, r.dados);
const enviado = criados[0].corpo;
confere("manda ao MP: valor, pix, e-mail, pedido, aviso e validade de 30 min", enviado.payment_method_id === "pix" && enviado.transaction_amount === p.valor_centavos / 100 &&
  enviado.payer.email === "ana@t.com" && enviado.external_reference === String(p.pedido) && /\/api\/mp\/webhook$/.test(enviado.notification_url) && /-03:00$/.test(enviado.date_of_expiration) && criados[0].idem === "pedido-" + p.pedido, enviado);
const pedido = db.prepare("SELECT * FROM subscriptions WHERE id = ?").get(p.pedido);
confere("pedido fica pendente com o id do pagamento guardado", pedido.status === "pending" && pedido.mp_payment_id === String(proximoId - 1) && pedido.valor_centavos === p.valor_centavos, pedido);

r = await chamar("/api/pagamento/status?pedido=" + p.pedido);
confere("status: aguardando", r.dados.situacao === "aguardando", r.dados);

cookie = adm;
r = await chamar("/api/pagamento/status?pedido=" + p.pedido);
confere("outra conta não vê o pedido", r.status === 404, r);

// pagou; o aviso (webhook) ainda não chegou: a própria consulta confere no MP e ativa
pagamentos[proximoId - 1].status = "approved";
cookie = ana;
r = await chamar("/api/pagamento/status?pedido=" + p.pedido);
confere("pagou: a consulta confere no MP e ativa o plano", r.dados.situacao === "pago" && r.dados.quota_gb === 50, r.dados);
const ativo = db.prepare("SELECT status, paid_until FROM subscriptions WHERE id = ?").get(p.pedido);
confere("plano ativo por 30 dias", ativo.status === "active" && ativo.paid_until > new Date(Date.now() + 29 * 86400000).toISOString().replace("T", " ").slice(0, 19), ativo);
r = await aviso(proximoId - 1);
confere("o aviso que chega depois não ativa de novo", db.prepare("SELECT COUNT(*) n FROM subscriptions WHERE user_id = ? AND status = 'active'").get(anaId).n === 1, r);

// valor adulterado: se o MP disser que pagou menos, não ativa
r = await chamar("/api/checkout", { gb: 1000, metodo: "pix" });
const p2 = r.dados.pix;
pagamentos[proximoId - 1].status = "approved";
pagamentos[proximoId - 1].transaction_amount = 1;
r = await chamar("/api/pagamento/status?pedido=" + p2.pedido);
confere("pagou menos que o valor: não ativa", r.dados.situacao === "aguardando" && db.prepare("SELECT status FROM subscriptions WHERE id = ?").get(p2.pedido).status === "pending", r.dados);

// expirou
r = await chamar("/api/checkout", { gb: 10, metodo: "pix" });
const p3 = r.dados.pix;
pagamentos[proximoId - 1].status = "cancelled";
r = await chamar("/api/pagamento/status?pedido=" + p3.pedido);
confere("PIX vencido: avisa que expirou", r.dados.situacao === "expirado", r.dados);

// MP recusa
recusar = true;
r = await chamar("/api/checkout", { gb: 10, metodo: "pix" });
confere("MP fora do ar: mensagem clara", r.status === 502 && /PIX/.test(r.dados.error), r);
recusar = false;

// cartão continua indo para o Checkout do Mercado Pago
r = await chamar("/api/checkout", { gb: 10, metodo: "cartao" });
confere("cartão continua no Checkout do Mercado Pago", r.dados.init_point && ultimaPreferencia.items[0].unit_price === 9.9, r.dados);

// cupom de preço com PIX
cookie = adm;
await chamar("/api/admin/cupons/salvar", { codigo: "PIX1REAL", quota_mb: 1000, horas: 720, max_usos: 1, preco: "1,00", so_email: "ana@t.com" });
cookie = ana;
r = await chamar("/api/cupom", { codigo: "PIX1REAL", metodo: "pix" });
confere("cupom de preço abre o PIX de R$ 1,00", r.dados.pix && r.dados.pix.valor_centavos === 100 && r.dados.pix.gb === 1, r.dados);

console.log(falhas ? "\n" + falhas + " FALHA(S)" : "\nTODOS OS TESTES PASSARAM");
process.exit(falhas ? 1 : 0);
