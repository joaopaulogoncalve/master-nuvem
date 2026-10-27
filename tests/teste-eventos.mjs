import { fileURLToPath } from "node:url";
// Teste local do fluxo checkout -> webhook, com banco SQLite em memória e Mercado Pago simulado.
import { DatabaseSync } from "node:sqlite";
import { readFileSync } from "node:fs";
import { createHmac } from "node:crypto";

const RAIZ = fileURLToPath(new URL("../", import.meta.url)).replace(/\\/g, "/");
const worker = (await import(new URL("../", import.meta.url).href + "src/worker.js")).default;

const db = new DatabaseSync(":memory:");
for (const m of ["0001_init", "0002_recuperar_senha", "0003_aceite_termos", "0004_avisos", "0005_portal", "0006_cobrancas", "0007_cupons", "0008_tabela_precos", "0009_cupom_preco", "0010_assistente", "0011_sentinela", "0012_faq_mais", "0013_eventos", "0014_faq_blog_eventos", "0015_regras_acesso", "0016_faq_estudio", "0017_lixeira", "0018_visual", "0019_aumentar_espaco", "0020_fotos_extras", "0021_bancos", "0022_contratos", "0023_copias", "0024_contrato_obrigatorio", "0025_senha_cliente", "0026_varias_pessoas"]) db.exec(readFileSync(RAIZ + "migrations/" + m + ".sql", "utf8"));

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
const apagados = [];
const emails = [];
globalThis.fetch = async (url, op) => {
  url = String(url);
  if (url.includes("api.resend.com")) { emails.push(JSON.parse(op.body)); return new Response("{}"); }
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
let r = await chamar("/api/eventos/salvar", { titulo: "Corrida", slug: "corrida", preco: "15" });
confere("sem portal não cria evento", r.status === 400, r);
await chamar("/api/portal/salvar", { nome: "Foto Rua", slug: "foto-rua", cor: "#0d9488" });
cookie = outro;
await chamar("/api/portal/salvar", { nome: "Outro", slug: "outro-estudio", cor: "#112233" });

cookie = dono;
r = await chamar("/api/eventos/salvar", { titulo: "Corrida de Goiânia 2026", slug: "corrida-goiania", tipo: "Corrida", data: "2026-11-15", local: "Parque", preco: "15,00",
  faixas: [{ a_partir: 10, preco: "8" }, { a_partir: 5, preco: "10,00" }, { a_partir: "", preco: "" }] });
const evId = r.dados.id;
confere("cria evento com preço e descontos", r.status === 200 && evId, r);
const ev = db.prepare("SELECT * FROM eventos WHERE id = ?").get(evId);
confere("descontos ordenados e em centavos", ev.preco_centavos === 1500 && ev.faixas === '[{"a_partir":5,"preco_centavos":1000},{"a_partir":10,"preco_centavos":800}]', ev.faixas);
r = await chamar("/api/eventos/salvar", { titulo: "Errado", slug: "errado", preco: "15", faixas: [{ a_partir: 5, preco: "20" }] });
confere("desconto mais caro que 1 foto é recusado", r.status === 400, r);
r = await chamar("/api/eventos/salvar", { titulo: "Sem segundo desconto", slug: "sem-segundo", preco: "12", faixas: [{ a_partir: 5, preco: "9" }, { a_partir: 10, preco: "" }] });
confere("linha de desconto sem preço é ignorada (formulário vem com 5 e 10)", r.status === 200 && db.prepare("SELECT faixas FROM eventos WHERE slug = 'sem-segundo'").get().faixas === '[{"a_partir":5,"preco_centavos":900}]', r);
db.prepare("DELETE FROM eventos WHERE slug = 'sem-segundo'").run();
cookie = outro;
r = await chamar("/api/eventos/salvar", { titulo: "Copia", slug: "corrida-goiania", preco: "10" });
confere("endereço repetido é recusado", r.status === 409, r);
r = await chamar("/api/eventos/salvar", { id: evId, titulo: "Roubo", slug: "roubo", preco: "1" });
confere("outro fotógrafo não edita o evento", r.status === 404, r);

// envio: original + prévia
async function enviarFoto(nome, numeros, quem) {
  cookie = quem || dono;
  const a = await chamar("/api/files/upload-url", { name: nome, size: 5000, evento_id: evId });
  await chamar("/api/files/complete", { id: a.dados.id });
  const b = await chamar("/api/files/upload-url", { name: "previa-" + nome, size: 5000, evento_id: evId });
  await chamar("/api/files/complete", { id: b.dados.id });
  const l = await chamar("/api/eventos/foto", { evento_id: evId, original_id: a.dados.id, previa_id: b.dados.id, numeros });
  return { a: a.dados.id, b: b.dados.id, l };
}
cookie = outro;
r = await chamar("/api/files/upload-url", { name: "x.jpg", size: 10, evento_id: evId });
confere("outro fotógrafo não envia para o evento", r.status === 404, r);
const f1 = await enviarFoto("IMG_001.jpg", "123, 45");
confere("liga original e prévia ao evento", f1.l.status === 200, f1.l);
for (let i = 2; i <= 12; i++) await enviarFoto("IMG_" + String(i).padStart(3, "0") + ".jpg", i === 2 ? "123" : "");
cookie = dono;
r = await chamar("/api/eventos/foto", { evento_id: evId, original_id: f1.a, previa_id: f1.a });
confere("não aceita original e prévia iguais", r.status === 400, r);
r = await chamar("/api/files");
confere("fotos do evento não aparecem em Meus arquivos", r.dados.arquivos.length === 0 && r.dados.usado_bytes === 12 * 2 * 5000, r.dados);

r = await chamar("/api/eventos");
confere("lista o evento com 12 fotos", r.dados.eventos[0].fotos === 12 && r.dados.portal.tem_pix === false, r.dados.eventos[0]);
r = await chamar("/api/eventos/fotos?id=" + evId);
confere("fotógrafo vê as prévias e os números", r.dados.total === 12 && r.dados.fotos[0].numeros === "123, 45" && /previa-IMG_001/.test(decodeURIComponent(r.dados.fotos[0].previa)), r.dados.fotos[0]);

// público
cookie = "";
r = await chamar("/api/e/info?slug=corrida-goiania");
confere("página pública mostra evento, estúdio e preços", r.status === 200 && r.dados.estudio === "Foto Rua" && r.dados.total_fotos === 12 && r.dados.faixas.length === 2 && r.dados.id === undefined, r.dados);
r = await chamar("/api/e/fotos?slug=corrida-goiania");
const fotoIds = r.dados.fotos.map(f => f.id);
confere("público recebe só prévias (nunca o original)", r.dados.total === 12 && r.dados.fotos.every(f => /previa-/.test(decodeURIComponent(f.previa))) && JSON.stringify(r.dados).indexOf('"IMG_0') < 0, r.dados.fotos[0]);
r = await chamar("/api/e/fotos?slug=corrida-goiania&numero=123");
confere("busca por número de peito", r.dados.total === 2, r.dados.total);
r = await chamar("/api/e/fotos?slug=corrida-goiania&numero=12");
confere("número parcial não mistura (12 ≠ 123)", r.dados.total === 0, r.dados.total);

r = await chamar("/api/e/pedido", { slug: "corrida-goiania", fotos: fotoIds.slice(0, 5), nome: "Ana", email: "ana@t.com" });
confere("sem PIX cadastrado não aceita pedido", r.status === 400 && /receber/.test(r.dados.error), r);
cookie = dono;
await chamar("/api/portal/pagamento", { instrucoes: "PIX: foto@t.com - Foto Rua" });
cookie = "";
r = await chamar("/api/e/pedido", { slug: "corrida-goiania", fotos: [fotoIds[0], 99999], nome: "Ana", email: "ana@t.com" });
confere("foto de fora do evento é recusada", r.status === 400, r);
emails.length = 0;
r = await chamar("/api/e/pedido", { slug: "corrida-goiania", fotos: fotoIds.slice(0, 5), nome: "Ana Lima", email: "ana@t.com", whatsapp: "(62) 99999-0000", valor_centavos: 1 });
const token = r.dados.token;
confere("5 fotos com desconto = 5 x R$ 10 (preço calculado no servidor)", r.status === 200 && r.dados.valor_centavos === 5000 && /^[0-9a-f]{48}$/.test(token), r.dados);
confere("e-mail para o fotógrafo e para o comprador", emails.some(e => e.to[0] === "foto@t.com" && /Novo pedido/.test(e.subject)) && emails.some(e => e.to[0] === "ana@t.com" && e.text.indexOf("?pedido=" + token) > -1), emails.map(e => e.to[0] + ": " + e.subject));
r = await chamar("/api/e/pedido", { slug: "corrida-goiania", fotos: fotoIds.slice(0, 10), nome: "Bia", email: "bia@t.com" });
confere("10 fotos = 10 x R$ 8", r.dados.valor_centavos === 8000, r.dados);
const tokenBia = r.dados.token;
r = await chamar("/api/e/pedido", { slug: "corrida-goiania", fotos: [fotoIds[11]], nome: "Caio", email: "caio@t.com" });
confere("1 foto = R$ 15", r.dados.valor_centavos === 1500, r.dados);

r = await chamar("/api/e/pedido?token=" + token);
confere("comprador vê o pedido pendente com o PIX", r.dados.pedido.status === "pendente" && /PIX/.test(r.dados.instrucoes_pagamento) && r.dados.fotos.length === 5, r.dados);
r = await chamar("/api/e/baixar?token=" + token + "&foto=" + fotoIds[0]);
confere("antes de pagar não baixa o original", r.status === 402, r);
r = await chamar("/api/e/pedido?token=" + "0".repeat(48));
confere("token errado não acha pedido", r.status === 404, r);

// fotógrafo confirma
cookie = outro;
let ped = db.prepare("SELECT id FROM evento_pedidos WHERE token = ?").get(token);
r = await chamar("/api/eventos/pedidos/status", { id: ped.id, status: "pago" });
confere("outro fotógrafo não confirma o pedido", r.status === 404, r);
cookie = dono;
r = await chamar("/api/eventos/pedidos?id=" + evId);
confere("fotógrafo vê os pedidos com os nomes dos arquivos", r.dados.pedidos.length === 3 && r.dados.pedidos.find(p => p.nome === "Ana Lima").arquivos.length === 5, r.dados.pedidos[0]);
emails.length = 0;
r = await chamar("/api/eventos/pedidos/status", { id: ped.id, status: "pago" });
confere("marca como pago e avisa o comprador", r.status === 200 && emails.length === 1 && emails[0].to[0] === "ana@t.com" && /liberadas/.test(emails[0].subject), emails.map(e => e.subject));
await chamar("/api/eventos/pedidos/status", { id: ped.id, status: "pago" });
confere("marcar de novo não manda outro e-mail", emails.length === 1, emails.length);

cookie = "";
r = await chamar("/api/e/baixar?token=" + token + "&foto=" + fotoIds[0]);
confere("pago: baixa o ORIGINAL", r.status === 200 && /IMG_00/.test(decodeURIComponent(r.dados.url)) && !/previa-/.test(decodeURIComponent(r.dados.url)) && /attachment/.test(decodeURIComponent(r.dados.url)), r.dados);
r = await chamar("/api/e/baixar?token=" + token + "&foto=" + fotoIds[8]);
confere("não baixa foto que não comprou", r.status === 404, r);
r = await chamar("/api/e/baixar?token=" + tokenBia + "&foto=" + fotoIds[0]);
confere("pedido de outra pessoa (pendente) não baixa", r.status === 402, r);
r = await chamar("/api/e/pedido?token=" + token);
confere("pedido pago não mostra mais o PIX", r.dados.pedido.status === "pago" && r.dados.instrucoes_pagamento === null, r.dados.pedido);

cookie = dono;
r = await chamar("/api/eventos");
confere("resumo: vendido e pendentes", r.dados.eventos[0].vendido === 5000 && r.dados.eventos[0].fotos_vendidas === 5 && r.dados.eventos[0].pendentes === 2, r.dados.eventos[0]);
r = await chamar("/api/eventos/fotos?id=" + evId);
confere("foto vendida mostra a contagem de vendas", r.dados.fotos.find(f => f.id === fotoIds[0]).vendas === 1, r.dados.fotos[0]);

// números, remover foto, fora do ar
r = await chamar("/api/eventos/foto/numeros", { id: fotoIds[5], numeros: "777 888" });
confere("salva números de uma foto", db.prepare("SELECT numeros FROM evento_fotos WHERE id = ?").get(fotoIds[5]).numeros === ",777,888,", r);
apagados.length = 0;
r = await chamar("/api/eventos/foto/remover", { id: fotoIds[11] });
confere("apagar foto remove original e prévia do B2", r.status === 200 && apagados.length === 2 && !db.prepare("SELECT 1 FROM evento_fotos WHERE id = ?").get(fotoIds[11]), apagados);
await chamar("/api/eventos/salvar", { id: evId, titulo: "Corrida de Goiânia 2026", slug: "corrida-goiania", preco: "15", publicado: false });
cookie = "";
r = await chamar("/api/e/info?slug=corrida-goiania");
confere("evento fora do ar some do público", r.status === 404, r);
r = await chamar("/api/e/pedido", { slug: "corrida-goiania", fotos: [fotoIds[0]], nome: "Zé", email: "ze@t.com" });
confere("evento fora do ar não recebe pedido", r.status === 404, r);
r = await chamar("/api/e/pedido?token=" + token);
confere("quem já comprou continua baixando com o evento fora do ar", r.status === 200, r);

// limite de pedidos por IP
cookie = dono;
await chamar("/api/eventos/salvar", { id: evId, titulo: "Corrida de Goiânia 2026", slug: "corrida-goiania", preco: "15", publicado: true });
cookie = "";
let bloqueado = false;
for (let i = 0; i < 9; i++) { const x = await chamar("/api/e/pedido", { slug: "corrida-goiania", fotos: [fotoIds[1]], nome: "Spam", email: "s@t.com" }); if (x.status === 429) bloqueado = true; }
confere("no máximo 10 pedidos por hora por conexão", bloqueado, "");

// apagar evento inteiro
cookie = dono;
apagados.length = 0;
let resta = 1, voltas = 0;
while (resta && voltas < 10) { r = await chamar("/api/eventos/remover", { id: evId }); resta = r.dados.restantes; voltas++; }
confere("apagar evento remove tudo do B2 e do banco", apagados.length === 22 && !db.prepare("SELECT 1 FROM eventos WHERE id = ?").get(evId) &&
  db.prepare("SELECT COUNT(*) n FROM files WHERE evento_id = ?").get(evId).n === 0 && db.prepare("SELECT COUNT(*) n FROM evento_pedidos").get().n === 0, { apagados: apagados.length, voltas });
cookie = "";
r = await chamar("/api/e/pedido?token=" + token);
confere("depois de apagar, o link do pedido para de funcionar", r.status === 404, r);

console.log(falhas ? "\n" + falhas + " FALHA(S)" : "\nTODOS OS TESTES PASSARAM");
process.exit(falhas ? 1 : 0);
