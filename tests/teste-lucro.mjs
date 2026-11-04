import { fileURLToPath } from "node:url";
// Teste da ponte Lucro Online: a Master Nuvem manda os ganhos dela para o admin do China em Casa (chave LUCRO_KEY).
import { DatabaseSync } from "node:sqlite";
import { readFileSync } from "node:fs";
import { createHmac } from "node:crypto";

const RAIZ = fileURLToPath(new URL("../", import.meta.url)).replace(/\\/g, "/");
const modulo = await import(new URL("../", import.meta.url).href + "src/worker.js");
const enviarLucro = modulo.enviarLucro;
const lerLucro = modulo.lerLucro;

const db = new DatabaseSync(":memory:");
for (const m of ["0001_init", "0002_recuperar_senha", "0003_aceite_termos", "0004_avisos", "0005_portal", "0006_cobrancas", "0007_cupons", "0008_tabela_precos", "0009_cupom_preco", "0010_assistente", "0011_sentinela", "0012_faq_mais", "0013_eventos", "0014_faq_blog_eventos", "0015_regras_acesso", "0016_faq_estudio", "0017_lixeira", "0018_visual", "0019_aumentar_espaco", "0020_fotos_extras", "0021_bancos", "0022_contratos", "0023_copias", "0024_contrato_obrigatorio", "0025_senha_cliente", "0026_varias_pessoas", "0027_confirmar_email", "0028_portfolio", "0029_faq_avaliar"]) db.exec(readFileSync(RAIZ + "migrations/" + m + ".sql", "utf8"));

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

let falhas = 0;
function confere(nome, ok, info) { console.log((ok ? "OK   " : "FALHA") + " " + nome + (ok ? "" : "  -> " + JSON.stringify(info))); if (!ok) falhas++; }
const ex = (sql, ...a) => db.prepare(sql).run(...a);
ex("INSERT INTO users (id, email, name, password_hash, password_salt) VALUES (1, 'a@t.com', 'A', 'h', 's')");
const sub = (status, mp, valor, quando) => ex("INSERT INTO subscriptions (user_id, quota_gb, status, paid_until, mp_payment_id, valor_centavos, created_at) VALUES (1, 100, ?, datetime('now','+10 days'), ?, ?, ?)", status, mp, valor, quando);
sub("active", "110", 990, "2026-09-05 10:00:00");
sub("active", "111", 1040, "2026-10-05 10:00:00");
sub("replaced", "112", 5900, "2026-10-20 10:00:00");
sub("active", "113", 1040, "2026-11-02 10:00:00");
sub("active", "cupom:NUVEM1DIA", 0, "2026-11-02 10:00:00");
sub("active", "manual:1", 0, "2026-11-02 10:00:00");
sub("cancelled", "114", 990, "2026-11-03 10:00:00");
sub("pending", "115", 990, "2026-11-03 10:00:00");
ex("INSERT INTO files (user_id, object_key, name, size_bytes, status) VALUES (1, 'u1/a', 'a', 12000000000, 'ready')");

const recebidos = [];
let respostaOk = true;
globalThis.fetch = async (url, op) => {
  recebidos.push({ url: String(url), chave: op.headers["x-lucro-key"], corpo: JSON.parse(op.body) });
  return new Response(JSON.stringify({ ok: respostaOk }), { status: respostaOk ? 200 : 401 });
};
const agora = Date.parse("2026-11-04T07:00:00Z");

let r = await enviarLucro(env, agora);
confere("sem LUCRO_KEY: não manda nada", r.ok === false && recebidos.length === 0, r);

env.LUCRO_KEY = "k".repeat(40);
r = await enviarLucro(env, agora);
confere("manda para a ponte do China em Casa com a chave", r.ok && recebidos.every(x => x.url === "https://china-em-casa.paulojao151.workers.dev/api/lucro/lancar" && x.chave === env.LUCRO_KEY), recebidos);
const porId = id => (recebidos.find(x => x.corpo.id === id) || {}).corpo || {};
confere("outubro: ganho de R$ 69,40 (2 planos)", porId("ganhos-202610").valor === 69.4 && porId("ganhos-202610").tipo === "ganho" && /2/.test(porId("ganhos-202610").descricao), recebidos.map(x => x.corpo));
confere("novembro: só o plano pago (sem cupom, manual, cancelado, pendente)", porId("ganhos-202611").valor === 10.4, porId("ganhos-202611"));
confere("só os 2 últimos meses (setembro fica de fora)", !recebidos.some(x => x.corpo.id === "ganhos-202609"), recebidos.map(x => x.corpo.id));
confere("custo do armazenamento acima do grátis vai como gasto do mês", porId("armazenamento-202611").tipo === "gasto" && porId("armazenamento-202611").valor > 0, porId("armazenamento-202611"));
confere("não manda e-mail nem dado de cliente", !JSON.stringify(recebidos).includes("a@t.com"), "");
confere("ids fixos: mandar de novo atualiza em vez de duplicar", (await enviarLucro(env, agora)).enviados.map(x => x.id).join() === r.enviados.map(x => x.id).join(), "");

respostaOk = false;
r = await enviarLucro(env, agora);
confere("chave recusada: avisa que falhou", r.ok === false && r.enviados.length > 0, r);
globalThis.fetch = async () => { throw new Error("fora do ar"); };
r = await enviarLucro(env, agora);
confere("China em Casa fora do ar: não quebra", r.ok === false, r);

// Com a ligação interna (service binding), manda por ela e não pela internet.
let pelaLigacao = 0;
env.CHINA_EM_CASA = { fetch: async (url, op) => { pelaLigacao++; return new Response("{}", { status: 200 }); } };
r = await enviarLucro(env, agora);
confere("usa a ligação interna com o China em Casa", r.ok && pelaLigacao === r.enviados.length && pelaLigacao > 0, { r, pelaLigacao });

// Painel do /admin: lê o resumo dos dois negócios pela ligação interna.
let pedido = null;
env.CHINA_EM_CASA = { fetch: async (url, op) => { pedido = { url, chave: op.headers["x-lucro-key"] }; return new Response(JSON.stringify({ resumo: [{ mes: "2026-10", ganhos: 2, gastos: 230, lucro: -228, dizimoPct: 10, dizimo: 0 }], lancamentosMasterNuvem: [{ id: "l-mn-ganhos-202610", mes: "2026-10", tipo: "ganho", valor: 2, descricao: "Planos pagos: 2" }] })); } };
let lido = await lerLucro(env);
confere("painel lê o resumo com a chave", lido.configurado && lido.resumo.length === 1 && lido.master.length === 1 && pedido.url.endsWith("/api/lucro/resumo") && pedido.chave === env.LUCRO_KEY, { lido, pedido });
env.CHINA_EM_CASA = { fetch: async () => new Response("{}", { status: 401 }) };
confere("chave recusada aparece no painel", /recusou/.test((await lerLucro(env)).erro || ""), "");
const semChave = Object.assign({}, env, { LUCRO_KEY: undefined });
confere("sem chave: painel diz que falta", (await lerLucro(semChave)).configurado === false, "");

console.log(falhas ? "\n" + falhas + " FALHA(S)" : "\nTODOS OS TESTES PASSARAM");
process.exit(falhas ? 1 : 0);
