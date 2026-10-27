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


const { fazerCopia } = await import(new URL("../", import.meta.url).href + "src/copia.js");
const { execFileSync } = await import("node:child_process");
const { writeFileSync, mkdtempSync } = await import("node:fs");
const { tmpdir } = await import("node:os");
Object.assign(env, { B2_ENDPOINT: "s3.us-east-005.backblazeb2.com", B2_BUCKET: "balde", B2_KEY_ID: "005abc", B2_APP_KEY: "K005xyz" });
const guardados = {};
let b2Falha = false;
globalThis.fetch = async (url, op) => {
  url = String(url);
  if (url.includes("backblazeb2.com")) {
    if (b2Falha) return new Response("erro", { status: 500 });
    const chave = url.split("?")[0].split("/balde/")[1];
    if (op && op.method === "PUT") { guardados[chave] = op.body; return new Response(null, { status: 200 }); }
  }
  throw new Error("fetch inesperado " + url);
};

// dados de exemplo
cookie = "";
await chamar("/api/register", { email: "joao@t.com", senha: "senha-forte-1", nome: "João", aceite: true });
const admin = cookie;
db.prepare("UPDATE users SET role = 'admin' WHERE email = 'joao@t.com'").run();
db.prepare("INSERT INTO subscriptions (user_id, quota_gb, status, paid_until) VALUES (1, 10, 'active', datetime('now','+30 days'))").run();
db.prepare("INSERT INTO portais (user_id, slug, nome, cor) VALUES (1, 'estudio-o''brien', 'Estúdio O''Brien \"Luz\"', '#000000')").run();

const r1 = await fazerCopia(env);
const chave = Object.keys(guardados)[0];
confere("cópia vai para backups/banco-dia-DD.json", r1.ok && /^backups\/banco-dia-\d{2}\.json$/.test(chave), r1);
const copia = JSON.parse(guardados[chave]);
confere("tem usuários, planos, portais e contratos", copia.tabelas.users.linhas.length === 1 && copia.tabelas.subscriptions.linhas.length === 1 && copia.tabelas.portais && copia.tabelas.contratos, Object.keys(copia.tabelas));
confere("não guarda sessões nem links de senha", !copia.tabelas.sessions && !copia.tabelas.password_resets && !copia.tabelas.assistente_limite, "");
confere("registra a cópia na tabela copias", db.prepare("SELECT COUNT(*) AS n FROM copias WHERE ok = 1").get().n === 1, "");

// restauração: JSON → SQL → banco novo, e os dados voltam iguais
const pasta = mkdtempSync(tmpdir() + "/copia-");
writeFileSync(pasta + "/banco-dia-01.json", guardados[chave]);
execFileSync(process.execPath, [fileURLToPath(new URL("../scripts/restaurar-copia.mjs", import.meta.url)), pasta + "/banco-dia-01.json"]);
const novo = new DatabaseSync(":memory:");
novo.exec(readFileSync(pasta + "/banco-dia-01.sql", "utf8"));
confere("restauração devolve os mesmos dados (inclusive aspas no nome)", novo.prepare("SELECT nome FROM portais").get().nome === "Estúdio O'Brien \"Luz\"" && novo.prepare("SELECT COUNT(*) AS n FROM users").get().n === 1 && novo.prepare("SELECT quota_gb FROM subscriptions").get().quota_gb === 10, "");

b2Falha = true;
const r2 = await fazerCopia(env);
confere("se o Backblaze falhar, registra a falha", !r2.ok && db.prepare("SELECT COUNT(*) AS n FROM copias WHERE ok = 0").get().n === 1, r2);
b2Falha = false;

cookie = admin;
let r = await chamar("/api/admin/copias");
confere("admin vê a lista de cópias", r.status === 200 && r.dados.copias.length === 2, r.dados);
r = await chamar("/api/admin/copias/agora", {});
confere("botão 'fazer cópia agora' funciona", r.status === 200 && r.dados.ok, r);
r = await chamar("/api/admin/copias/baixar?id=1");
confere("link para baixar a cópia (assinado, 5 min)", r.status === 200 && /backups\/banco-dia-\d{2}\.json\?.*X-Amz-Signature=/.test(r.dados.url), r.dados);
cookie = "";
await chamar("/api/register", { email: "cliente@t.com", senha: "senha-forte-1", nome: "Cliente", aceite: true });
r = await chamar("/api/admin/copias");
confere("cliente comum não vê as cópias", r.status === 403, r.status);

console.log(falhas ? "\n" + falhas + " FALHA(S)" : "\nTODOS OS TESTES PASSARAM");
process.exit(falhas ? 1 : 0);
