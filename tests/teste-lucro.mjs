import { fileURLToPath } from "node:url";
// Teste da ligação Lucro Online: o admin do China em Casa lê os totais da Master Nuvem com a senha LUCRO_TOKEN.
import { DatabaseSync } from "node:sqlite";
import { readFileSync } from "node:fs";
import { createHmac } from "node:crypto";

const RAIZ = fileURLToPath(new URL("../", import.meta.url)).replace(/\\/g, "/");
const modulo = await import(new URL("../", import.meta.url).href + "src/worker.js");
const worker = modulo.default;

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
const BASE = "https://masternuvem.com.br";
async function ler(token) {
  const h = token === undefined ? {} : { Authorization: "Bearer " + token };
  const r = await worker.fetch(new Request(BASE + "/api/integracao/lucro", { headers: h }), env);
  return { status: r.status, dados: await r.json() };
}
const ex = (sql, ...a) => db.prepare(sql).run(...a);
ex("INSERT INTO users (id, email, name, password_hash, password_salt) VALUES (1, 'a@t.com', 'A', 'h', 's')");
const sub = (status, mp, valor, quando) => ex("INSERT INTO subscriptions (user_id, quota_gb, status, paid_until, mp_payment_id, valor_centavos, created_at) VALUES (1, 100, ?, datetime('now','+10 days'), ?, ?, ?)", status, mp, valor, quando);
sub("active", "111", 1040, "2026-10-05 10:00:00");
sub("replaced", "112", 5900, "2026-10-20 10:00:00");
sub("active", "113", 1040, "2026-11-02 10:00:00");
sub("active", "cupom:NUVEM1DIA", 0, "2026-11-02 10:00:00");
sub("active", "manual:1", 0, "2026-11-02 10:00:00");
sub("cancelled", "114", 990, "2026-11-03 10:00:00");
sub("pending", "115", 990, "2026-11-03 10:00:00");
ex("INSERT INTO files (user_id, object_key, name, size_bytes, status) VALUES (1, 'u1/a', 'a', 12000000000, 'ready')");

let r = await ler("x".repeat(64));
confere("sem LUCRO_TOKEN configurado: rota não existe", r.status === 404, r);
const TOKEN = "f".repeat(64);
env.LUCRO_TOKEN = TOKEN;
confere("sem senha: recusado", (await ler()).status === 404, "");
confere("senha errada: recusado", (await ler("e".repeat(64))).status === 404, "");
r = await ler(TOKEN);
confere("senha certa: entrega o resumo", r.status === 200 && r.dados.projeto === "Master Nuvem", r);
const mes = (m) => r.dados.meses.find(x => x.mes === m) || {};
confere("outubro: 2 vendas, R$ 69,40", mes("2026-10").vendas === 2 && mes("2026-10").ganhos_centavos === 6940, r.dados.meses);
confere("novembro: só a venda paga (sem cupom, manual, cancelado ou pendente)", mes("2026-11").vendas === 1 && mes("2026-11").ganhos_centavos === 1040, r.dados.meses);
confere("armazenamento e custo estimado (2 GB acima do grátis)", r.dados.armazenamento_atual_gb === 12 && r.dados.custo_armazenamento_mes_estimado_reais > 0, r.dados);
confere("não entrega e-mail nem dado de cliente", !JSON.stringify(r.dados).includes("a@t.com"), r.dados);
env.LUCRO_TOKEN = "curta";
confere("senha curta configurada não abre a rota", (await ler("curta")).status === 404, "");

console.log(falhas ? "\n" + falhas + " FALHA(S)" : "\nTODOS OS TESTES PASSARAM");
process.exit(falhas ? 1 : 0);
