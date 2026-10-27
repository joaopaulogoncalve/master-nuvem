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
await chamar("/api/portal/precos/salvar", { nome: "Preço do outro", unidade: "foto", valor: "1" });
const precoOutro = db.prepare("SELECT id FROM precos").get().id;

cookie = dono;
await chamar("/api/portal/salvar", { nome: "Estúdio", slug: "estudio", cor: "#be185d" });
await chamar("/api/portal/clientes/novo", { nome: "Ana", email: "ana@t.com", senha: "senha-cliente-1" });
const ana = db.prepare("SELECT id FROM portal_clientes WHERE email='ana@t.com'").get().id;
const album = (await chamar("/api/portal/albuns/novo", { cliente_id: ana, titulo: "Casamento", tipo: "Casamento" })).dados.id;
await chamar("/api/files/complete", { id: (await chamar("/api/files/upload-url", { name: "f.jpg", size: 5000, album_id: album })).dados.id });

let r = await chamar("/api/portal");
confere("portal novo começa em acesso livre", r.dados.portal.cobrar === 0, r.dados.portal);

// tabela de preços
r = await chamar("/api/portal/precos/salvar", { nome: "Foto extra", unidade: "foto", valor: "15,00" });
confere("adiciona Foto extra R$ 15", r.status === 200, r);
await chamar("/api/portal/precos/salvar", { nome: "Edição de foto", unidade: "edicao", valor: "25" });
await chamar("/api/portal/precos/salvar", { nome: "Minuto de vídeo", unidade: "minuto", valor: "80,50" });
r = await chamar("/api/portal/precos/salvar", { nome: "X", unidade: "foto", valor: "10" });
confere("nome curto recusado", r.status === 400, r);
r = await chamar("/api/portal/precos/salvar", { nome: "Coisa", unidade: "tonelada", valor: "10" });
confere("unidade inválida recusada", r.status === 400, r);
r = await chamar("/api/portal/cobrancas");
const precos = r.dados.precos;
confere("tabela tem 3 itens e lista as unidades", precos.length === 3 && r.dados.unidades.minuto === "por minuto de vídeo", r.dados);
const pFoto = precos.find(p => p.nome === "Foto extra").id, pEd = precos.find(p => p.nome === "Edição de foto").id, pMin = precos.find(p => p.nome === "Minuto de vídeo").id;
r = await chamar("/api/portal/precos/salvar", { id: precoOutro, nome: "Hack", unidade: "foto", valor: "1" });
confere("não edita preço de outro fotógrafo", r.status === 404, r);

// cobrança por itens
await chamar("/api/portal/pagamento", { cobrar: true, instrucoes: "PIX: 123" });
r = await chamar("/api/portal/cobrancas/nova", { cliente_id: ana, album_id: album, itens: [{ preco_id: pFoto, qtd: 15 }, { preco_id: pEd, qtd: 3 }, { preco_id: pMin, qtd: 2 }], bloqueia_album: true });
const cob = db.prepare("SELECT valor_centavos v, descricao d, itens FROM cobrancas ORDER BY id DESC").get();
confere("total = 15×15 + 3×25 + 2×80,50 = R$ 461,00", r.status === 200 && cob.v === 46100, cob);
confere("descrição automática pelos itens", /15x Foto extra/.test(cob.d) && /2x Minuto de vídeo/.test(cob.d), cob.d);
r = await chamar("/api/portal/cobrancas/nova", { cliente_id: ana, itens: [{ preco_id: precoOutro, qtd: 1 }] });
confere("não usa preço de outro fotógrafo", r.status === 400, r);
r = await chamar("/api/portal/cobrancas/nova", { cliente_id: ana, itens: [{ preco_id: pFoto, qtd: 0 }] });
confere("quantidade zero recusada", r.status === 400, r);
r = await chamar("/api/portal/cobrancas/nova", { cliente_id: ana, itens: [{ preco_id: pFoto, qtd: 2, valor_centavos: 1 }], valor: "100,00", descricao: "Sinal" });
const c2 = db.prepare("SELECT valor_centavos v, itens FROM cobrancas ORDER BY id DESC").get();
confere("itens + valor avulso = 30 + 100 = R$ 130 (ignora preço vindo do navegador)", c2.v === 13000 && JSON.parse(c2.itens).length === 2, c2);
// mudar a tabela não muda cobrança antiga
await chamar("/api/portal/precos/salvar", { id: pFoto, nome: "Foto extra", unidade: "foto", valor: "99" });
confere("mudar preço não altera cobrança antiga", db.prepare("SELECT valor_centavos v FROM cobrancas WHERE id = 1").get().v === 46100, "");
r = await chamar("/api/portal/precos/remover", { id: pEd });
confere("remove item da tabela sem apagar cobrança", r.status === 200 && db.prepare("SELECT COUNT(*) n FROM cobrancas").get().n === 2, "");

// cliente vê os itens; álbum trancado
cookie = "";
await chamar("/api/p/login", { slug: "estudio", email: "ana@t.com", senha: "senha-cliente-1" });
r = await chamar("/api/p/me");
const b1 = r.dados.cobrancas.find(b => b.valor_centavos === 46100);
confere("cliente vê os itens da cobrança", b1 && b1.itens.length === 3 && b1.itens[0].qtd === 15, r.dados.cobrancas);
r = await chamar("/api/p/baixar?id=" + db.prepare("SELECT id FROM files").get().id);
confere("com 'cobrar pelo portal', álbum fica trancado", r.status === 402, r);

// acesso livre: nada trancado e cliente não vê cobranças
cookie = dono;
await chamar("/api/portal/pagamento", { cobrar: false });
r = await chamar("/api/portal");
confere("muda para acesso livre", r.dados.portal.cobrar === 0, r.dados.portal);
r = await chamar("/api/portal/albuns");
confere("acesso livre: fotógrafo não vê o álbum como trancado", r.dados.albuns[0].trancado === 0, r.dados.albuns);
cookie = "";
await chamar("/api/p/login", { slug: "estudio", email: "ana@t.com", senha: "senha-cliente-1" });
r = await chamar("/api/p/me");
confere("acesso livre: cliente não vê cobranças", r.dados.cobrancas.length === 0 && r.dados.albuns[0].trancado === 0, r.dados);
r = await chamar("/api/p/baixar?id=" + db.prepare("SELECT id FROM files").get().id);
confere("acesso livre: download liberado", r.status === 200, r);

console.log(falhas ? "\n" + falhas + " FALHA(S)" : "\nTODOS OS TESTES PASSARAM");
process.exit(falhas ? 1 : 0);
