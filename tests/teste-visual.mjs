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


let r;
db.exec("PRAGMA foreign_keys = ON");
Object.assign(env, { B2_ENDPOINT: "s3.us-east-005.backblazeb2.com", B2_BUCKET: "balde", B2_KEY_ID: "005abc", B2_APP_KEY: "K005xyz", RESEND_API_KEY: "re_x" });
const apagados = [], emails = [];
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
const { purgarLixeira } = await import(new URL("../", import.meta.url).href + "src/lixeira.js");
const reg = async (email) => { cookie = ""; await chamar("/api/register", { email, senha: "senha-forte-1", nome: email.split("@")[0], aceite: true }); return cookie; };
const dono = await reg("foto@t.com");
const outro = await reg("outro@t.com");
db.prepare("INSERT INTO subscriptions (user_id, quota_gb, status, paid_until) VALUES (1, 10, 'active', datetime('now','+30 days')), (2, 10, 'active', datetime('now','+30 days'))").run();
async function especial(uso, quem) {
  cookie = quem || dono;
  const o = await chamar("/api/files/upload-url", { name: uso + ".jpg", size: 5000, uso: uso });
  await chamar("/api/files/complete", { id: o.dados.id });
  return o.dados.id;
}
cookie = dono;
await chamar("/api/portal/salvar", { nome: "Luz", slug: "luz", cor: "#0d9488", tema: "classico" });

// logo, bio, nota fiscal e link de pagamento
const logo = await especial("logo");
r = await chamar("/api/files");
confere("logo não aparece em Meus arquivos (mas conta na cota)", r.dados.arquivos.length === 0 && r.dados.usado_bytes === 5000, r.dados);
const logoOutro = await especial("logo", outro);
cookie = dono;
r = await chamar("/api/portal/marca", { logo_file_id: logoOutro });
confere("não aceita a logo de outra pessoa", r.status === 400, r);
r = await chamar("/api/portal/marca", { logo_file_id: logo, bio: "Fotógrafo em Goiânia", emite_nota: true, link_pagamento: "https://link.mercadopago.com.br/luz" });
confere("salva logo, bio, nota fiscal e link", r.status === 200, r);
r = await chamar("/api/portal/marca", { link_pagamento: "javascript:alert(1)" });
confere("link de pagamento precisa ser https", r.status === 400, r);
r = await chamar("/api/portal");
confere("o fotógrafo vê a logo e as opções salvas", r.dados.portal.logo_url && r.dados.portal.bio === "Fotógrafo em Goiânia" && r.dados.portal.emite_nota === 1 && /mercadopago/.test(r.dados.portal.link_pagamento), r.dados.portal);
cookie = "";
r = await chamar("/api/p/info?slug=luz");
confere("página de entrada do cliente mostra a logo e a bio", r.dados.logo && r.dados.bio && r.dados.logo_file_id === undefined, r.dados);

// layout por cliente
cookie = dono;
const ana = (await chamar("/api/portal/clientes/novo", { nome: "Ana", email: "ana@t.com", senha: "senha-cliente-1", tema: "escuro" })).dados.id;
const bia = (await chamar("/api/portal/clientes/novo", { nome: "Bia", email: "bia@t.com", senha: "senha-cliente-2", tema: "hackeado" })).dados.id;
confere("cliente nasce com o layout escolhido (inválido = o do estúdio)", db.prepare("SELECT tema FROM portal_clientes WHERE id = ?").get(ana).tema === "escuro" && db.prepare("SELECT tema FROM portal_clientes WHERE id = ?").get(bia).tema === null, "");
const alb = (await chamar("/api/portal/albuns/novo", { cliente_id: ana, titulo: "Casamento", tipo: "Casamento" })).dados.id;
const capa = await especial("capa");
cookie = dono;
r = await chamar("/api/portal/albuns/visual", { id: alb, descricao: "Escolham 60 fotos!", capa_file_id: capa });
confere("salva recado e capa do álbum", r.status === 200 && db.prepare("SELECT capa_file_id, descricao FROM albuns WHERE id = ?").get(alb).capa_file_id === capa, r);
cookie = outro;
await chamar("/api/portal/salvar", { nome: "Outro", slug: "outro-x", cor: "#112233" });
r = await chamar("/api/portal/albuns/visual", { id: alb, descricao: "hack" });
confere("outro fotógrafo não muda o álbum", r.status === 404, r);
r = await chamar("/api/portal/clientes/visual", { cliente_id: ana, tema: "delicado" });
confere("outro fotógrafo não muda o layout do cliente", r.status === 404, r);

cookie = "";
await chamar("/api/p/login", { slug: "luz", email: "ana@t.com", senha: "senha-cliente-1" });
r = await chamar("/api/p/me");
confere("Ana vê o layout dela, a logo, a bio e a capa escolhida", r.dados.portal.tema === "escuro" && r.dados.portal.logo && r.dados.portal.bio && /capa\.jpg/.test(decodeURIComponent(r.dados.albuns[0].capa)) && r.dados.albuns[0].descricao === "Escolham 60 fotos!", r.dados);
r = await chamar("/api/p/album?id=" + alb);
confere("álbum aberto traz o recado", r.dados.album.descricao === "Escolham 60 fotos!", r.dados.album);
cookie = "";
await chamar("/api/p/login", { slug: "luz", email: "bia@t.com", senha: "senha-cliente-2" });
r = await chamar("/api/p/me");
confere("Bia (sem layout próprio) usa o do estúdio", r.dados.portal.tema === "classico", r.dados.portal);
cookie = dono;
await chamar("/api/portal/clientes/visual", { cliente_id: bia, tema: "minimalista" });
cookie = "";
await chamar("/api/p/login", { slug: "luz", email: "bia@t.com", senha: "senha-cliente-2" });
r = await chamar("/api/p/me");
confere("trocar o layout de um cliente vale na hora", r.dados.portal.tema === "minimalista", r.dados.portal);
cookie = dono;
for (const tm of ["casamento", "quinze", "infantil", "festa"]) await chamar("/api/portal/clientes/visual", { cliente_id: bia, tema: tm });
confere("aceita os layouts temáticos (casamento, 15 anos, infantil, festa)", db.prepare("SELECT tema FROM portal_clientes WHERE id = ?").get(bia).tema === "festa", "");

// evento: layout, texto, capa, nota fiscal e link de pagamento
cookie = dono;
await chamar("/api/portal/pagamento", { instrucoes: "PIX luz@t.com" });
const ev = (await chamar("/api/eventos/salvar", { titulo: "Corrida", slug: "corrida", preco: "10", tema: "delicado", descricao: "Procure seu número!" })).dados.id;
r = await chamar("/api/eventos");
confere("evento salva layout e texto", r.dados.eventos[0].tema === "delicado" && r.dados.eventos[0].descricao === "Procure seu número!", r.dados.eventos[0]);
const o1 = (await chamar("/api/files/upload-url", { name: "R1.jpg", size: 5000, evento_id: ev })).dados.id; await chamar("/api/files/complete", { id: o1 });
const p1 = (await chamar("/api/files/upload-url", { name: "previa-R1.jpg", size: 5000, evento_id: ev })).dados.id; await chamar("/api/files/complete", { id: p1 });
const foto = (await chamar("/api/eventos/foto", { evento_id: ev, original_id: o1, previa_id: p1 })).dados.id;
cookie = "";
r = await chamar("/api/e/info?slug=corrida");
confere("sem capa escolhida, a capa é a prévia (com marca) da 1ª foto", /previa-R1/.test(decodeURIComponent(r.dados.capa)) && r.dados.tema === "delicado" && r.dados.logo && r.dados.emite_nota === true && r.dados.descricao === "Procure seu número!", r.dados);
const capaEv = await especial("capa");
cookie = dono;
r = await chamar("/api/eventos/capa", { id: ev, capa_file_id: capaEv });
cookie = "";
r = await chamar("/api/e/info?slug=corrida");
confere("com capa escolhida, usa a capa", /capa\.jpg/.test(decodeURIComponent(r.dados.capa)), r.dados.capa);
r = await chamar("/api/e/pedido", { slug: "corrida", fotos: [foto], nome: "Zé", email: "ze@t.com", nota_doc: "123" });
confere("CPF/CNPJ inválido é recusado", r.status === 400 && /CPF/.test(r.dados.error), r);
emails.length = 0;
r = await chamar("/api/e/pedido", { slug: "corrida", fotos: [foto], nome: "Zé", email: "ze@t.com", nota_doc: "123.456.789-09" });
const tok = r.dados.token;
confere("pedido com nota fiscal guarda o CPF e avisa o fotógrafo", r.status === 200 && db.prepare("SELECT nota_doc FROM evento_pedidos WHERE token = ?").get(tok).nota_doc === "12345678909" && emails.some(e => /nota fiscal/.test(e.text)), r);
r = await chamar("/api/e/pedido?token=" + tok);
confere("página do pedido mostra o link de pagamento do fotógrafo", /mercadopago/.test(r.dados.link_pagamento) && r.dados.evento.tema === "delicado" && r.dados.evento.logo, r.dados);
cookie = dono;
r = await chamar("/api/eventos/pedidos?id=" + ev);
confere("o fotógrafo vê o pedido de nota fiscal", r.dados.pedidos[0].nota_doc === "12345678909", r.dados.pedidos[0]);
await chamar("/api/portal/marca", { emite_nota: false });
cookie = "";
r = await chamar("/api/e/pedido", { slug: "corrida", fotos: [foto], nome: "Zé", email: "ze@t.com", nota_doc: "12345678909" });
confere("se o fotógrafo não emite nota, o CPF não é guardado", db.prepare("SELECT nota_doc FROM evento_pedidos WHERE token = ?").get(r.dados.token).nota_doc === null, "");

// lixeira leva a capa junto
cookie = dono;
await chamar("/api/portal/lixeira", { tipo: "album", id: alb });
db.prepare("UPDATE albuns SET removido_em = datetime('now', '-31 minutes')").run();
await chamar("/api/eventos/lixeira", { id: ev });
db.prepare("UPDATE eventos SET removido_em = datetime('now', '-31 minutes')").run();
apagados.length = 0;
await purgarLixeira(env);
confere("ao apagar de vez, a capa do álbum e a do evento também saem do B2", !db.prepare("SELECT 1 FROM files WHERE id IN (?, ?)").get(capa, capaEv) && apagados.length === 4, apagados);
confere("a logo continua (é do estúdio)", db.prepare("SELECT 1 FROM files WHERE id = ?").get(logo), "");

console.log(falhas ? "\n" + falhas + " FALHA(S)" : "\nTODOS OS TESTES PASSARAM");
process.exit(falhas ? 1 : 0);
