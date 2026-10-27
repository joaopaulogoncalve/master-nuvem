import { fileURLToPath } from "node:url";
// Teste da confirmação de e-mail no cadastro e do Turnstile (anti-robô).
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
  // Nos testes, conta nova já sai com o e-mail confirmado (o teste da confirmação desliga isso).
  if (caminho === "/api/register" && !globalThis.__semConfirmar) db.prepare("UPDATE users SET email_confirmado_em = COALESCE(email_confirmado_em, datetime('now'))").run();
  const sc = r.headers.get("Set-Cookie");
  if (sc) cookie = sc.split(";")[0];
  return { status: r.status, dados: await r.json() };
}
let falhas = 0;
function confere(nome, ok, info) { console.log((ok ? "OK   " : "FALHA") + " " + nome + (ok ? "" : "  -> " + JSON.stringify(info))); if (!ok) falhas++; }

globalThis.__semConfirmar = true;
env.RESEND_API_KEY = "re_teste";
const emails = [];
let turnstileResposta = true, turnstileChamadas = 0;
globalThis.fetch = async (url, op) => {
  url = String(url);
  if (url.includes("api.resend.com")) { emails.push(JSON.parse(op.body)); return new Response("{}"); }
  if (url.includes("turnstile/v0/siteverify")) { turnstileChamadas++; return new Response(JSON.stringify({ success: turnstileResposta && op.body.get("response") === "tk-bom" })); }
  return fetchMp(url, op);
};
const linkDe = (m) => m.text.match(/https:\/\/\S+/)[0];

// Sem chave do Turnstile: cadastro funciona normalmente e manda o e-mail de confirmação.
let r = await chamar("/api/register", { email: "bia@teste.com", senha: "senha-forte-1", nome: "Bia Souza", aceite: true });
confere("cadastro ok e pede confirmação", r.status === 200 && r.dados.confirmar_email === true, r);
confere("sem Turnstile configurado não chama a Cloudflare", turnstileChamadas === 0, turnstileChamadas);
confere("mandou 1 e-mail de confirmação", emails.length === 1 && /Confirme o seu e-mail/.test(emails[0].subject) && emails[0].to[0] === "bia@teste.com", emails);
const link1 = linkDe(emails[0]);
confere("link aponta para /api/email/confirmar", link1.startsWith(BASE + "/api/email/confirmar?t="), link1);
const tk1 = new URL(link1).searchParams.get("t");
confere("banco guarda só o hash", db.prepare("SELECT COUNT(*) n FROM users WHERE confirmacao_hash = ?").get(tk1).n === 0, "");

r = await chamar("/api/me");
confere("/api/me diz que não está confirmado", r.dados.email_confirmado === false, r);
r = await chamar("/api/cupom", { codigo: "QUALQUER" });
confere("cupom pede e-mail confirmado", r.status === 403 && r.dados.confirmar_email, r);
r = await chamar("/api/checkout", { gb: 10 });
confere("checkout pede e-mail confirmado", r.status === 403 && r.dados.confirmar_email, r);

// Reenviar: até 3 por hora; o link novo substitui o antigo.
r = await chamar("/api/email/reenviar", {});
confere("reenviar manda outro e-mail", r.status === 200 && emails.length === 2, r);
const tk2 = new URL(linkDe(emails[1])).searchParams.get("t");
await chamar("/api/email/reenviar", {});
await chamar("/api/email/reenviar", {});
r = await chamar("/api/email/reenviar", {});
confere("limite de 3 reenvios por hora", r.status === 429 && emails.length === 4, { r, n: emails.length });
const tk4 = new URL(linkDe(emails[3])).searchParams.get("t");
r = await chamar("/api/email/reenviar", {}, { Origin: "https://mal.com" });
confere("reenviar de outra origem bloqueado", r.status === 403, r);

async function abrir(tk) {
  const resp = await worker.fetch(new Request(BASE + "/api/email/confirmar?t=" + tk), env);
  return resp.headers.get("Location") || "";
}
confere("link antigo não vale mais", (await abrir(tk1)).endsWith("confirmado=0"), "");
confere("token inventado não vale", (await abrir("a".repeat(48))).endsWith("confirmado=0"), "");
confere("token com formato errado não vale", (await abrir("x'or'1")).endsWith("confirmado=0"), "");
db.prepare("UPDATE users SET confirmacao_expira = datetime('now','-1 minute')").run();
confere("link vencido não vale", (await abrir(tk4)).endsWith("confirmado=0"), "");
db.prepare("UPDATE users SET confirmacao_expira = datetime('now','+1 day')").run();
confere("link certo confirma e volta ao Painel", (await abrir(tk4)) === BASE + "/painel?confirmado=1", "");
confere("mesmo link não funciona 2 vezes", (await abrir(tk4)).endsWith("confirmado=0"), "");
void tk2;

r = await chamar("/api/me");
confere("/api/me diz que está confirmado", r.dados.email_confirmado === true, r);
r = await chamar("/api/checkout", { gb: 10 });
confere("checkout liberado depois de confirmar", r.status === 200 && r.dados.init_point, r);
r = await chamar("/api/email/reenviar", {});
confere("reenviar com e-mail já confirmado não manda nada", r.status === 200 && r.dados.ja_confirmado, r);

// Contas antigas (antes da 0027) já vêm confirmadas pela migração.
const semConfirmar = db.prepare("SELECT COUNT(*) n FROM users WHERE email_confirmado_em IS NULL").get().n;
confere("nenhuma conta ficou sem confirmar", semConfirmar === 0, semConfirmar);

// Turnstile configurado: login e cadastro exigem o token.
env.TURNSTILE_SECRET = "segredo-turnstile";
env.TURNSTILE_SITE_KEY = "chave-publica";
cookie = "";
r = await chamar("/api/config");
confere("/api/config entrega só a chave pública", r.dados.turnstile_site_key === "chave-publica" && !JSON.stringify(r.dados).includes("segredo"), r);
r = await chamar("/api/login", { email: "bia@teste.com", senha: "senha-forte-1" });
confere("login sem token barrado", r.status === 400 && r.dados.robo, r);
r = await chamar("/api/login", { email: "bia@teste.com", senha: "senha-forte-1", turnstile: "tk-ruim" });
confere("login com token ruim barrado", r.status === 400 && r.dados.robo, r);
r = await chamar("/api/login", { email: "bia@teste.com", senha: "senha-forte-1", turnstile: "tk-bom" });
confere("login com token bom entra", r.status === 200 && r.dados.ok, r);
cookie = "";
r = await chamar("/api/register", { email: "robo@teste.com", senha: "senha-forte-1", nome: "Robô", aceite: true });
confere("cadastro sem token barrado", r.status === 400 && r.dados.robo, r);
confere("robô não virou conta", db.prepare("SELECT COUNT(*) n FROM users WHERE email = 'robo@teste.com'").get().n === 0, "");
r = await chamar("/api/register", { email: "gente@teste.com", senha: "senha-forte-1", nome: "Gente", aceite: true, turnstile: "tk-bom" });
confere("cadastro com token bom funciona", r.status === 200, r);

// Se a Cloudflare cair, não trava o site.
const fetchAntes = globalThis.fetch;
globalThis.fetch = async (url, op) => { if (String(url).includes("siteverify")) throw new Error("fora do ar"); return fetchAntes(url, op); };
cookie = "";
r = await chamar("/api/login", { email: "bia@teste.com", senha: "senha-forte-1", turnstile: "x" });
confere("Turnstile fora do ar não trava o login", r.status === 200, r);
globalThis.fetch = fetchAntes;

// Saúde do site (para o monitor externo).
r = await chamar("/api/saude");
confere("/api/saude responde 200", r.status === 200 && r.dados.ok, r);
const envQuebrado = Object.assign({}, env, { DB: { prepare() { throw new Error("banco caiu"); } } });
const rq = await worker.fetch(new Request(BASE + "/api/saude"), envQuebrado);
confere("/api/saude dá 503 se o banco cair", rq.status === 503, rq.status);

console.log(falhas ? "\n" + falhas + " FALHA(S)" : "\nTODOS OS TESTES PASSARAM");
process.exit(falhas ? 1 : 0);
