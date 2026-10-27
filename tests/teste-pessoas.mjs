import { fileURLToPath } from "node:url";
// Teste local do fluxo checkout -> webhook, com banco SQLite em memória e Mercado Pago simulado.
import { DatabaseSync } from "node:sqlite";
import { readFileSync } from "node:fs";
import { createHmac, createHash } from "node:crypto";

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


const { preencher, MODELOS, clausulaMenor } = await import(new URL("../", import.meta.url).href + "src/contratos-modelos.js");
Object.assign(env, { B2_ENDPOINT: "s3.us-east-005.backblazeb2.com", B2_BUCKET: "balde", B2_KEY_ID: "005abc", B2_APP_KEY: "K005xyz", RESEND_API_KEY: "re_teste" });
const emails = [];
globalThis.fetch = async (url, op) => {
  url = String(url);
  if (url.includes("api.resend.com")) { emails.push(JSON.parse(op.body)); return new Response("{}"); }
  if (url.includes("backblazeb2.com")) return new Response(null, { status: 200, headers: { "Content-Length": "5000" } });
  throw new Error("fetch inesperado " + url);
};
const codigoDe = (para) => { const e = emails.filter(x => x.to[0] === para && /Seu código/.test(x.subject)).pop(); return e && e.subject.match(/(\d{6})/)[1]; };
const conviteDe = (para) => { const e = emails.filter(x => x.to[0] === para && /criou o seu acesso/.test(x.subject)).pop(); return e && e.html.match(/convite=([0-9a-f]{48})/)[1]; };

cookie = "";
await chamar("/api/register", { email: "foto@t.com", senha: "senha-forte-1", nome: "Fotógrafa", aceite: true });
const dono = cookie;
db.prepare("INSERT INTO subscriptions (user_id, quota_gb, status, paid_until) VALUES (1, 10, 'active', datetime('now','+30 days'))").run();
await chamar("/api/portal/salvar", { nome: "Estúdio Luz", slug: "estudio-luz", cor: "#0d9488", tema: "classico" });
let r = await chamar("/api/portal/marca", { doc_nome: "Luz Fotografia LTDA", doc_numero: "11.222.333/0001-81", doc_cidade: "Goiânia - GO" });
r = await chamar("/api/contratos");
confere("dados do fotógrafo vão para os contratos", r.dados.estudio.nome === "Luz Fotografia LTDA" && r.dados.estudio.cidade === "Goiânia - GO", r.dados.estudio);

await chamar("/api/portal/clientes/novo", { nome: "Ana Souza", email: "ana@t.com", senha: "senha-cliente-1" });
const anaId = db.prepare("SELECT id FROM portal_clientes WHERE email = 'ana@t.com'").get().id;
r = await chamar("/api/portal/albuns/novo", { cliente_id: anaId, titulo: "Casamento", tipo: "Casamento" });
const albId = r.dados.id;
const o = await chamar("/api/files/upload-url", { name: "A1.jpg", size: 5000, album_id: albId });
await chamar("/api/files/complete", { id: o.dados.id });

// mais uma pessoa no álbum (o noivo), com login próprio
emails.length = 0;
r = await chamar("/api/portal/albuns/pessoas/adicionar", { album_id: albId, nome: "João Lima", email: "joao@t.com", senha: "senha-do-joao-1" });
confere("adiciona o noivo ao álbum e manda o acesso por e-mail", r.status === 200 && r.dados.nova && r.dados.email_enviado && conviteDe("joao@t.com"), r.dados);
const joaoId = r.dados.id;
const conviteJoao = conviteDe("joao@t.com");
r = await chamar("/api/portal/album?id=" + albId);
confere("o álbum mostra as 2 pessoas (principal + adicionada)", r.dados.album.pessoas.length === 2 && r.dados.album.pessoas[0].principal === 1, r.dados.album.pessoas);
r = await chamar("/api/portal/albuns/pessoas/adicionar", { album_id: albId, nome: "Ana", email: "ana@t.com" });
confere("não deixa adicionar a pessoa principal de novo", r.status === 400, r);

// contrato com 2 pessoas, regra "todos"
const texto = preencher(MODELOS[0].texto, { cliente_nome: "Ana Souza e João Lima", clausula_menor: "" });
confere("sem menor, a cláusula de menor some do texto", !/MENOR DE IDADE|clausula_menor/.test(texto), "");
confere("com menor, entra a cláusula sem pedir CPF do menor", /MENOR DE IDADE:\*\* o serviço é para Bia/.test(preencher(MODELOS[0].texto, { clausula_menor: clausulaMenor("Bia") })), "");
emails.length = 0;
r = await chamar("/api/contratos/novo", { titulo: "Casamento Ana e João", texto, album_id: albId, regra: "todos",
  assinantes: [{ nome: "Ana Souza", email: "ana@t.com", cliente_id: anaId }, { nome: "João Lima", email: "joao@t.com", cliente_id: joaoId }] });
confere("cria contrato com 2 pessoas e cada uma recebe o próprio link", r.status === 200 && r.dados.assinantes.length === 2 && r.dados.assinantes[0].link !== r.dados.assinantes[1].link && emails.filter(e => /Contrato para assinar/.test(e.subject)).length === 2, r.dados);
const [linkAna, linkJoao] = r.dados.assinantes.map(a => a.link.split("/c/")[1]);
r = await chamar("/api/contratos/novo", { titulo: "x", texto, assinantes: [{ nome: "A B", email: "a@t.com" }, { nome: "C D", email: "a@t.com" }] });
confere("recusa e-mail repetido entre as pessoas", r.status === 400, r);

// João entra pelo convite e cria a senha; vê que precisa assinar
cookie = "";
await chamar("/api/p/convite", { slug: "estudio-luz", t: conviteJoao, senha: "senha-joao-nova" });
const joao = cookie;
r = await chamar("/api/p/me");
confere("o noivo vê o álbum (com cadeado) e o aviso para assinar", r.dados.albuns.length === 1 && r.dados.albuns[0].aguardando_contrato && r.dados.contratos_pendentes[0].link === "/c/" + linkJoao, r.dados);
// Ana entra (senha do fotógrafo) e pode manter a senha
cookie = "";
await chamar("/api/p/login", { slug: "estudio-luz", email: "ana@t.com", senha: "senha-cliente-1" });
const ana = cookie;
r = await chamar("/api/p/me");
confere("Ana entrou com a senha do fotógrafo: o portal oferece criar a dela", r.dados.precisa_senha === true, "");
r = await chamar("/api/p/senha/manter", {});
r = await chamar("/api/p/me");
confere("ela pode continuar com a senha que recebeu", r.dados.precisa_senha === false, "");

// Ana assina; com a regra "todos", o álbum continua fechado aguardando o João
cookie = "";
await chamar("/api/c/codigo", { t: linkAna, nome: "Ana Souza", cpf: "529.982.247-25", aceite: true });
r = await chamar("/api/c/assinar", { t: linkAna, nome: "Ana Souza", cpf: "529.982.247-25", codigo: codigoDe("ana@t.com") });
confere("Ana assina e vê que falta o João", r.status === 200 && r.dados.status === "assinado" && r.dados.pessoas.some(p => p.nome === "João Lima" && !p.assinou), r.dados.pessoas);
confere("fotógrafa recebe 'Ana assinou (1 de 2)'", emails.some(e => e.to[0] === "foto@t.com" && /1 de 2/.test(e.subject)), emails.map(e => e.subject));
cookie = ana;
r = await chamar("/api/p/album?id=" + albId);
confere("com a regra 'todos', a Ana ainda não vê as fotos: aguardando o João", r.status === 403 && /Aguardando a assinatura de João Lima/.test(r.dados.error), r.dados);
r = await chamar("/api/p/me");
confere("o aviso da Ana diz 'Aguardando a assinatura de João Lima'", r.dados.contratos_pendentes[0].link === null && r.dados.contratos_pendentes[0].aguardando[0] === "João Lima", r.dados.contratos_pendentes);

// João assina: libera para os dois
cookie = "";
await chamar("/api/c/codigo", { t: linkJoao, nome: "João Lima", cpf: "111.444.777-35", aceite: true });
r = await chamar("/api/c/assinar", { t: linkJoao, nome: "João Lima", cpf: "111.444.777-35", codigo: codigoDe("joao@t.com") });
confere("João assina e o contrato fica assinado por todos", r.status === 200 && db.prepare("SELECT status FROM contratos").get().status === "assinado", r.dados);
cookie = ana;
r = await chamar("/api/p/album?id=" + albId);
confere("agora a Ana vê as fotos", r.status === 200, r.status);
cookie = joao;
r = await chamar("/api/p/album?id=" + albId);
confere("e o João também", r.status === 200, r.status);

// regra "um": basta uma assinatura
cookie = dono;
r = await chamar("/api/portal/albuns/novo", { cliente_id: anaId, titulo: "Ensaio", tipo: "Ensaio" });
const alb2 = r.dados.id;
await chamar("/api/portal/albuns/pessoas/adicionar", { album_id: alb2, nome: "João Lima", email: "joao@t.com" });
r = await chamar("/api/contratos/novo", { titulo: "Ensaio", texto, album_id: alb2, regra: "um",
  assinantes: [{ nome: "Ana Souza", email: "ana@t.com", cliente_id: anaId }, { nome: "João Lima", email: "joao@t.com", cliente_id: joaoId }] });
const linkAna2 = r.dados.assinantes[0].link.split("/c/")[1];
cookie = joao;
r = await chamar("/api/p/album?id=" + alb2);
confere("regra 'um': antes de qualquer assinatura, fica fechado", r.status === 403, r.status);
cookie = "";
await chamar("/api/c/codigo", { t: linkAna2, nome: "Ana Souza", cpf: "529.982.247-25", aceite: true });
await chamar("/api/c/assinar", { t: linkAna2, nome: "Ana Souza", cpf: "529.982.247-25", codigo: codigoDe("ana@t.com") });
cookie = joao;
r = await chamar("/api/p/album?id=" + alb2);
confere("regra 'um': depois que a Ana assinou, o João já vê as fotos", r.status === 200, r.status);
r = await chamar("/api/p/me");
confere("o João ainda vê o aviso para assinar (sem travar)", r.dados.contratos_pendentes.some(k => k.titulo === "Ensaio" && k.link && !k.obrigatorio), r.dados.contratos_pendentes);

// regra "nenhum": não trava
cookie = dono;
r = await chamar("/api/portal/albuns/novo", { cliente_id: anaId, titulo: "Festa", tipo: "Festa" });
const alb3 = r.dados.id;
await chamar("/api/contratos/novo", { titulo: "Festa", texto, album_id: alb3, regra: "nenhum", assinantes: [{ nome: "Ana Souza", email: "ana@t.com", cliente_id: anaId }] });
cookie = ana;
r = await chamar("/api/p/album?id=" + alb3);
confere("regra 'não trava': as fotos ficam liberadas mesmo sem assinar", r.status === 200, r.status);

// tirar o acesso do João
cookie = dono;
await chamar("/api/portal/albuns/pessoas/remover", { album_id: albId, cliente_id: joaoId });
cookie = joao;
r = await chamar("/api/p/album?id=" + albId);
confere("tirando o acesso, o João deixa de ver o álbum", r.status === 404, r.status);

// resumo do painel
cookie = dono;
r = await chamar("/api/portal/resumo");
confere("resumo do painel conta os contratos esperando assinatura", r.dados.portal && r.dados.contratos.esperando === 2 && typeof r.dados.cobrancas.total_centavos === "number", r.dados);

console.log(falhas ? "\n" + falhas + " FALHA(S)" : "\nTODOS OS TESTES PASSARAM");
process.exit(falhas ? 1 : 0);
