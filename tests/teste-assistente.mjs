import { fileURLToPath } from "node:url";
// Teste local do fluxo checkout -> webhook, com banco SQLite em memória e Mercado Pago simulado.
import { DatabaseSync } from "node:sqlite";
import { readFileSync } from "node:fs";
import { createHmac } from "node:crypto";

const RAIZ = fileURLToPath(new URL("../", import.meta.url)).replace(/\\/g, "/");
const worker = (await import(new URL("../", import.meta.url).href + "src/worker.js")).default;

const db = new DatabaseSync(":memory:");
for (const m of ["0001_init", "0002_recuperar_senha", "0003_aceite_termos", "0004_avisos", "0005_portal", "0006_cobrancas", "0007_cupons", "0008_tabela_precos", "0009_cupom_preco", "0010_assistente", "0011_sentinela", "0012_faq_mais", "0013_eventos", "0014_faq_blog_eventos", "0015_regras_acesso", "0016_faq_estudio", "0017_lixeira", "0018_visual", "0019_aumentar_espaco", "0020_fotos_extras", "0021_bancos", "0022_contratos", "0023_copias", "0024_contrato_obrigatorio", "0025_senha_cliente", "0026_varias_pessoas", "0027_confirmar_email"]) db.exec(readFileSync(RAIZ + "migrations/" + m + ".sql", "utf8"));

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
  if (String(url).includes("api.resend.com")) { const m = JSON.parse(op.body); if (!/Confirme o seu e-mail/.test(m.subject)) emails.push(m); return new Response("{}"); }
  return fetchAntes(url, op);
};
const reg = async (email) => { cookie = ""; await chamar("/api/register", { email, senha: "senha-forte-1", nome: "Ana Lima", aceite: true }); return cookie; };
const admin = await reg("adm@t.com");
db.prepare("UPDATE users SET role = 'admin' WHERE email = 'adm@t.com'").run();
const ana = await reg("ana@t.com");

cookie = "";
let r = await chamar("/api/assistente/faq");
confere("FAQ inicial com 68 perguntas", r.status === 200 && r.dados.faq.length === 68 && r.dados.prazo === "48 horas", r.dados.faq && r.dados.faq.length);

r = await chamar("/api/assistente/pergunta", { texto: "vocês emitem nota fiscal?", faq_id: null });
await chamar("/api/assistente/pergunta", { texto: "Vocês emitem nota fiscal?", faq_id: null });
await chamar("/api/assistente/pergunta", { texto: "quanto custa?", faq_id: 2 });
await chamar("/api/assistente/pergunta", { texto: "x", faq_id: 999 });
confere("registra perguntas (com e sem resposta)", db.prepare("SELECT COUNT(*) n FROM perguntas_chat").get().n === 3, db.prepare("SELECT * FROM perguntas_chat").all());
r = await chamar("/api/assistente/pergunta", { texto: "<b>oi</b>" }, { Origin: "https://mal.com" });
confere("outra origem bloqueada", r.status === 403, r);

// chamado
r = await chamar("/api/assistente/chamado", { nome: "A", email: "x@t.com", mensagem: "ajuda" });
confere("nome curto recusado", r.status === 400, r);
r = await chamar("/api/assistente/chamado", { nome: "Bia <script>", email: "bia@t.com", mensagem: "Vocês emitem nota fiscal?\nPreciso para a empresa.", pagina: "/painel" });
confere("abre chamado e devolve protocolo", r.status === 200 && r.dados.protocolo === 1 && r.dados.prazo === "48 horas", r);
confere("manda e-mail para o suporte e confirmação para a pessoa", emails.length === 2 && emails[0].to[0] === "contato@masternuvem.com.br" && emails[1].to[0] === "bia@t.com", emails.map(e => e.to[0]));
confere("e-mails sem HTML injetado", !emails[0].html.includes("<script>") && !emails[1].html.includes("<script>"), "");
cookie = ana;
await chamar("/api/assistente/chamado", { nome: "Ana", email: "ana@t.com", mensagem: "Meu upload deu erro" });
confere("chamado guarda a conta quando está logado", db.prepare("SELECT user_id FROM chamados WHERE id = 2").get().user_id === 2, "");
await chamar("/api/assistente/chamado", { nome: "Ana", email: "ana@t.com", mensagem: "terceiro chamado" });
r = await chamar("/api/assistente/chamado", { nome: "Ana", email: "ana@t.com", mensagem: "quarto chamado" });
confere("limite de 3 chamados por hora", r.status === 429, r);

// admin
r = await chamar("/api/admin/assistente");
confere("cliente comum não vê o admin do assistente", r.status === 403, r);
cookie = admin;
r = await chamar("/api/admin/assistente");
confere("admin vê pergunta sem resposta agrupada (2x)", r.dados.sem_resposta[0].texto === "vocês emitem nota fiscal?" && r.dados.sem_resposta[0].vezes === 2, r.dados.sem_resposta);
confere("admin vê chamados abertos e uso da FAQ", r.dados.chamados.length === 3 && r.dados.faq.find(f => f.id === 2).usos_30d === 1, r.dados.chamados.length);
r = await chamar("/api/admin/faq/salvar", { pergunta: "Vocês emitem nota fiscal?", palavras: "Nota Fiscal, NF, NFé", resposta: "Sim, emitimos." });
const nova = db.prepare("SELECT * FROM faq ORDER BY id DESC").get();
confere("ensina resposta nova (palavras sem acento e minúsculas)", r.status === 200 && nova.palavras === "nota fiscal, nf, nfe", nova);
r = await chamar("/api/admin/faq/salvar", { id: nova.id, pergunta: nova.pergunta, palavras: nova.palavras, resposta: nova.resposta, ativo: false });
cookie = "";
r = await chamar("/api/assistente/faq");
confere("resposta desligada some do chat", r.dados.faq.length === 68, r.dados.faq.length);
cookie = admin;
await chamar("/api/admin/faq/remover", { id: nova.id });
r = await chamar("/api/admin/chamados/status", { id: 1, status: "resolvido" });
confere("marca chamado como resolvido", r.status === 200 && db.prepare("SELECT status, resolvido_em FROM chamados WHERE id = 1").get().resolvido_em, "");

console.log(falhas ? "\n" + falhas + " FALHA(S)" : "\nTODOS OS TESTES PASSARAM");
process.exit(falhas ? 1 : 0);
