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

env.RESEND_API_KEY = "re_teste";
const emails = [];
globalThis.fetch = async (url, op) => {
  if (String(url).includes("api.resend.com")) { emails.push(JSON.parse(op.body)); return new Response("{}"); }
  return fetchMp(url, op);
};
let r = await chamar("/api/register", { email: "ana@teste.com", senha: "senha-antiga-1", nome: "Ana <script>", aceite: true });
const cookieAntigo = cookie;
cookie = "";

r = await chamar("/api/senha/esqueci", { email: "naoexiste@teste.com" });
confere("e-mail sem conta: responde ok e não envia", r.status === 200 && emails.length === 0, r);

r = await chamar("/api/senha/esqueci", { email: "ANA@teste.com " });
confere("conta existe: envia 1 e-mail", r.status === 200 && emails.length === 1 && emails[0].to[0] === "ana@teste.com", emails);
confere("nome no e-mail sem <script>", !emails[0].html.includes("<script>"), emails[0].html.slice(0, 300));
const link = emails[0].text.match(/https:\/\/\S+/)[0];
const token = new URL(link).searchParams.get("token");
confere("link aponta para /redefinir com token", link.startsWith(BASE + "/redefinir?token=") && /^[0-9a-f]{64}$/.test(token), link);
confere("banco guarda só o hash", db.prepare("SELECT COUNT(*) n FROM password_resets WHERE token_hash = ?").get(token).n === 0, "");

r = await chamar("/api/senha/esqueci", { email: "ana@teste.com" }, { Origin: "https://mal.com" });
confere("outra origem bloqueada", r.status === 403, r);

await chamar("/api/senha/esqueci", { email: "ana@teste.com" });
await chamar("/api/senha/esqueci", { email: "ana@teste.com" });
await chamar("/api/senha/esqueci", { email: "ana@teste.com" });
confere("limite de 3 por hora", emails.length === 3, emails.length);

r = await chamar("/api/senha/redefinir", { token: token, senha: "curta" });
confere("senha curta recusada", r.status === 400, r);
r = await chamar("/api/senha/redefinir", { token: "a".repeat(64), senha: "senha-nova-123" });
confere("token falso recusado", r.status === 400, r);
r = await chamar("/api/senha/redefinir", { token: token, senha: "senha-nova-123" });
confere("token certo troca a senha", r.status === 200, r);
r = await chamar("/api/senha/redefinir", { token: token, senha: "outra-senha-99" });
confere("mesmo link não funciona 2 vezes", r.status === 400, r);
const token2 = new URL(emails[1].text.match(/https:\/\/\S+/)[0]).searchParams.get("token");
r = await chamar("/api/senha/redefinir", { token: token2, senha: "outra-senha-99" });
confere("outros links antigos também morrem", r.status === 400, r);

cookie = cookieAntigo;
r = await chamar("/api/me");
confere("sessão antiga foi derrubada", r.status === 401, r);
cookie = "";
r = await chamar("/api/login", { email: "ana@teste.com", senha: "senha-antiga-1" });
confere("senha antiga não entra", r.status === 401, r);
r = await chamar("/api/login", { email: "ana@teste.com", senha: "senha-nova-123" });
confere("senha nova entra", r.status === 200 && r.dados.ok, r);

// link vencido
db.prepare("DELETE FROM password_resets").run();
await chamar("/api/senha/esqueci", { email: "ana@teste.com" });
const token3 = new URL(emails[emails.length - 1].text.match(/https:\/\/\S+/)[0]).searchParams.get("token");
db.prepare("UPDATE password_resets SET expires_at = datetime('now','-1 minute')").run();
r = await chamar("/api/senha/redefinir", { token: token3, senha: "senha-nova-456" });
confere("link vencido recusado", r.status === 400, r);

console.log(falhas ? "\n" + falhas + " FALHA(S)" : "\nTODOS OS TESTES PASSARAM");
process.exit(falhas ? 1 : 0);
