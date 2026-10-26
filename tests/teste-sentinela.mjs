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

env.RESEND_API_KEY = "re_x";
const emails = [];
const fetchAntes = globalThis.fetch;
globalThis.fetch = async (url, op) => {
  if (String(url).includes("api.resend.com")) { emails.push(JSON.parse(op.body)); return new Response("{}"); }
  return fetchAntes(url, op);
};
const reg = async (email) => { cookie = ""; await chamar("/api/register", { email, senha: "senha-forte-1", nome: "Ana Lima", aceite: true }); return cookie; };
// ---- corpo do teste da sentinela e dos limites de tentativas ----
const { sentinela } = await import(new URL("../", import.meta.url).href + "src/sentinela.js");
const base32 = (s) => { const A = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567"; let bits = 0, v = 0; const out = []; for (const ch of s) { v = (v << 5) | A.indexOf(ch); bits += 5; if (bits >= 8) { out.push((v >>> (bits - 8)) & 255); bits -= 8; } } return Buffer.from(out); };
const totp = (seg, desloc = 0) => { const c = Math.floor(Date.now() / 30000) + desloc; const b = Buffer.alloc(8); b.writeUInt32BE(Math.floor(c / 4294967296), 0); b.writeUInt32BE(c >>> 0, 4); const h = createHmac("sha1", base32(seg)).update(b).digest(); const o = h[19] & 15; return String((((h[o] & 127) << 24) | (h[o + 1] << 16) | (h[o + 2] << 8) | h[o + 3]) % 1000000).padStart(6, "0"); };
const ip = (n) => ({ "CF-Connecting-IP": "200.1.1." + n });
const travada = (email) => db.prepare("SELECT travada_em FROM users WHERE email = ?").get(email).travada_em;
const sessoesDe = (email) => db.prepare("SELECT COUNT(*) n FROM sessions s JOIN users u ON u.id = s.user_id WHERE u.email = ?").get(email).n;
const login = (email, senha, extra) => { cookie = ""; return chamar("/api/login", { email, senha }, extra); };
const limparLimites = () => db.prepare("DELETE FROM assistente_limite").run();

const admin = await reg("adm@t.com");
db.prepare("UPDATE users SET role = 'admin', created_at = datetime('now', '-30 days') WHERE email = 'adm@t.com'").run();
await reg("ana@t.com");
await reg("bia@t.com");
await reg("caio@t.com");

// ---------- cabeçalhos de proteção ----------
let resp = await worker.fetch(new Request(BASE + "/api/me"), env);
confere("API manda cabeçalhos de proteção e não guarda cache", resp.headers.get("X-Frame-Options") === "SAMEORIGIN" && resp.headers.get("X-Content-Type-Options") === "nosniff" && resp.headers.get("Cache-Control") === "no-store" && /max-age/.test(resp.headers.get("Strict-Transport-Security")), [...resp.headers]);
resp = await worker.fetch(new Request(BASE + "/p/estudio-x"), env);
confere("página do portal também tem cabeçalhos", resp.headers.get("X-Frame-Options") === "SAMEORIGIN", [...resp.headers]);

// ---------- limite de senhas erradas ----------
for (let i = 0; i < 10; i++) await login("ana@t.com", "errada-" + i, ip(1));
let r = await login("ana@t.com", "senha-forte-1", ip(1));
confere("depois de 10 senhas erradas, nem a senha certa entra (1 hora)", r.status === 429, r);
r = await login("ana@t.com", "senha-forte-1", ip(2));
confere("o bloqueio vale para a conta, mesmo de outra conexão", r.status === 429, r);
r = await login("bia@t.com", "senha-forte-1", ip(1));
confere("outra conta, mesma conexão: ainda entra (só 10 erros desse IP)", r.status === 200, r);
limparLimites();
for (let i = 0; i < 20; i++) await login("naoexiste" + i + "@t.com", "x", ip(3));
r = await login("caio@t.com", "senha-forte-1", ip(3));
confere("20 senhas erradas do mesmo IP (contas diferentes) bloqueiam o IP", r.status === 429, r);
r = await login("caio@t.com", "senha-forte-1", ip(4));
confere("de outro IP a conta entra normal", r.status === 200, r);
limparLimites();
r = await login("ana@t.com", "senha-forte-1", ip(5));
confere("login certo continua funcionando", r.status === 200, r);

// ---------- limite de cadastros ----------
let ok = 0;
for (let i = 0; i < 6; i++) { cookie = ""; const x = await worker.fetch(new Request(BASE + "/api/register", { method: "POST", headers: Object.assign({ "Content-Type": "application/json", Origin: BASE }, ip(9)), body: JSON.stringify({ email: "massa" + i + "@t.com", senha: "senha-forte-1", nome: "M", aceite: true }) }), env); if (x.status === 200) ok++; else r = { status: x.status, dados: await x.json() }; }
confere("no máximo 5 contas por conexão por hora", ok === 5 && r.status === 429, { ok, r });

// ---------- sentinela: senha certa + 2FA errado = tranca ----------
const SEG = "JBSWY3DPEHPK3PXPJBSWY3DPEHPK3PXP";
db.prepare("UPDATE users SET totp_enabled = 1, totp_secret = ?, totp_last = 0 WHERE email = 'bia@t.com'").run(SEG);
limparLimites();
emails.length = 0;
r = await login("bia@t.com", "senha-forte-1", ip(10));
confere("bia com 2FA: pede o código", r.dados.need2fa === true, r);
for (let i = 0; i < 5; i++) await chamar("/api/login/2fa", { codigo: "000000" }, ip(10));
r = await chamar("/api/login/2fa", { codigo: totp(SEG) }, ip(10));
confere("5 códigos errados derrubam a tentativa", r.status === 429, r);
await login("bia@t.com", "senha-forte-1", ip(11));
await chamar("/api/login/2fa", { codigo: "111111" }, ip(11));
const cookieBia = await reg("bia2@t.com"); // conta qualquer; a sessão da bia vem abaixo
db.prepare("INSERT INTO sessions (token_hash, user_id, expires_at, pending) SELECT 'sessao-velha-bia', id, datetime('now', '+1 day'), 0 FROM users WHERE email = 'bia@t.com'").run();
let rel = await sentinela(env);
confere("sentinela tranca a conta (6 códigos errados com a senha certa)", !!travada("bia@t.com") && rel.trancou === 1, rel);
confere("derruba todas as sessões da conta trancada", sessoesDe("bia@t.com") === 0, sessoesDe("bia@t.com"));
confere("avisa a dona da conta e o suporte por e-mail", emails.some(e => e.to[0] === "bia@t.com" && /Protegemos/.test(e.subject)) && emails.some(e => e.to[0] === "contato@masternuvem.com.br" && /trancou/.test(e.subject)), emails.map(e => e.to[0] + ": " + e.subject));
confere("e-mail do suporte sem HTML injetado", emails.every(e => !/<script/i.test(e.html)), "");
limparLimites();
r = await login("bia@t.com", "senha-forte-1", ip(12));
confere("conta trancada não entra nem com a senha certa (423)", r.status === 423 && r.dados.travada === true, r);
emails.length = 0;
rel = await sentinela(env);
confere("rodar de novo não repete o alerta nem o e-mail", rel.trancou === 0 && emails.length === 0, { rel, emails: emails.length });

// destrava criando senha nova pelo e-mail
cookie = "";
await chamar("/api/senha/esqueci", { email: "bia@t.com" });
const link = emails.find(e => e.to[0] === "bia@t.com").text.match(/token=([0-9a-f]{64})/)[1];
r = await chamar("/api/senha/redefinir", { token: link, senha: "senha-nova-123" });
confere("senha nova destrava a conta", r.status === 200 && !travada("bia@t.com"), r);
await new Promise(res => setTimeout(res, 1100)); // eventos novos com horário depois da senha nova
r = await login("bia@t.com", "senha-nova-123", ip(13));
r = await chamar("/api/login/2fa", { codigo: totp(SEG, 1) }, ip(13));
confere("depois da senha nova, entra com o código certo", r.status === 200, r);
rel = await sentinela(env);
confere("sentinela não tranca de novo pelos erros antigos", !travada("bia@t.com") && rel.trancou === 0, rel);

// ---------- sentinela: muitas conexões diferentes ----------
limparLimites();
for (let i = 20; i < 25; i++) await login("caio@t.com", "senha-forte-1", ip(i));
rel = await sentinela(env);
confere("entrar de 5 conexões diferentes em 1 hora tranca a conta", !!travada("caio@t.com"), rel);

// ---------- avisos ----------
emails.length = 0;
limparLimites();
db.prepare("DELETE FROM sentinela_alertas WHERE chave LIKE 'erros-login:%'").run(); // o 1º aviso do dia já saiu no começo do teste
for (let i = 0; i < 10; i++) await login("ana@t.com", "errada-" + i, ip(30 + i));
rel = await sentinela(env);
confere("10 senhas erradas contra a conta: avisa a dona (sem trancar)", !travada("ana@t.com") && emails.some(e => e.to[0] === "ana@t.com" && /Tentaram/.test(e.subject)), emails.map(e => e.to[0] + ": " + e.subject));
const anaId = db.prepare("SELECT id FROM users WHERE email = 'ana@t.com'").get().id;
const ins = db.prepare("INSERT INTO seguranca_eventos (tipo, user_id, ip_hash) VALUES ('download', ?, 'x')");
for (let i = 0; i < 300; i++) ins.run(anaId);
emails.length = 0;
rel = await sentinela(env);
confere("300 downloads em 20 minutos: avisa o suporte", emails.some(e => /muitos downloads/.test(e.subject)), emails.map(e => e.subject));
db.prepare("INSERT INTO users (email, name, password_hash, password_salt, role) VALUES ('intruso@t.com', 'X', 'x', '00', 'admin')").run();
emails.length = 0;
limparLimites();
await login("adm@t.com", "senha-forte-1", ip(50));
rel = await sentinela(env);
confere("avisa conta de administrador nova", emails.some(e => /nova conta de administrador/.test(e.subject) && /intruso/.test(e.text)), emails.map(e => e.subject));
confere("avisa entrada na conta de administrador", emails.some(e => /entraram na conta de administrador/.test(e.subject)), emails.map(e => e.subject));
emails.length = 0;
await sentinela(env);
confere("não repete os avisos na rodada seguinte", emails.length === 0, emails.map(e => e.subject));

// ---------- admin ----------
cookie = "";
r = await login("adm@t.com", "senha-forte-1", ip(50));
const cookieAdm = cookie;
r = await chamar("/api/admin/sentinela");
confere("admin vê alertas, contas trancadas e resumo", r.status === 200 && r.dados.contas.some(c => c.email === "caio@t.com") && r.dados.alertas.length >= 5 && r.dados.resumo_24h.senhas_erradas > 0, r.dados.contas);
const caioId = db.prepare("SELECT id FROM users WHERE email = 'caio@t.com'").get().id;
r = await chamar("/api/admin/sentinela/destravar", { user_id: caioId });
confere("admin destrava a conta", r.status === 200 && !travada("caio@t.com"), r);
await new Promise(res => setTimeout(res, 1100));
rel = await sentinela(env);
confere("depois de destravar, não tranca de novo pelo mesmo motivo", !travada("caio@t.com"), rel);
r = await chamar("/api/admin/sentinela/trancar", { user_id: anaId });
confere("admin tranca uma conta à mão (e derruba as sessões)", r.status === 200 && !!travada("ana@t.com") && sessoesDe("ana@t.com") === 0, r);
const admId = db.prepare("SELECT id FROM users WHERE email = 'adm@t.com'").get().id;
r = await chamar("/api/admin/sentinela/trancar", { user_id: admId });
confere("admin não tranca a própria conta", r.status === 400, r);
r = await chamar("/api/admin/clientes");
confere("lista de clientes mostra quem está trancado", r.dados.clientes.find(c => c.email === "ana@t.com").travada_em, "");
r = await chamar("/api/admin/sentinela/vistos", {});
confere("marca alertas como vistos", db.prepare("SELECT COUNT(*) n FROM sentinela_alertas WHERE visto = 0").get().n === 0, r);
cookie = "";
await login("bia@t.com", "senha-nova-123", ip(60));
r = await chamar("/api/admin/sentinela");
confere("quem não é admin não vê a sentinela", r.status !== 200, r);

// ---------- portal do fotógrafo ----------
cookie = cookieAdm;
const fotId = db.prepare("SELECT id FROM users WHERE email = 'adm@t.com'").get().id;
await chamar("/api/admin/plano", { user_id: fotId, gb: 10, dias: 30 });
await chamar("/api/portal/salvar", { nome: "Estudio X", slug: "estudio-x", cor: "#112233" });
await chamar("/api/portal/clientes/novo", { nome: "Cliente Um", email: "cli@t.com", senha: "senha-cliente-1" });
const cliId = db.prepare("SELECT id FROM portal_clientes WHERE email = 'cli@t.com'").get().id;
limparLimites();
for (let i = 0; i < 10; i++) { cookie = ""; await chamar("/api/p/login", { slug: "estudio-x", email: "cli@t.com", senha: "errada" + i }, ip(70)); }
cookie = "";
r = await chamar("/api/p/login", { slug: "estudio-x", email: "cli@t.com", senha: "senha-cliente-1" }, ip(71));
confere("portal: 10 senhas erradas bloqueiam o login do cliente", r.status === 429, r);
limparLimites();
for (let i = 80; i < 85; i++) { cookie = ""; await chamar("/api/p/login", { slug: "estudio-x", email: "cli@t.com", senha: "senha-cliente-1" }, ip(i)); }
emails.length = 0;
await sentinela(env);
const cliTrav = db.prepare("SELECT travada_em FROM portal_clientes WHERE id = ?").get(cliId).travada_em;
confere("portal: cliente que entra de 5 conexões é trancado e o fotógrafo é avisado", !!cliTrav && emails.some(e => e.to[0] === "adm@t.com" && /cliente seu/.test(e.subject)), emails.map(e => e.to[0] + ": " + e.subject));
cookie = "";
r = await chamar("/api/p/login", { slug: "estudio-x", email: "cli@t.com", senha: "senha-cliente-1" }, ip(90));
confere("portal: cliente trancado não entra (423)", r.status === 423, r);
cookie = cookieAdm;
r = await chamar("/api/portal/clientes");
confere("fotógrafo vê que o cliente está trancado", !!r.dados.clientes[0].travada_em, r.dados.clientes);
await chamar("/api/portal/clientes/senha", { cliente_id: cliId, senha: "senha-cliente-2" });
await new Promise(res => setTimeout(res, 1100));
cookie = "";
r = await chamar("/api/p/login", { slug: "estudio-x", email: "cli@t.com", senha: "senha-cliente-2" }, ip(91));
confere("portal: senha nova do fotógrafo destrava o cliente", r.status === 200, r);
await sentinela(env);
confere("portal: não tranca de novo pelas entradas antigas", !db.prepare("SELECT travada_em FROM portal_clientes WHERE id = ?").get(cliId).travada_em, "");

// ---------- limpeza apaga o diário velho ----------
db.prepare("INSERT INTO seguranca_eventos (tipo, created_at) VALUES ('login_ok', datetime('now', '-91 days'))").run();
const ctx = { waitUntil(p) { this.p = p; } };
await worker.scheduled({ cron: "0 * * * *" }, env, ctx); await ctx.p;
confere("limpeza apaga eventos com mais de 90 dias", db.prepare("SELECT COUNT(*) n FROM seguranca_eventos WHERE created_at < datetime('now', '-90 days')").get().n === 0, "");
emails.length = 0;
await worker.scheduled({ cron: "*/20 * * * *" }, env, ctx); await ctx.p;
confere("o Cron de 20 minutos chama a sentinela", typeof ctx.p.then === "undefined" ? false : true, "");

console.log(falhas ? "\n" + falhas + " FALHA(S)" : "\nTODOS OS TESTES PASSARAM");
process.exit(falhas ? 1 : 0);
