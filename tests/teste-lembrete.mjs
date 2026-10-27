import { fileURLToPath } from "node:url";
// Teste do lembrete de recarga do chip do WhatsApp (e-mail + alerta no /admin, uma vez por ciclo de 30 dias).
import { DatabaseSync } from "node:sqlite";
import { readFileSync } from "node:fs";
import { createHmac } from "node:crypto";

const RAIZ = fileURLToPath(new URL("../", import.meta.url)).replace(/\\/g, "/");
const modulo = await import(new URL("../", import.meta.url).href + "src/worker.js");
const lembreteWhatsapp = modulo.lembreteWhatsapp;

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

let falhas = 0;
function confere(nome, ok, info) { console.log((ok ? "OK   " : "FALHA") + " " + nome + (ok ? "" : "  -> " + JSON.stringify(info))); if (!ok) falhas++; }
env.RESEND_API_KEY = "re_teste";
const emails = [];
globalThis.fetch = async (url, op) => { emails.push(JSON.parse(op.body)); return new Response("{}"); };
const dia = (d) => Date.parse(d + "T06:00:00Z");
const alertas = () => db.prepare("SELECT chave FROM sentinela_alertas").all().length;

confere("antes de 30 dias não avisa", !(await lembreteWhatsapp(env, dia("2026-11-20"))) && emails.length === 0, emails.length);
confere("no dia 30 avisa", (await lembreteWhatsapp(env, dia("2026-11-26"))) && emails.length === 1 && emails[0].to[0] === "contato@masternuvem.com.br", emails);
confere("e-mail fala do crédito e do número", /crédito/.test(emails[0].text) && /98284-6067/.test(emails[0].text), emails[0].text);
confere("alerta aparece no /admin", alertas() === 1, alertas());
confere("no dia seguinte não repete", !(await lembreteWhatsapp(env, dia("2026-11-27"))) && emails.length === 1, emails.length);
confere("30 dias depois avisa de novo", (await lembreteWhatsapp(env, dia("2026-12-26"))) && emails.length === 2 && alertas() === 2, emails.length);

console.log(falhas ? "\n" + falhas + " FALHA(S)" : "\nTODOS OS TESTES PASSARAM");
process.exit(falhas ? 1 : 0);
