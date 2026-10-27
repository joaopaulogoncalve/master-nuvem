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
const { purgarLixeira } = await import(new URL("../", import.meta.url).href + "src/lixeira.js");
const reg = async (email) => { cookie = ""; await chamar("/api/register", { email, senha: "senha-forte-1", nome: email.split("@")[0], aceite: true }); return cookie; };
const dono = await reg("foto@t.com");
const outro = await reg("outro@t.com");
db.prepare("INSERT INTO subscriptions (user_id, quota_gb, status, paid_until) VALUES (1, 10, 'active', datetime('now','+30 days')), (2, 10, 'active', datetime('now','+30 days'))").run();
cookie = outro;
await chamar("/api/portal/salvar", { nome: "Outro", slug: "outro-x", cor: "#112233" });
cookie = dono;
await chamar("/api/portal/salvar", { nome: "Luz", slug: "luz", cor: "#0d9488", tema: "delicado" });
const ana = (await chamar("/api/portal/clientes/novo", { nome: "Ana", email: "ana@t.com", senha: "senha-cliente-1" })).dados.id;
const a1 = (await chamar("/api/portal/albuns/novo", { cliente_id: ana, titulo: "Casamento", tipo: "Casamento" })).dados.id;
const a2 = (await chamar("/api/portal/albuns/novo", { cliente_id: ana, titulo: "Pré-wedding", tipo: "Pré-wedding" })).dados.id;
async function foto(campo, id, n) {
  cookie = dono;
  const o = await chamar("/api/files/upload-url", Object.assign({ name: n, size: 5000 }, { [campo]: id }));
  await chamar("/api/files/complete", { id: o.dados.id });
  return o.dados.id;
}
await foto("album_id", a1, "C1.jpg"); await foto("album_id", a1, "C2.jpg"); await foto("album_id", a2, "P1.jpg");
const ev = (await chamar("/api/eventos/salvar", { titulo: "Corrida", slug: "corrida", preco: "10" })).dados.id;
await chamar("/api/portal/pagamento", { instrucoes: "PIX x" });
const o1 = await foto("evento_id", ev, "R1.jpg"); const p1 = await foto("evento_id", ev, "previa-R1.jpg");
await chamar("/api/eventos/foto", { evento_id: ev, original_id: o1, previa_id: p1 });

cookie = "";
r = await chamar("/api/e/info?slug=corrida");
confere("página do evento manda o layout do estúdio", r.dados.tema === "delicado", r.dados);
await chamar("/api/p/login", { slug: "luz", email: "ana@t.com", senha: "senha-cliente-1" });
const cli = cookie;

// remover álbum
cookie = outro;
r = await chamar("/api/portal/lixeira", { tipo: "album", id: a1 });
confere("outro fotógrafo não remove o álbum", r.status === 404, r);
cookie = dono;
r = await chamar("/api/portal/lixeira", { tipo: "album", id: a1 });
confere("álbum vai para a lixeira", r.status === 200 && db.prepare("SELECT removido_em FROM albuns WHERE id = ?").get(a1).removido_em, r);
cookie = cli;
r = await chamar("/api/p/me");
confere("cliente deixa de ver o álbum na hora", r.dados.albuns.length === 1 && r.dados.albuns[0].id === a2, r.dados.albuns.map(a => a.titulo));
r = await chamar("/api/p/album?id=" + a1);
confere("e não abre mais pelo link", r.status === 404, r);
cookie = dono;
r = await chamar("/api/files/upload-url", { name: "x.jpg", size: 10, album_id: a1 });
confere("não dá para enviar foto para álbum removido", r.status === 404, r);
r = await chamar("/api/portal/albuns");
confere("o fotógrafo ainda vê o álbum (com a data de remoção, para desfazer)", r.dados.albuns.find(a => a.id === a1).removido_em, "");
r = await chamar("/api/portal/restaurar", { tipo: "album", id: a1 });
cookie = cli;
r = await chamar("/api/p/me");
confere("desfazer: o álbum volta para o cliente", r.dados.albuns.length === 2, r.dados.albuns.length);

// a lixeira só apaga depois de 30 minutos
cookie = dono;
await chamar("/api/portal/lixeira", { tipo: "album", id: a1 });
apagados.length = 0;
let rel = await purgarLixeira(env);
confere("antes de 30 minutos nada é apagado", apagados.length === 0 && db.prepare("SELECT 1 FROM albuns WHERE id = ?").get(a1), rel);
db.prepare("UPDATE albuns SET removido_em = datetime('now', '-31 minutes') WHERE id = ?").run(a1);
rel = await purgarLixeira(env);
confere("depois de 30 minutos apaga as fotos do B2 e o álbum", apagados.length === 2 && !db.prepare("SELECT 1 FROM albuns WHERE id = ?").get(a1) && rel.albuns === 1, { apagados, rel });
confere("as fotos não ficam soltas em Meus arquivos", db.prepare("SELECT COUNT(*) n FROM files WHERE name LIKE 'C%.jpg'").get().n === 0, "");

// remover cliente leva todos os álbuns
r = await chamar("/api/portal/lixeira", { tipo: "cliente", id: ana });
confere("cliente vai para a lixeira com os álbuns", db.prepare("SELECT removido_em FROM portal_clientes WHERE id = ?").get(ana).removido_em && db.prepare("SELECT removido_em FROM albuns WHERE id = ?").get(a2).removido_em, r);
cookie = cli;
r = await chamar("/api/p/me");
confere("cliente removido perde a sessão", r.status === 401, r);
cookie = "";
r = await chamar("/api/p/login", { slug: "luz", email: "ana@t.com", senha: "senha-cliente-1" });
confere("e não consegue entrar", r.status === 401, r);
cookie = dono;
r = await chamar("/api/portal/restaurar", { tipo: "album", id: a2 });
confere("não desfaz só o álbum se o cliente foi removido", r.status === 400, r);
r = await chamar("/api/portal/central");
confere("central mostra o cliente como removido", r.dados.clientes.find(c => c.id === ana).removido_em, "");
await chamar("/api/portal/restaurar", { tipo: "cliente", id: ana });
cookie = "";
r = await chamar("/api/p/login", { slug: "luz", email: "ana@t.com", senha: "senha-cliente-1" });
r = await chamar("/api/p/me");
confere("desfazer o cliente devolve o login e os álbuns", r.status === 200 && r.dados.albuns.length === 1, r.dados);
cookie = dono;
await chamar("/api/portal/lixeira", { tipo: "cliente", id: ana });
db.prepare("UPDATE portal_clientes SET removido_em = datetime('now', '-31 minutes') WHERE id = ?").run(ana);
db.prepare("UPDATE albuns SET removido_em = datetime('now', '-31 minutes') WHERE cliente_id = ?").run(ana);
apagados.length = 0;
await purgarLixeira(env);
confere("depois de 30 minutos some o cliente, o álbum e as fotos", apagados.length === 1 && !db.prepare("SELECT 1 FROM portal_clientes WHERE id = ?").get(ana) && !db.prepare("SELECT 1 FROM albuns WHERE id = ?").get(a2), apagados);

// evento
cookie = outro;
r = await chamar("/api/eventos/lixeira", { id: ev });
confere("outro fotógrafo não remove o evento", r.status === 404, r);
cookie = dono;
await chamar("/api/eventos/lixeira", { id: ev });
cookie = "";
r = await chamar("/api/e/info?slug=corrida");
confere("evento removido sai do ar na hora", r.status === 404, r);
cookie = dono;
await chamar("/api/eventos/restaurar", { id: ev });
cookie = "";
r = await chamar("/api/e/info?slug=corrida");
confere("desfazer: o evento volta ao ar", r.status === 200, r);
cookie = dono;
await chamar("/api/eventos/lixeira", { id: ev });
db.prepare("UPDATE eventos SET removido_em = datetime('now', '-31 minutes') WHERE id = ?").run(ev);
apagados.length = 0;
await purgarLixeira(env);
confere("depois de 30 minutos apaga original, prévia e o evento", apagados.length === 2 && !db.prepare("SELECT 1 FROM eventos WHERE id = ?").get(ev) && db.prepare("SELECT COUNT(*) n FROM evento_fotos").get().n === 0, apagados);

// a cada 20 minutos o Cron roda a sentinela e depois a lixeira
const ctx = { waitUntil(p) { this.p = p; } };
await worker.scheduled({ cron: "*/20 * * * *" }, env, ctx); await ctx.p;
confere("Cron de 20 minutos roda sem erro (sentinela + lixeira)", true, "");

console.log(falhas ? "\n" + falhas + " FALHA(S)" : "\nTODOS OS TESTES PASSARAM");
process.exit(falhas ? 1 : 0);
