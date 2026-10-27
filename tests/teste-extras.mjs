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
const apagados = [];
globalThis.fetch = async (url, op) => {
  url = String(url);
  if (url.includes("backblazeb2.com")) {
    const m = (op && op.method) || "GET";
    if (m === "HEAD") return new Response(null, { status: 200, headers: { "Content-Length": "5000" } });
    if (m === "DELETE") { apagados.push(url.split("?")[0].split("/balde/")[1]); return new Response(null, { status: 204 }); }
  }
  return fetchMp(url, op);
};
const reg = async (email) => { cookie = ""; await chamar("/api/register", { email, senha: "senha-forte-1", nome: email.split("@")[0], aceite: true }); return cookie; };
const dono = await reg("foto@t.com");
const outro = await reg("outro@t.com");
db.prepare("INSERT INTO subscriptions (user_id, quota_gb, status, paid_until) VALUES (1, 10, 'active', datetime('now','+30 days')), (2, 10, 'active', datetime('now','+30 days'))").run();

cookie = dono;
let r = await chamar("/api/portal/salvar", { nome: "Estúdio Luz", slug: "estudio-luz", cor: "#0d9488", tema: "escuro" });
confere("salva o portal com o layout escolhido", r.status === 200 && db.prepare("SELECT tema FROM portais WHERE slug = 'estudio-luz'").get().tema === "escuro", r);
await chamar("/api/portal/salvar", { nome: "Estúdio Luz", slug: "estudio-luz", cor: "#0d9488", tema: "hackeado" });
confere("layout inválido mantém o atual", db.prepare("SELECT tema FROM portais WHERE slug = 'estudio-luz'").get().tema === "escuro", "");
cookie = "";
r = await chamar("/api/p/info?slug=estudio-luz");
confere("área do cliente recebe o layout", r.dados.tema === "escuro", r.dados);

cookie = dono;
await chamar("/api/portal/clientes/novo", { nome: "Ana", email: "ana@t.com", senha: "senha-cliente-1" });
const cliId = db.prepare("SELECT id FROM portal_clientes WHERE email = 'ana@t.com'").get().id;
r = await chamar("/api/portal/albuns/novo", { cliente_id: cliId, titulo: "Casamento", tipo: "Casamento" });
const albId = r.dados.id;

// envio: original + prévia leve
async function enviar(nome, comPrevia) {
  cookie = dono;
  const o = await chamar("/api/files/upload-url", { name: nome, size: 5000, album_id: albId });
  await chamar("/api/files/complete", { id: o.dados.id });
  let p = null;
  if (comPrevia) {
    p = await chamar("/api/files/upload-url", { name: "previa-" + nome, size: 800, album_id: albId, previa: true });
    await chamar("/api/files/complete", { id: p.dados.id });
    const l = await chamar("/api/portal/previa", { original_id: o.dados.id, previa_id: p.dados.id });
    if (l.status !== 200) throw new Error("previa " + JSON.stringify(l));
  }
  return { o: o.dados.id, p: p && p.dados.id };
}
const fotos = [];
for (const n of ["B1.jpg", "B2.jpg", "B3.jpg", "B4.jpg"]) fotos.push((await enviar(n, false)).o);
cookie = dono;
r = await chamar("/api/portal/albuns/regras", { id: albId, pode_baixar: true, max_fotos: "2", preco_extra: "20", faixas_extra: [{ a_partir: 3, preco: "15" }, { a_partir: 20, preco: "" }] });
confere("salva limite de 2 fotos + R$ 20 a mais + desconto a partir de 3", r.status === 200, r);
let a = db.prepare("SELECT max_fotos, preco_extra_centavos, faixas_extra FROM albuns WHERE id = ?").get(albId);
confere("guardado no álbum (linha de desconto vazia é ignorada)", a.max_fotos === 2 && a.preco_extra_centavos === 2000 && a.faixas_extra === '[{"a_partir":3,"preco_centavos":1500}]', a);
r = await chamar("/api/portal/albuns/regras", { id: albId, max_fotos: "2", preco_extra: "20", faixas_extra: [{ a_partir: 3, preco: "25" }] });
confere("desconto mais caro que a foto é recusado", r.status === 400, r);

cookie = "";
await chamar("/api/p/login", { slug: "estudio-luz", email: "ana@t.com", senha: "senha-cliente-1" });
const cli = cookie;
r = await chamar("/api/p/album?id=" + albId);
confere("cliente recebe o limite e o preço das fotos a mais", r.dados.regras.limite_fotos === 2 && r.dados.regras.preco_extra_centavos === 2000 && r.dados.fotos_baixadas === 0, r.dados.regras);
r = await chamar("/api/p/baixar?id=" + fotos[0]);
confere("baixa a 1ª foto", r.status === 200, r);
r = await chamar("/api/p/baixar?id=" + fotos[0]);
confere("baixar de novo a mesma foto não gasta o limite", r.status === 200, r);
r = await chamar("/api/p/baixar?id=" + fotos[1]);
confere("baixa a 2ª foto", r.status === 200, r);
r = await chamar("/api/p/baixar?id=" + fotos[2]);
confere("3ª foto diferente: bloqueia e oferece fotos a mais", r.status === 402 && r.dados.limite_fotos && r.dados.pode_comprar, r);
r = await chamar("/api/p/album?id=" + albId);
confere("contador mostra 2 fotos baixadas", r.dados.fotos_baixadas === 2, r.dados.fotos_baixadas);

r = await chamar("/api/p/fotos-extras", { album_id: albId, qtd: 3 });
confere("pedir sem o estúdio ter PIX/link avisa", r.status === 400, r);
db.prepare("UPDATE portais SET instrucoes_pagamento = 'PIX: foto@t.com'").run();
r = await chamar("/api/p/fotos-extras", { album_id: albId, qtd: 2 });
confere("2 fotos a mais = 2 × R$ 20 = R$ 40", r.status === 200 && r.dados.valor_centavos === 4000, r);
r = await chamar("/api/p/fotos-extras", { album_id: albId, qtd: 3 });
confere("3 fotos a mais com desconto = 3 × R$ 15 = R$ 45", r.dados.valor_centavos === 4500 && r.dados.unit === 1500, r);
const cobs = db.prepare("SELECT id, status, fotos_extra, valor_centavos FROM cobrancas ORDER BY id").all();
confere("pedir de novo troca o pedido anterior (só 1 em aberto)", cobs.length === 2 && cobs[0].status === "cancelado" && cobs[1].status === "pendente" && cobs[1].fotos_extra === 3, cobs);
r = await chamar("/api/p/me");
confere("cliente vê a cobrança das fotos a mais mesmo no acesso livre", r.dados.cobrancas.length === 1 && r.dados.cobrancas[0].fotos_extra === 3, r.dados.cobrancas);
r = await chamar("/api/p/album?id=" + albId);
confere("álbum mostra o pedido esperando pagamento", r.dados.extra_pendente && r.dados.extra_pendente.fotos_extra === 3, r.dados.extra_pendente);
r = await chamar("/api/p/baixar?id=" + fotos[2]);
confere("antes do pagamento continua bloqueado", r.status === 402, r);

cookie = dono;
r = await chamar("/api/portal/cobrancas/status", { id: cobs[1].id, status: "pago" });
confere("fotógrafo marca como pago", r.status === 200, r);
a = db.prepare("SELECT fotos_extras FROM albuns WHERE id = ?").get(albId);
confere("libera as 3 fotos a mais (limite 2 + 3 = 5)", a.fotos_extras === 3, a);
cookie = cli;
r = await chamar("/api/p/baixar?id=" + fotos[2]);
confere("depois de pago, baixa a 3ª foto", r.status === 200, r);
cookie = dono;
await chamar("/api/portal/cobrancas/status", { id: cobs[1].id, status: "pendente" });
confere("desfazer o pagamento tira as fotos a mais", db.prepare("SELECT fotos_extras FROM albuns WHERE id = ?").get(albId).fotos_extras === 0, "");
await chamar("/api/portal/cobrancas/status", { id: cobs[1].id, status: "pendente" });
confere("marcar pendente de novo não tira duas vezes", db.prepare("SELECT fotos_extras FROM albuns WHERE id = ?").get(albId).fotos_extras === 0, "");

// sem preço de foto a mais: bloqueia sem oferecer compra
r = await chamar("/api/portal/albuns/regras", { id: albId, max_fotos: "1", preco_extra: "" });
cookie = cli;
r = await chamar("/api/p/baixar?id=" + fotos[3]);
confere("sem venda de fotos a mais: bloqueia e manda falar com o estúdio", r.status === 402 && !r.dados.pode_comprar, r);
r = await chamar("/api/p/fotos-extras", { album_id: albId, qtd: 1 });
confere("e não deixa pedir fotos a mais", r.status === 400, r);
// sem limite: tudo liberado
cookie = dono;
await chamar("/api/portal/albuns/regras", { id: albId, max_fotos: "" });
cookie = cli;
r = await chamar("/api/p/baixar?id=" + fotos[3]);
confere("sem limite de fotos, baixa à vontade", r.status === 200, r);
// regras antigas (sem max_fotos no pedido) não apagam o limite
cookie = dono;
await chamar("/api/portal/albuns/regras", { id: albId, max_fotos: "7" });
await chamar("/api/portal/albuns/regras", { id: albId, pode_baixar: true });
confere("salvar regras sem o campo mantém o limite", db.prepare("SELECT max_fotos FROM albuns WHERE id = ?").get(albId).max_fotos === 7, "");

console.log(falhas ? "\n" + falhas + " FALHA(S)" : "\nTODOS OS TESTES PASSARAM");
process.exit(falhas ? 1 : 0);
