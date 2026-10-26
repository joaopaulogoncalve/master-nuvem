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

db.exec("PRAGMA foreign_keys = ON");
Object.assign(env, { B2_ENDPOINT: "s3.us-east-005.backblazeb2.com", B2_BUCKET: "balde", B2_KEY_ID: "005abc", B2_APP_KEY: "K005xyz" });
globalThis.fetch = async (url, op) => {
  url = String(url);
  if (url.includes("backblazeb2.com") && op && op.method === "HEAD") return new Response(null, { status: 200, headers: { "Content-Length": "5000" } });
  return fetchMp(url, op);
};
const reg = async (email) => { cookie = ""; await chamar("/api/register", { email, senha: "senha-forte-1", nome: email.split("@")[0], aceite: true }); return cookie; };
const dono = await reg("foto@t.com");
const outro = await reg("outro@t.com");
db.prepare("INSERT INTO subscriptions (user_id, quota_gb, status, paid_until) VALUES (1, 10, 'active', datetime('now','+30 days')), (2, 10, 'active', datetime('now','+30 days'))").run();

cookie = outro;
await chamar("/api/portal/salvar", { nome: "Outro", slug: "outro", cor: "#000000" });
await chamar("/api/portal/clientes/novo", { nome: "Cli Outro", email: "o@t.com", senha: "senha-cliente-9" });
cookie = dono;
await chamar("/api/portal/salvar", { nome: "Estúdio Aurora", slug: "aurora", cor: "#be185d" });
await chamar("/api/portal/clientes/novo", { nome: "Ana Souza", email: "ana@t.com", senha: "senha-cliente-1" });
await chamar("/api/portal/clientes/novo", { nome: "Bia", email: "bia@t.com", senha: "senha-cliente-2" });
const ana = db.prepare("SELECT id FROM portal_clientes WHERE email='ana@t.com'").get().id;
const bia = db.prepare("SELECT id FROM portal_clientes WHERE email='bia@t.com'").get().id;
const cliOutro = db.prepare("SELECT id FROM portal_clientes WHERE email='o@t.com'").get().id;
const albumAna = (await chamar("/api/portal/albuns/novo", { cliente_id: ana, titulo: "Casamento", tipo: "Casamento" })).dados.id;
const albumBia = (await chamar("/api/portal/albuns/novo", { cliente_id: bia, titulo: "15 anos", tipo: "15 anos" })).dados.id;
const up = (await chamar("/api/files/upload-url", { name: "foto.jpg", size: 5000, album_id: albumAna })).dados;
await chamar("/api/files/complete", { id: up.id });

let r = await chamar("/api/portal/cobrancas/nova", { cliente_id: ana, descricao: "Saldo", valor: "800,00" });
confere("sem PIX nem link: pede forma de recebimento", r.status === 400 && /chave PIX/.test(r.dados.error), r);
r = await chamar("/api/portal/pagamento", { cobrar: true, instrucoes: "PIX (CNPJ): 12.345.678/0001-90 - Estúdio Aurora" });
confere("salva forma de recebimento", r.status === 200, r);
r = await chamar("/api/portal/cobrancas/nova", { cliente_id: cliOutro, descricao: "Roubo", valor: "10" });
confere("não cobra cliente de outro portal", r.status === 400, r);
r = await chamar("/api/portal/cobrancas/nova", { cliente_id: ana, album_id: albumBia, descricao: "x", valor: "10" });
confere("álbum tem que ser do mesmo cliente", r.status === 400, r);
r = await chamar("/api/portal/cobrancas/nova", { cliente_id: ana, descricao: "x", valor: "0,50" });
confere("valor menor que R$ 1 recusado", r.status === 400, r);
r = await chamar("/api/portal/cobrancas/nova", { cliente_id: ana, descricao: "x", valor: "abc" });
confere("valor inválido recusado", r.status === 400, r);
r = await chamar("/api/portal/cobrancas/nova", { cliente_id: ana, descricao: "x", valor: "10", link: "javascript:alert(1)" });
confere("link perigoso recusado", r.status === 400, r);
r = await chamar("/api/portal/cobrancas/nova", { cliente_id: ana, album_id: albumAna, descricao: "Saldo do casamento", valor: "1.234,56", vencimento: "2020-01-10", link: "https://pagamento.exemplo.com/abc", bloqueia_album: true });
const cobId = r.dados.id;
confere("cria cobrança com R$ 1.234,56 e tranca o álbum", r.status === 200 && db.prepare("SELECT valor_centavos v, bloqueia_album b FROM cobrancas WHERE id=?").get(cobId).v === 123456, r);
await chamar("/api/portal/cobrancas/nova", { cliente_id: bia, descricao: "Sinal 15 anos", valor: 300 });
r = await chamar("/api/portal/cobrancas");
confere("resumo: a receber 1.534,56 e atrasado 1.234,56", r.dados.resumo.a_receber === 153456 && r.dados.resumo.atrasado === 123456 && r.dados.resumo.recebido_mes === 0, r.dados.resumo);
r = await chamar("/api/portal/albuns");
confere("fotógrafo vê o álbum como trancado", r.dados.albuns.find(a => a.id === albumAna).trancado === 1, r.dados.albuns);

// cliente final com álbum trancado
cookie = "";
await chamar("/api/p/login", { slug: "aurora", email: "ana@t.com", senha: "senha-cliente-1" });
r = await chamar("/api/p/me");
confere("cliente vê só a cobrança dela, com o PIX do estúdio", r.dados.cobrancas.length === 1 && r.dados.cobrancas[0].valor_centavos === 123456 && /12.345.678/.test(r.dados.portal.instrucoes_pagamento) && r.dados.albuns[0].trancado === 1, r.dados);
r = await chamar("/api/p/album?id=" + albumAna);
confere("álbum trancado: sem prévia das fotos", r.dados.trancado === true && r.dados.arquivos.length === 1 && r.dados.arquivos[0].previa === null, r.dados);
r = await chamar("/api/p/baixar?id=" + up.id);
confere("álbum trancado: download bloqueado (402)", r.status === 402, r);

// outro fotógrafo não mexe
cookie = outro;
r = await chamar("/api/portal/cobrancas/status", { id: cobId, status: "pago" });
confere("outro fotógrafo não marca minha cobrança", r.status === 404, r);

// fotógrafo marca como pago → libera
cookie = dono;
r = await chamar("/api/portal/cobrancas/status", { id: cobId, status: "pago" });
confere("marca como pago", r.status === 200, r);
r = await chamar("/api/portal/cobrancas");
confere("recebido no mês = 1.234,56", r.dados.resumo.recebido_mes === 123456 && r.dados.resumo.a_receber === 30000, r.dados.resumo);
cookie = "";
await chamar("/api/p/login", { slug: "aurora", email: "ana@t.com", senha: "senha-cliente-1" });
r = await chamar("/api/p/album?id=" + albumAna);
confere("pago: álbum liberado com prévia", r.dados.trancado === false && r.dados.arquivos[0].previa, r.dados);
r = await chamar("/api/p/baixar?id=" + up.id);
confere("pago: download liberado", r.status === 200 && r.dados.url, r);

// desfazer volta a trancar; cancelar libera
cookie = dono;
await chamar("/api/portal/cobrancas/status", { id: cobId, status: "pendente" });
cookie = "";
await chamar("/api/p/login", { slug: "aurora", email: "ana@t.com", senha: "senha-cliente-1" });
r = await chamar("/api/p/baixar?id=" + up.id);
confere("desfazer pagamento tranca de novo", r.status === 402, r);
cookie = dono;
await chamar("/api/portal/cobrancas/status", { id: cobId, status: "cancelado" });
cookie = "";
await chamar("/api/p/login", { slug: "aurora", email: "ana@t.com", senha: "senha-cliente-1" });
r = await chamar("/api/p/baixar?id=" + up.id);
const r2 = await chamar("/api/p/me");
confere("cancelada libera e some da lista do cliente", r.status === 200 && r2.dados.cobrancas.length === 0, r2.dados);

// apagar álbum mantém a cobrança (sem álbum)
cookie = dono;
await chamar("/api/portal/cobrancas/status", { id: cobId, status: "pendente" });
db.prepare("DELETE FROM files WHERE album_id = ?").run(albumAna);
db.prepare("DELETE FROM albuns WHERE id = ?").run(albumAna);
confere("apagar álbum não apaga a cobrança", db.prepare("SELECT album_id FROM cobrancas WHERE id=?").get(cobId).album_id === null, "");

console.log(falhas ? "\n" + falhas + " FALHA(S)" : "\nTODOS OS TESTES PASSARAM");
process.exit(falhas ? 1 : 0);
