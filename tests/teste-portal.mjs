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

cookie = dono;
let r = await chamar("/api/portal/salvar", { nome: "Estúdio Aurora", slug: "estudio-aurora", cor: "#be185d" });
confere("sem plano não cria portal", r.status === 403, r);
db.prepare("INSERT INTO subscriptions (user_id, quota_gb, status, paid_until) VALUES (1, 10, 'active', datetime('now','+30 days')), (2, 10, 'active', datetime('now','+30 days'))").run();
r = await chamar("/api/portal/salvar", { nome: "Estúdio Aurora", slug: "Estudio Aurora!", cor: "#be185d" });
confere("endereço inválido recusado", r.status === 400, r);
r = await chamar("/api/portal/salvar", { nome: "Estúdio Aurora", slug: "estudio-aurora", cor: "#be185d" });
confere("cria o portal", r.status === 200, r);
cookie = outro;
r = await chamar("/api/portal/salvar", { nome: "Outro", slug: "estudio-aurora", cor: "#000000" });
confere("endereço repetido de outro dono: 409", r.status === 409, r);
await chamar("/api/portal/salvar", { nome: "Outro Estúdio", slug: "outro-estudio", cor: "#000000" });
await chamar("/api/portal/clientes/novo", { nome: "Cliente do Outro", email: "x@t.com", senha: "senha-cliente-9" });

cookie = dono;
r = await chamar("/api/portal/clientes/novo", { nome: "Ana e Pedro", email: "Ana@T.com", senha: "senha-cliente-1" });
confere("cria cliente", r.status === 200, r);
r = await chamar("/api/portal/clientes/novo", { nome: "Ana 2", email: "ana@t.com", senha: "senha-cliente-1" });
confere("e-mail repetido no mesmo portal: 409", r.status === 409, r);
r = await chamar("/api/portal/albuns/novo", { cliente_id: 1, titulo: "Roubado", tipo: "Casamento" });
const idAnaCliente = db.prepare("SELECT id FROM portal_clientes WHERE email='ana@t.com'").get().id;
const idOutroCliente = db.prepare("SELECT id FROM portal_clientes WHERE email='x@t.com'").get().id;
db.prepare("DELETE FROM albuns").run();
r = await chamar("/api/portal/albuns/novo", { cliente_id: idOutroCliente, titulo: "Roubado", tipo: "Casamento" });
confere("não cria álbum para cliente de outro portal", r.status === 400, r);
r = await chamar("/api/portal/albuns/novo", { cliente_id: idAnaCliente, titulo: "Casamento Ana & Pedro", tipo: "Casamento" });
const albumId = r.dados.id;
confere("cria álbum", r.status === 200 && albumId > 0, r);

cookie = outro;
r = await chamar("/api/files/upload-url", { name: "x.jpg", size: 5000, album_id: albumId });
confere("outro dono não envia para o meu álbum", r.status === 404, r);
cookie = dono;
r = await chamar("/api/files/upload-url", { name: "foto1.jpg", size: 5000, album_id: albumId });
confere("envio para o álbum gera link", r.status === 200 && r.dados.url, r);
await chamar("/api/files/complete", { id: r.dados.id });
await chamar("/api/files/complete", { id: (await chamar("/api/files/upload-url", { name: "video.mp4", size: 5000, album_id: albumId })).dados.id });
await chamar("/api/files/complete", { id: (await chamar("/api/files/upload-url", { name: "solto.pdf", size: 5000 })).dados.id });
confere("arquivos do álbum ficam prontos", db.prepare("SELECT COUNT(*) n FROM files WHERE album_id = ? AND status='ready'").get(albumId).n === 2, "");
r = await chamar("/api/files");
confere("'Meus arquivos' mostra só o solto, mas conta tudo", r.dados.arquivos.length === 1 && r.dados.usado_bytes === 15000, r.dados);

// cliente final
cookie = "";
r = await chamar("/api/p/info?slug=estudio-aurora");
confere("info pública do portal", r.dados.nome === "Estúdio Aurora" && r.dados.cor === "#be185d", r);
r = await chamar("/api/p/login", { slug: "estudio-aurora", email: "ana@t.com", senha: "errada-123" });
confere("senha errada: 401", r.status === 401, r);
r = await chamar("/api/p/login", { slug: "outro-estudio", email: "ana@t.com", senha: "senha-cliente-1" });
confere("login no portal errado: 401", r.status === 401, r);
r = await chamar("/api/p/login", { slug: "estudio-aurora", email: "ana@t.com", senha: "senha-cliente-1" });
const cli = cookie;
confere("login certo", r.status === 200 && /^portal_sessao=/.test(cli), cli);
r = await chamar("/api/p/me");
confere("vê o próprio álbum", r.dados.albuns.length === 1 && r.dados.portal.slug === "estudio-aurora", r.dados);
r = await chamar("/api/p/album?id=" + albumId);
const foto = r.dados.arquivos.find(f => f.nome === "foto1.jpg"), video = r.dados.arquivos.find(f => f.nome === "video.mp4");
confere("foto tem prévia, vídeo não", foto.previa && foto.previa.includes("inline") && !video.previa && video.tipo === "video", r.dados.arquivos);
r = await chamar("/api/p/favorito", { file_id: foto.id, favorito: true });
confere("marca favorita", r.status === 200, r);
r = await chamar("/api/p/baixar?id=" + foto.id);
confere("baixar gera link attachment", r.dados.url && r.dados.url.includes("attachment"), r);
const solto = db.prepare("SELECT id FROM files WHERE name='solto.pdf'").get().id;
r = await chamar("/api/p/baixar?id=" + solto);
confere("não baixa arquivo solto do fotógrafo", r.status === 404, r);
r = await chamar("/api/p/favorito", { file_id: solto, favorito: true });
confere("não marca arquivo fora dos álbuns dele", r.status === 404, r);
r = await chamar("/api/files");
confere("sessão do cliente não acessa área do fotógrafo", r.status === 401, r);

// cliente de outro portal
cookie = "";
await chamar("/api/p/login", { slug: "outro-estudio", email: "x@t.com", senha: "senha-cliente-9" });
r = await chamar("/api/p/album?id=" + albumId);
confere("cliente de outro portal não vê meu álbum", r.status === 404, r);
r = await chamar("/api/p/baixar?id=" + foto.id);
confere("cliente de outro portal não baixa minha foto", r.status === 404, r);

// fotógrafo vê favoritas e gerencia
cookie = dono;
r = await chamar("/api/portal/albuns");
confere("fotógrafo vê 1 favorita no álbum", r.dados.albuns[0].favoritas === 1 && r.dados.albuns[0].arquivos === 2, r.dados);
r = await chamar("/api/portal/album?id=" + albumId + "&favoritas=1");
confere("lista de favoritas com o nome", r.dados.favoritas.length === 1 && r.dados.favoritas[0] === "foto1.jpg", r.dados);
cookie = outro;
r = await chamar("/api/portal/album?id=" + albumId);
confere("outro fotógrafo não abre meu álbum", r.status === 404, r);
cookie = dono;
r = await chamar("/api/portal/clientes/remover", { cliente_id: idAnaCliente });
confere("não remove cliente com álbum", r.status === 400, r);
await chamar("/api/portal/clientes/senha", { cliente_id: idAnaCliente, senha: "nova-senha-123" });
cookie = cli;
r = await chamar("/api/p/me");
confere("trocar senha derruba a sessão do cliente", r.status === 401, r);
cookie = dono;
r = await chamar("/api/portal/albuns/remover", { id: albumId });
confere("apagar álbum apaga as fotos no B2 e no banco",
  r.dados.restantes === 0 && apagados.length === 2 && db.prepare("SELECT COUNT(*) n FROM albuns").get().n === 0 && db.prepare("SELECT COUNT(*) n FROM favoritos").get().n === 0,
  { r, apagados });
r = await chamar("/api/portal/clientes/remover", { cliente_id: idAnaCliente });
confere("agora remove o cliente", r.status === 200, r);

// página do cliente final
const pg = await worker.fetch(new Request(BASE + "/p/estudio-aurora"), Object.assign({}, env, { ASSETS: { fetch: (req) => new Response("pagina:" + new URL(req.url).pathname) } }));
confere("/p/<endereço> abre a página do portal", (await pg.text()) === "pagina:/portal-cliente", "");

// apagar arquivo solto com favorito ligado (chave estrangeira) não quebra
db.prepare("DELETE FROM files WHERE name='solto.pdf'").run();

console.log(falhas ? "\n" + falhas + " FALHA(S)" : "\nTODOS OS TESTES PASSARAM");
process.exit(falhas ? 1 : 0);
