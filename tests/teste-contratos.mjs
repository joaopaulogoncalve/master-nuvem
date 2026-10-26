import { fileURLToPath } from "node:url";
// Teste local do fluxo checkout -> webhook, com banco SQLite em memória e Mercado Pago simulado.
import { DatabaseSync } from "node:sqlite";
import { readFileSync } from "node:fs";
import { createHmac, createHash } from "node:crypto";

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


const { documentoValido } = await import(new URL("../", import.meta.url).href + "src/contratos.js");
const { preencher, MODELOS } = await import(new URL("../", import.meta.url).href + "src/contratos-modelos.js");
const emails = [];
globalThis.fetch = async (url, op) => {
  url = String(url);
  if (url.includes("api.resend.com")) { emails.push(JSON.parse(op.body)); return new Response("{}"); }
  throw new Error("fetch inesperado " + url);
};
env.RESEND_API_KEY = "re_teste";
const ultimoCodigo = () => { const e = emails.filter(x => /Seu código/.test(x.subject)).pop(); return e && e.subject.match(/(\d{6})/)[1]; };

confere("CPF válido aceito, inválido recusado", documentoValido("529.982.247-25") === "52998224725" && documentoValido("111.111.111-11") === null && documentoValido("529.982.247-24") === null, "");
confere("CNPJ válido aceito", documentoValido("11.222.333/0001-81") === "11222333000181" && documentoValido("11.222.333/0001-80") === null, "");
confere("preencher troca os campos e marca os vazios com ____", preencher("Olá {{cliente_nome}}, valor {{valor_total}}", { cliente_nome: "Ana" }) === "Olá Ana, valor ____", "");
confere("todos os modelos têm a cláusula de assinatura eletrônica", MODELOS.every(m => /MP 2\.200-2|Medida Provisória 2\.200-2/.test(m.texto)), "");

cookie = "";
await chamar("/api/register", { email: "foto@t.com", senha: "senha-forte-1", nome: "Fotógrafa", aceite: true });
const dono = cookie;
let r = await chamar("/api/contratos");
confere("sem estúdio criado, pede para criar a página", r.status === 400, r);
db.prepare("INSERT INTO portais (user_id, slug, nome, cor) VALUES (1, 'estudio-luz', 'Estúdio Luz', '#0d9488')").run();
r = await chamar("/api/contratos");
confere("lista os modelos prontos e os campos", r.dados.modelos.length >= 4 && r.dados.campos.length > 10 && r.dados.contratos.length === 0, r.dados);

const texto = preencher(MODELOS[0].texto, { cliente_nome: "Ana Souza", cliente_email: "ana@t.com", estudio_nome: "Estúdio Luz", valor_total: "R$ 3.000,00", qtd_fotos: "300", preco_foto_extra: "R$ 15,00" });
r = await chamar("/api/contratos/novo", { titulo: "Casamento - Ana", texto: "{{cliente_nome}} " + texto, destinatario_nome: "Ana Souza", destinatario_email: "ana@t.com" });
confere("recusa texto com campo {{ }} sem preencher", r.status === 400, r);
r = await chamar("/api/contratos/novo", { titulo: "Casamento - Ana", texto: texto, destinatario_nome: "Ana Souza", destinatario_email: "ana@t.com" });
confere("cria o contrato e manda o link por e-mail", r.status === 200 && /\/c\/[0-9a-f]{48}$/.test(r.dados.link) && emails.some(e => e.to[0] === "ana@t.com" && /Contrato para assinar/.test(e.subject)), r);
const id = r.dados.id;
const t = r.dados.link.split("/c/")[1];

// cliente
cookie = "";
r = await chamar("/api/c/info?t=" + t);
confere("cliente abre o contrato (status vira visto, e-mail aparece mascarado)", r.status === 200 && r.dados.status === "visto" && /^an\*+@t\.com$/.test(r.dados.email_mascarado) && /300 fotos/.test(r.dados.texto), r.dados);
r = await chamar("/api/c/info?t=" + "0".repeat(48));
confere("link errado não abre nada", r.status === 404, r.status);
r = await chamar("/api/c/codigo", { t, nome: "Ana Souza", cpf: "529.982.247-25", aceite: false });
confere("sem marcar 'li e concordo' não manda código", r.status === 400, r);
r = await chamar("/api/c/codigo", { t, nome: "Ana", cpf: "529.982.247-25", aceite: true });
confere("pede nome completo", r.status === 400, r);
r = await chamar("/api/c/codigo", { t, nome: "Ana Souza", cpf: "123.456.789-00", aceite: true });
confere("CPF inválido recusado", r.status === 400, r);
r = await chamar("/api/c/codigo", { t, nome: "Ana Souza", cpf: "529.982.247-25", aceite: true });
const cod = ultimoCodigo();
confere("código de 6 números vai para o e-mail do contrato", r.status === 200 && /^\d{6}$/.test(cod), r);
r = await chamar("/api/c/assinar", { t, nome: "Ana Souza", cpf: "529.982.247-25", codigo: cod === "000000" ? "111111" : "000000" });
confere("código errado não assina", r.status === 400, r);
emails.length = 0;
r = await chamar("/api/c/assinar", { t, nome: "Ana Souza", cpf: "529.982.247-25", codigo: cod }, { "CF-Connecting-IP": "200.1.2.3", "User-Agent": "Teste/1.0" });
confere("código certo assina e devolve o comprovante", r.status === 200 && r.dados.status === "assinado" && r.dados.assinatura.documento === "***.982.247-**" && /^[0-9a-f]{64}$/.test(r.dados.assinatura.hash), r.dados);
const c = db.prepare("SELECT * FROM contratos WHERE id = ?").get(id);
const esperado = createHash("sha256").update(c.texto).digest("hex");
confere("guarda IP, navegador, CPF e o SHA-256 do texto", c.assinado_ip === "200.1.2.3" && c.assinado_navegador === "Teste/1.0" && c.assinante_cpf === "52998224725" && c.documento_hash === esperado, c);
confere("cliente e fotógrafa recebem o comprovante por e-mail", emails.some(e => e.to[0] === "ana@t.com" && /assinado/.test(e.subject)) && emails.some(e => e.to[0] === "foto@t.com" && /assinou/.test(e.subject)), emails.map(e => e.to[0] + ": " + e.subject));
r = await chamar("/api/c/assinar", { t, nome: "Ana Souza", cpf: "529.982.247-25", codigo: cod });
confere("não assina duas vezes", r.status === 400, r);

// fotógrafa
cookie = dono;
r = await chamar("/api/contratos/cancelar", { id });
confere("contrato assinado não pode ser cancelado", r.status === 400, r);
r = await chamar("/api/contratos");
confere("lista mostra o contrato assinado com o link", r.dados.contratos[0].status === "assinado" && r.dados.contratos[0].link.includes("/c/") && !("token" in r.dados.contratos[0]), r.dados.contratos[0]);
r = await chamar("/api/contratos/modelos/salvar", { nome: "Meu casamento", texto: MODELOS[0].texto + "\n\n## Cláusula extra\n\nDrone incluso." });
confere("salva modelo próprio", r.status === 200, r);
r = await chamar("/api/contratos");
confere("modelo próprio aparece na lista", r.dados.meus.length === 1 && r.dados.meus[0].nome === "Meu casamento", r.dados.meus);

// outro fotógrafo não vê nada
cookie = "";
await chamar("/api/register", { email: "outro@t.com", senha: "senha-forte-1", nome: "Outro", aceite: true });
db.prepare("INSERT INTO portais (user_id, slug, nome, cor) VALUES (2, 'outro-est', 'Outro', '#000000')").run();
r = await chamar("/api/contratos/ver?id=" + id);
confere("outro fotógrafo não abre o contrato", r.status === 404, r.status);
r = await chamar("/api/contratos");
confere("outro fotógrafo não vê modelos nem contratos alheios", r.dados.contratos.length === 0 && r.dados.meus.length === 0, r.dados);

// cancelado: link para de funcionar
cookie = dono;
r = await chamar("/api/contratos/novo", { titulo: "Ensaio", texto: preencher(MODELOS[1].texto, { cliente_nome: "Bia" }), destinatario_nome: "Bia Lima", destinatario_email: "bia@t.com" });
const t2 = r.dados.link.split("/c/")[1];
await chamar("/api/contratos/cancelar", { id: r.dados.id });
cookie = "";
r = await chamar("/api/c/info?t=" + t2);
confere("contrato cancelado não abre mais", r.status === 410, r.status);

console.log(falhas ? "\n" + falhas + " FALHA(S)" : "\nTODOS OS TESTES PASSARAM");
process.exit(falhas ? 1 : 0);
