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
const f1 = await enviar("A001.jpg", true);
const f2 = await enviar("A002.jpg", true);
const f3 = await enviar("A003.jpg", false);
r = await chamar("/api/portal/previa", { original_id: f1.o, previa_id: f2.o });
confere("só liga prévia de verdade (arquivo marcado como prévia)", r.status === 400, r);
cookie = outro;
r = await chamar("/api/portal/previa", { original_id: f1.o, previa_id: f1.p });
confere("outro fotógrafo não mexe nas prévias", r.status !== 200, r);
cookie = dono;
r = await chamar("/api/portal/albuns");
confere("álbum conta 3 fotos (prévias não contam como foto)", r.dados.albuns[0].arquivos === 3, r.dados.albuns[0]);
r = await chamar("/api/files");
confere("prévias e fotos do álbum não aparecem em Meus arquivos, mas contam na cota", r.dados.arquivos.length === 0 && r.dados.usado_bytes === 5 * 5000, r.dados);

// cliente entra
cookie = "";
await chamar("/api/p/login", { slug: "estudio-luz", email: "ana@t.com", senha: "senha-cliente-1" });
const cli = cookie;
r = await chamar("/api/p/me");
confere("lista de álbuns traz capa, regras e layout", r.dados.albuns[0].capa && /previa-A001/.test(decodeURIComponent(r.dados.albuns[0].capa)) && r.dados.albuns[0].regras.pode_baixar === true && r.dados.portal.tema === "escuro", r.dados.albuns[0]);
r = await chamar("/api/p/album?id=" + albId);
const porNome = (n) => r.dados.arquivos.find(f => f.nome === n);
confere("cliente vê a prévia leve, não o original", /previa-A001/.test(decodeURIComponent(porNome("A001.jpg").previa)) && r.dados.total === 3, r.dados.arquivos.map(f => f.nome));
confere("foto antiga sem prévia usa o original", /A003\.jpg/.test(decodeURIComponent(porNome("A003.jpg").previa)), "");
confere("padrão: tudo liberado, sem prazo", r.dados.regras.pode_baixar && r.dados.regras.pode_escolher && !r.dados.regras.pode_editar && !r.dados.regras.acesso_ate, r.dados.regras);
r = await chamar("/api/p/baixar?id=" + f1.p);
confere("cliente não baixa a prévia como se fosse foto", r.status === 404, r);
r = await chamar("/api/p/baixar?id=" + f1.o);
confere("baixa o original", r.status === 200 && /A001\.jpg/.test(decodeURIComponent(r.dados.url)) && /attachment/.test(decodeURIComponent(r.dados.url)), r.dados);

// fotógrafo define regras
cookie = dono;
r = await chamar("/api/portal/albuns/regras", { id: albId, prazo_dias: "3", max_downloads: "2", pode_baixar: true, pode_escolher: true, limite_escolha: "1", pode_editar: true });
const alb = db.prepare("SELECT * FROM albuns WHERE id = ?").get(albId);
confere("salva prazo de 3 dias, 2 downloads, escolher 1 e pedir edição", r.status === 200 && alb.max_downloads === 2 && alb.limite_escolha === 1 && alb.pode_editar === 1 && alb.acesso_ate > new Date(Date.now() + 2.9 * 86400000).toISOString().replace("T", " ").slice(0, 19), alb);
r = await chamar("/api/portal/albuns/regras", { id: albId, max_downloads: "0" });
confere("downloads inválidos são recusados", r.status === 400, r);
cookie = outro;
r = await chamar("/api/portal/albuns/regras", { id: albId, pode_baixar: false });
confere("outro fotógrafo não muda as regras", r.status >= 400 && db.prepare("SELECT pode_baixar FROM albuns WHERE id = ?").get(albId).pode_baixar === 1, r);

cookie = cli;
r = await chamar("/api/p/album?id=" + albId);
confere("cliente recebe as regras e quantas já escolheu", r.dados.regras.max_downloads === 2 && r.dados.regras.limite_escolha === 1 && r.dados.regras.acesso_ate && r.dados.escolhidas === 0, r.dados.regras);
r = await chamar("/api/p/baixar?id=" + f1.o);
confere("2º download da foto (já baixou 1x antes)", r.status === 200, r);
r = await chamar("/api/p/baixar?id=" + f1.o);
confere("3º download passa do limite de 2", r.status === 429 && /2 vez/.test(r.dados.error), r);
r = await chamar("/api/p/baixar?id=" + f2.o);
confere("o limite é por foto (outra foto baixa)", r.status === 200, r);
r = await chamar("/api/p/album?id=" + albId);
confere("tela sabe quantas vezes cada foto foi baixada", r.dados.arquivos.find(f => f.id === f1.o).baixados === 2, "");

r = await chamar("/api/p/favorito", { file_id: f1.o, favorito: true });
confere("escolhe 1 foto", r.status === 200, r);
r = await chamar("/api/p/favorito", { file_id: f2.o, favorito: true });
confere("passa do limite de escolha: recusa com explicação", r.status === 400 && /1 de 1/.test(r.dados.error), r);
r = await chamar("/api/p/favorito", { file_id: f1.o, favorito: true });
confere("marcar de novo a mesma foto não conta duas vezes", r.status === 200, r);
await chamar("/api/p/favorito", { file_id: f1.o, favorito: false });
r = await chamar("/api/p/favorito", { file_id: f2.o, favorito: true });
confere("tirando uma, pode escolher outra", r.status === 200, r);

r = await chamar("/api/p/edicao", { file_id: f2.o, comentario: "Clarear o rosto, por favor" });
confere("pede edição com comentário", r.status === 200, r);
r = await chamar("/api/p/edicao", { file_id: f2.o, comentario: "x" });
confere("comentário muito curto é recusado", r.status === 400, r);
r = await chamar("/api/p/album?id=" + albId);
confere("foto mostra 'edição pedida' para o cliente", r.dados.arquivos.find(f => f.id === f2.o).edicao === "aberto", "");

cookie = dono;
r = await chamar("/api/portal/album?id=" + albId);
confere("fotógrafo vê o pedido de edição com o nome da foto", r.dados.edicoes.length === 1 && r.dados.edicoes[0].name === "A002.jpg" && r.dados.edicoes[0].comentario === "Clarear o rosto, por favor", r.dados.edicoes);
const edId = r.dados.edicoes[0].id;
r = await chamar("/api/portal/albuns");
confere("cartão do álbum mostra pedidos de edição abertos", r.dados.albuns[0].edicoes_abertas === 1 && r.dados.albuns[0].regras.pode_editar, r.dados.albuns[0]);
cookie = outro;
r = await chamar("/api/portal/edicoes/status", { id: edId, status: "feito" });
confere("outro fotógrafo não marca a edição", r.status >= 400 && db.prepare("SELECT status FROM pedidos_edicao WHERE id = ?").get(edId).status === "aberto", r);
cookie = dono;
r = await chamar("/api/portal/edicoes/status", { id: edId, status: "feito" });
confere("fotógrafo marca a edição como feita", r.status === 200 && db.prepare("SELECT status, feito_em FROM pedidos_edicao WHERE id = ?").get(edId).feito_em, r);

// central de acesso
r = await chamar("/api/portal/central");
const linhaAna = r.dados.clientes.find(c => c.email === "ana@t.com");
confere("central: visitas, downloads, escolhidas e edição pedida da cliente", linhaAna.visitas >= 3 && linhaAna.downloads === 3 && linhaAna.escolhidas === 1 && linhaAna.edicoes_abertas === 0 && linhaAna.ultimo_acesso && linhaAna.albuns === 1, linhaAna);
confere("central: resumo do estúdio", r.dados.resumo.clientes === 1 && r.dados.resumo.eventos === 0 && r.dados.resumo.recebido_mes === 0, r.dados.resumo);
cookie = outro;
r = await chamar("/api/portal/central");
confere("central de outro fotógrafo não mostra a cliente", !r.dados.clientes.length, r.dados);
cookie = dono;
r = await chamar("/api/portal/clientes/novo", { nome: "Beto", email: "beto@t.com", senha: "senha-cliente-2" });
confere("criar cliente devolve o id (para o passo a passo)", r.status === 200 && r.dados.id > 0, r);

// só ver / sem escolher / sem editar
await chamar("/api/portal/albuns/regras", { id: albId, pode_baixar: false, pode_escolher: false, pode_editar: false });
cookie = cli;
r = await chamar("/api/p/baixar?id=" + f3.o);
confere("modo 'só ver': download bloqueado", r.status === 403 && /visualização/.test(r.dados.error), r);
r = await chamar("/api/p/favorito", { file_id: f3.o, favorito: true });
confere("escolha desligada: não marca", r.status === 403, r);
r = await chamar("/api/p/favorito", { file_id: f2.o, favorito: false });
confere("mas dá para tirar uma escolhida", r.status === 200, r);
r = await chamar("/api/p/edicao", { file_id: f3.o, comentario: "mudar a cor" });
confere("edição desligada: não pede", r.status === 403, r);

// prazo vencido
db.prepare("UPDATE albuns SET acesso_ate = datetime('now', '-1 minute') WHERE id = ?").run(albId);
r = await chamar("/api/p/album?id=" + albId);
confere("prazo vencido: álbum fechado", r.status === 403 && r.dados.vencido === true, r);
r = await chamar("/api/p/me");
confere("lista mostra vencido e sem capa", r.dados.albuns[0].regras.vencido === true && r.dados.albuns[0].capa === null, r.dados.albuns[0]);
cookie = dono;
await chamar("/api/portal/albuns/regras", { id: albId, pode_baixar: true, prazo_dias: "7" });
cookie = cli;
r = await chamar("/api/p/album?id=" + albId);
confere("fotógrafo dá prazo novo e o álbum volta", r.status === 200 && !r.dados.regras.vencido, r.status);
cookie = dono;
await chamar("/api/portal/albuns/regras", { id: albId, prazo_dias: "0" });
confere("prazo 0 = sem prazo", db.prepare("SELECT acesso_ate FROM albuns WHERE id = ?").get(albId).acesso_ate === null, "");
await chamar("/api/portal/albuns/regras", { id: albId, max_downloads: "" });
confere("regra salva sem prazo_dias não mexe no prazo", db.prepare("SELECT acesso_ate FROM albuns WHERE id = ?").get(albId).acesso_ate === null, "");

// apagar o álbum leva originais, prévias, downloads e pedidos
apagados.length = 0;
let resta = 1;
while (resta) { r = await chamar("/api/portal/albuns/remover", { id: albId }); resta = r.dados.restantes; }
confere("apagar o álbum remove 3 originais + 2 prévias do B2", apagados.length === 5 && !db.prepare("SELECT 1 FROM albuns WHERE id = ?").get(albId), apagados);
confere("e limpa downloads e pedidos de edição", db.prepare("SELECT COUNT(*) n FROM album_downloads").get().n === 0 && db.prepare("SELECT COUNT(*) n FROM pedidos_edicao").get().n === 0, "");

console.log(falhas ? "\n" + falhas + " FALHA(S)" : "\nTODOS OS TESTES PASSARAM");
process.exit(falhas ? 1 : 0);
