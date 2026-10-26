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

db.exec("PRAGMA foreign_keys = ON");
Object.assign(env, { B2_ENDPOINT: "s3.us-east-005.backblazeb2.com", B2_BUCKET: "balde", B2_KEY_ID: "005abc", B2_APP_KEY: "K005xyz", RESEND_API_KEY: "re_x" });
const emails = [];
globalThis.fetch = async (url, op) => {
  url = String(url);
  if (url.includes("api.resend.com")) { emails.push(JSON.parse(op.body)); return new Response("{}"); }
  if (url.includes("backblazeb2.com") && op && op.method === "HEAD") return new Response(null, { status: 200, headers: { "Content-Length": op._tam || "8000000" } });
  return fetchMp(url, op);
};
const reg = async (email) => { cookie = ""; await chamar("/api/register", { email, senha: "senha-forte-1", nome: email.split("@")[0], aceite: true }); return cookie; };
const admin = await reg("adm@t.com");
db.prepare("UPDATE users SET role = 'admin' WHERE email = 'adm@t.com'").run();
const ana = await reg("ana@t.com");
const bia = await reg("bia@t.com");
const pago = await reg("pago@t.com");
db.prepare("INSERT INTO subscriptions (user_id, quota_gb, status, paid_until, mp_payment_id) SELECT id, 100, 'active', datetime('now','+20 days'), '999' FROM users WHERE email='pago@t.com'").run();

// admin cria o cupom
cookie = ana;
let r = await chamar("/api/admin/cupons/salvar", { codigo: "NUVEM1DIA", quota_mb: 20, horas: 24 });
confere("cliente comum não cria cupom", r.status === 403, r);
cookie = admin;
r = await chamar("/api/admin/cupons/salvar", { codigo: "nuvem1dia", quota_mb: 20, horas: 24, max_usos: 2 });
confere("admin cria NUVEM1DIA (20 MB, 24 h)", r.status === 200, r);
r = await chamar("/api/admin/cupons");
confere("lista de cupons", r.dados.cupons.length === 1 && r.dados.cupons[0].codigo === "NUVEM1DIA", r.dados);

// uso
cookie = "";
r = await chamar("/api/cupom", { codigo: "NUVEM1DIA" });
confere("sem login: pede login", r.status === 401, r);
cookie = ana;
r = await chamar("/api/cupom", { codigo: "ERRADO" });
confere("cupom errado recusado", r.status === 400, r);
r = await chamar("/api/cupom", { codigo: " nuvem1dia " });
confere("ativa com minúsculas e espaços", r.status === 200 && r.dados.quota_mb === 20, r);
r = await chamar("/api/me");
const h = (Date.parse(r.dados.plano.paid_until.replace(" ", "T") + "Z") - Date.now()) / 3600000;
confere("plano de teste: 20 MB por ~24 h, marcado como teste", r.dados.plano.teste === true && Math.abs(r.dados.plano.quota_gb - 0.02) < 1e-9 && h > 23.9 && h < 24.1, r.dados.plano);
r = await chamar("/api/files");
confere("cota = 20 MB", r.dados.plano === true && r.dados.quota_bytes === 20000000, r.dados);
r = await chamar("/api/files/upload-url", { name: "grande.jpg", size: 25000000 });
confere("arquivo maior que 20 MB recusado", r.status === 413, r);
r = await chamar("/api/files/upload-url", { name: "foto.jpg", size: 8000000 });
confere("foto de 8 MB cabe", r.status === 200, r);
r = await chamar("/api/portal/salvar", { nome: "Estúdio da Ana", slug: "estudio-ana", cor: "#be185d" });
confere("teste libera criar o portal", r.status === 200, r);
r = await chamar("/api/cupom", { codigo: "NUVEM1DIA" });
confere("mesma conta não usa de novo", r.status === 400, r);

cookie = pago;
r = await chamar("/api/cupom", { codigo: "NUVEM1DIA" });
confere("quem já tem plano pago não troca pelo teste", r.status === 400 && /plano ativo/.test(r.dados.error), r);

cookie = bia;
r = await chamar("/api/cupom", { codigo: "NUVEM1DIA" });
confere("segunda pessoa usa", r.status === 200, r);
cookie = await reg("caio@t.com");
r = await chamar("/api/cupom", { codigo: "NUVEM1DIA" });
confere("limite de 2 usos respeitado", r.status === 400, r);

// pausar
cookie = admin;
await chamar("/api/admin/cupons/salvar", { codigo: "OUTRO", quota_mb: 50, horas: 48 });
await chamar("/api/admin/cupons/ativo", { codigo: "OUTRO", ativo: false });
cookie = await reg("davi@t.com");
r = await chamar("/api/cupom", { codigo: "OUTRO" });
confere("cupom pausado não funciona", r.status === 400, r);

// vencido por data
cookie = admin;
await chamar("/api/admin/cupons/salvar", { codigo: "VELHO", quota_mb: 20, horas: 24, valido_ate: "2020-01-01" });
cookie = await reg("eva@t.com");
r = await chamar("/api/cupom", { codigo: "VELHO" });
confere("cupom fora da validade não funciona", r.status === 400, r);

// receita não conta teste; limpeza não manda "vence em breve" para teste
cookie = admin;
r = await chamar("/api/admin/clientes");
confere("receita só conta o plano pago (100 GB = R$ 10,40)", r.dados.receita_mensal === 10.4, r.dados.receita_mensal);
const ctx = { p: null, waitUntil(p) { this.p = p; } };
await worker.scheduled({ cron: "0 * * * *" }, env, ctx); await ctx.p;
confere("teste recém-ativado não recebe 'vence em breve'", !emails.some(e => /ana@t.com|bia@t.com/.test(e.to[0])), emails.map(e => e.to[0] + ": " + e.subject));
db.prepare("UPDATE subscriptions SET paid_until = datetime('now','-1 hour') WHERE mp_payment_id = 'cupom:NUVEM1DIA'").run();
await worker.scheduled({ cron: "0 * * * *" }, env, ctx); await ctx.p;
confere("quando o teste acaba, recebe 'venceu' (convite para contratar)", emails.filter(e => e.to[0] === "ana@t.com" && /venceu/.test(e.subject)).length === 1, emails.map(e => e.to[0] + ": " + e.subject));
cookie = ana;
r = await chamar("/api/files/upload-url", { name: "foto2.jpg", size: 1000 });
confere("depois das 24 h, envio bloqueado", r.status === 403, r);

console.log(falhas ? "\n" + falhas + " FALHA(S)" : "\nTODOS OS TESTES PASSARAM");
process.exit(falhas ? 1 : 0);
