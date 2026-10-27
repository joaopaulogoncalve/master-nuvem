import { fileURLToPath } from "node:url";
// Teste local do fluxo checkout -> webhook, com banco SQLite em memória e Mercado Pago simulado.
import { DatabaseSync } from "node:sqlite";
import { readFileSync } from "node:fs";
import { createHmac, createHash } from "node:crypto";

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


const { preencher, MODELOS } = await import(new URL("../", import.meta.url).href + "src/contratos-modelos.js");
Object.assign(env, { B2_ENDPOINT: "s3.us-east-005.backblazeb2.com", B2_BUCKET: "balde", B2_KEY_ID: "005abc", B2_APP_KEY: "K005xyz", RESEND_API_KEY: "re_teste" });
const emails = [];
globalThis.fetch = async (url, op) => {
  url = String(url);
  if (url.includes("api.resend.com")) { emails.push(JSON.parse(op.body)); return new Response("{}"); }
  if (url.includes("backblazeb2.com")) return new Response(null, { status: 200, headers: { "Content-Length": "5000" } });
  throw new Error("fetch inesperado " + url);
};
cookie = "";
await chamar("/api/register", { email: "foto@t.com", senha: "senha-forte-1", nome: "Fotógrafa", aceite: true });
const dono = cookie;
db.prepare("INSERT INTO subscriptions (user_id, quota_gb, status, paid_until) VALUES (1, 10, 'active', datetime('now','+30 days'))").run();
await chamar("/api/portal/salvar", { nome: "Estúdio Luz", slug: "estudio-luz", cor: "#0d9488", tema: "classico" });
await chamar("/api/portal/clientes/novo", { nome: "Ana Souza", email: "ana@t.com", senha: "senha-cliente-1" });
const cliId = db.prepare("SELECT id FROM portal_clientes").get().id;
let r = await chamar("/api/portal/albuns/novo", { cliente_id: cliId, titulo: "Casamento", tipo: "Casamento" });
const albId = r.dados.id;
const fotos = [];
for (const n of ["A1.jpg", "A2.jpg", "A3.jpg"]) {
  const o = await chamar("/api/files/upload-url", { name: n, size: 5000, album_id: albId });
  await chamar("/api/files/complete", { id: o.dados.id });
  fotos.push(o.dados.id);
}

// contrato obrigatório
r = await chamar("/api/contratos/novo", { titulo: "Casamento - Ana", texto: preencher(MODELOS[0].texto, { cliente_nome: "Ana Souza" }), destinatario_nome: "Ana Souza", destinatario_email: "ana@t.com", cliente_id: cliId, album_id: albId, obrigatorio: true });
confere("cria contrato obrigatório ligado ao cliente", r.status === 200 && db.prepare("SELECT obrigatorio FROM contratos").get().obrigatorio === 1, r);
const t = r.dados.link.split("/c/")[1];
cookie = "";
await chamar("/api/p/login", { slug: "estudio-luz", email: "ana@t.com", senha: "senha-cliente-1" });
const cli = cookie;
r = await chamar("/api/p/me");
confere("no primeiro acesso o cliente vê o contrato para assinar", r.dados.contratos_pendentes.length === 1 && r.dados.contratos_pendentes[0].obrigatorio && r.dados.contratos_pendentes[0].link === "/c/" + t, r.dados.contratos_pendentes);
r = await chamar("/api/p/album?id=" + albId);
confere("álbum fica fechado até assinar", r.status === 403 && r.dados.contrato, r);
r = await chamar("/api/p/baixar?id=" + fotos[0]);
confere("download também fica fechado", r.status === 403 && r.dados.contrato, r);
// assina
db.prepare("UPDATE contrato_assinantes SET codigo_hash = ?, codigo_expira = datetime('now','+10 minutes') WHERE id = 1").run(createHash("sha256").update("1:123456").digest("hex"));
r = await chamar("/api/c/assinar", { t, nome: "Ana Souza", cpf: "529.982.247-25", codigo: "123456" });
confere("assina e o comprovante traz o link de volta para os álbuns", r.status === 200 && r.dados.portal === "/p/estudio-luz", r.dados);
r = await chamar("/api/p/album?id=" + albId);
confere("depois de assinar, o álbum abre", r.status === 200, r.status);
r = await chamar("/api/p/me");
confere("e o aviso de contrato some", r.dados.contratos_pendentes.length === 0, r.dados.contratos_pendentes);

// limite de fotos para edição
cookie = dono;
r = await chamar("/api/portal/albuns/regras", { id: albId, pode_editar: true, limite_edicao: "2" });
confere("salva o limite de 2 fotos para editar", r.status === 200 && db.prepare("SELECT limite_edicao FROM albuns WHERE id = ?").get(albId).limite_edicao === 2, r);
cookie = cli;
await chamar("/api/p/edicao", { file_id: fotos[0], comentario: "clarear o rosto" });
r = await chamar("/api/p/edicao", { file_id: fotos[0], comentario: "tirar o fio do fundo" });
confere("pedir de novo a mesma foto não gasta o limite", r.status === 200, r);
await chamar("/api/p/edicao", { file_id: fotos[1], comentario: "deixar preto e branco" });
r = await chamar("/api/p/edicao", { file_id: fotos[2], comentario: "recortar" });
confere("3ª foto diferente passa do limite e é recusada", r.status === 400 && /2 foto/.test(r.dados.error), r);
r = await chamar("/api/p/album?id=" + albId);
confere("cliente vê quantas fotos já mandou editar", r.dados.fotos_editadas_pedidas === 2 && r.dados.regras.limite_edicao === 2, r.dados);

// fotos a mais: fotógrafo recebe e-mail
cookie = dono;
db.prepare("UPDATE portais SET instrucoes_pagamento = 'PIX: foto@t.com'").run();
await chamar("/api/portal/albuns/regras", { id: albId, max_fotos: "1", preco_extra: "10" });
cookie = cli;
emails.length = 0;
r = await chamar("/api/p/fotos-extras", { album_id: albId, qtd: 2 });
confere("fotógrafo recebe e-mail quando o cliente pede fotos a mais", r.status === 200 && emails.some(e => e.to[0] === "foto@t.com" && /pediu 2 foto/.test(e.subject)), emails.map(e => e.to[0] + ": " + e.subject));

// e-mail de boas-vindas: link "Criar minha senha" (a senha não vai no e-mail)
cookie = dono;
emails.length = 0;
r = await chamar("/api/portal/clientes/novo", { nome: "Bia Lima", email: "bia@t.com", senha: "senha-do-foto-1" });
const boas = emails.find(e => e.to[0] === "bia@t.com");
confere("cliente novo recebe e-mail com o botão Criar minha senha", r.dados.email_enviado && boas && /convite=[0-9a-f]{48}/.test(boas.html) && !boas.html.includes("senha-do-foto-1"), boas && boas.subject);
const conv = boas.html.match(/convite=([0-9a-f]{48})/)[1];
cookie = "";
r = await chamar("/api/p/convite", { slug: "estudio-luz", t: "0".repeat(48) });
confere("link de convite errado é recusado", r.status === 400, r);
r = await chamar("/api/p/convite", { slug: "estudio-luz", t: conv });
confere("link certo mostra o nome e o login", r.status === 200 && r.dados.email === "bia@t.com", r.dados);
r = await chamar("/api/p/convite", { slug: "estudio-luz", t: conv, senha: "minha-senha-bia" });
confere("cliente cria a senha e já entra", r.status === 200 && cookie.startsWith("portal_sessao="), r);
r = await chamar("/api/p/me");
confere("está logado como a Bia", r.status === 200 && r.dados.nome === "Bia Lima", r.dados.nome);
r = await chamar("/api/p/convite", { slug: "estudio-luz", t: conv, senha: "outra-senha-123" });
confere("o link só vale uma vez", r.status === 400, r);
cookie = "";
r = await chamar("/api/p/login", { slug: "estudio-luz", email: "bia@t.com", senha: "minha-senha-bia" });
confere("entra com a senha que ela criou", r.status === 200, r);
r = await chamar("/api/p/login", { slug: "estudio-luz", email: "bia@t.com", senha: "senha-do-foto-1" });
confere("a senha antiga do fotógrafo deixa de valer", r.status === 401, r.status);
cookie = dono;
const biaId = db.prepare("SELECT id FROM portal_clientes WHERE email = 'bia@t.com'").get().id;
emails.length = 0;
r = await chamar("/api/portal/clientes/convite", { cliente_id: biaId });
confere("fotógrafo pode reenviar o acesso por e-mail", r.status === 200 && emails.some(e => e.to[0] === "bia@t.com"), r);
r = await chamar("/api/portal/clientes/novo", { nome: "Caio", email: "caio@t.com", senha: "senha-do-foto-2", enviar_acesso: false });
confere("dá para criar sem mandar e-mail", r.status === 200 && r.dados.email_enviado === false, r.dados);

// primeiro acesso com a senha do fotógrafo: pede para criar a própria; depois dá para trocar
cookie = "";
await chamar("/api/p/login", { slug: "estudio-luz", email: "caio@t.com", senha: "senha-do-foto-2" });
r = await chamar("/api/p/me");
confere("entrou com a senha do fotógrafo: o portal pede para criar a dele", r.dados.precisa_senha === true, r.dados.precisa_senha);
r = await chamar("/api/p/senha", { nova: "curta" });
confere("senha curta é recusada", r.status === 400, r);
r = await chamar("/api/p/senha", { nova: "senha-do-caio-1" });
confere("cria a própria senha sem precisar da atual", r.status === 200, r);
r = await chamar("/api/p/me");
confere("depois disso não pede mais", r.dados.precisa_senha === false, r.dados.precisa_senha);
r = await chamar("/api/p/senha", { atual: "errada-123", nova: "senha-do-caio-2" });
confere("para trocar de novo precisa da senha atual", r.status === 400, r);
r = await chamar("/api/p/senha", { atual: "senha-do-caio-1", nova: "senha-do-caio-2" });
confere("troca a senha com a atual certa", r.status === 200, r);
r = await chamar("/api/p/me");
confere("continua logado neste aparelho depois de trocar", r.status === 200, r.status);
cookie = "";
r = await chamar("/api/p/login", { slug: "estudio-luz", email: "caio@t.com", senha: "senha-do-caio-2" });
confere("entra com a senha nova", r.status === 200, r);
cookie = dono;
const caioId = db.prepare("SELECT id FROM portal_clientes WHERE email = 'caio@t.com'").get().id;
await chamar("/api/portal/clientes/senha", { cliente_id: caioId, senha: "senha-nova-foto" });
confere("senha nova dada pelo fotógrafo volta a pedir a troca no próximo acesso", db.prepare("SELECT senha_propria FROM portal_clientes WHERE id = ?").get(caioId).senha_propria === 0, "");

console.log(falhas ? "\n" + falhas + " FALHA(S)" : "\nTODOS OS TESTES PASSARAM");
process.exit(falhas ? 1 : 0);
