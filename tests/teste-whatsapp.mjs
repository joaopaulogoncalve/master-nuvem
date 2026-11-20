import { fileURLToPath } from "node:url";
// Robô do WhatsApp: webhook da Meta (simulada), respostas da faq, chamar o João e ficar quieto.
import { DatabaseSync } from "node:sqlite";
import { readFileSync, readdirSync } from "node:fs";
import { createHmac } from "node:crypto";

const RAIZ = fileURLToPath(new URL("../", import.meta.url)).replace(/\\/g, "/");
const worker = (await import(new URL("../", import.meta.url).href + "src/worker.js")).default;
const { buscarResposta, paraWhatsapp } = await import(new URL("../", import.meta.url).href + "src/whatsapp.js");

const db = new DatabaseSync(":memory:");
for (const m of readdirSync(RAIZ + "migrations").filter(f => f.endsWith(".sql")).sort()) db.exec(readFileSync(RAIZ + "migrations/" + m, "utf8"));

const DB = {
  prepare(sql) {
    let args = [];
    const st = {
      bind(...a) { args = a; return st; },
      async first() { return db.prepare(sql).get(...args) || null; },
      async run() { const r = db.prepare(sql).run(...args); return { meta: { changes: Number(r.changes), last_row_id: Number(r.lastInsertRowid) } }; },
      async all() { return { results: db.prepare(sql).all(...args) }; }
    };
    return st;
  }
};

const SEGREDO_APP = "segredo-do-app";
const env = {
  DB, ASSETS: { fetch: () => new Response("") }, RESEND_API_KEY: "re_teste",
  WHATSAPP_TOKEN: "token-teste", WHATSAPP_PHONE_ID: "123456", WHATSAPP_VERIFY_TOKEN: "palavra-secreta", META_APP_SECRET: SEGREDO_APP
};

const enviadas = [], emails = [];
globalThis.fetch = async (url, op) => {
  url = String(url);
  if (url.startsWith("https://graph.facebook.com/")) {
    if (!url.includes("/123456/messages")) throw new Error("número errado " + url);
    if (op.headers.Authorization !== "Bearer token-teste") throw new Error("sem token");
    enviadas.push(JSON.parse(op.body));
    return new Response(JSON.stringify({ messages: [{ id: "wamid.robo" + enviadas.length }] }));
  }
  if (url.includes("api.resend.com")) { emails.push(JSON.parse(op.body)); return new Response(JSON.stringify({ id: "e" })); }
  throw new Error("fetch inesperado " + url);
};

let falhas = 0;
function confere(cond, msg) { if (cond) console.log("  ok -", msg); else { falhas++; console.log("  FALHOU -", msg); } }

const BASE = "https://masternuvem.com.br";
let seq = 0;
async function aviso(corpo, assinatura) {
  const bruto = JSON.stringify(corpo);
  const sig = assinatura !== undefined ? assinatura : "sha256=" + createHmac("sha256", SEGREDO_APP).update(bruto).digest("hex");
  const h = { "Content-Type": "application/json" };
  if (sig) h["X-Hub-Signature-256"] = sig;
  const r = await worker.fetch(new Request(BASE + "/api/whatsapp/webhook", { method: "POST", headers: h, body: bruto }), env);
  return { status: r.status, json: await r.json().catch(() => null) };
}
function mensagem(de, texto, nome, id) {
  return { object: "whatsapp_business_account", entry: [{ id: "WABA", changes: [{ field: "messages", value: {
    messaging_product: "whatsapp", metadata: { phone_number_id: "123456" },
    contacts: [{ wa_id: de, profile: { name: nome || "Maria Souza" } }],
    messages: [{ from: de, id: id || "wamid.in" + (++seq), timestamp: "1", type: "text", text: { body: texto } }] } }] }] };
}
const ultima = () => enviadas[enviadas.length - 1];

console.log("Teste do robô do WhatsApp");

// 1) Ligação do webhook (a Meta confere a palavra secreta)
let r = await worker.fetch(new Request(BASE + "/api/whatsapp/webhook?hub.mode=subscribe&hub.verify_token=palavra-secreta&hub.challenge=999"), env);
confere(r.status === 200 && (await r.text()) === "999", "Meta liga o webhook com a palavra certa");
r = await worker.fetch(new Request(BASE + "/api/whatsapp/webhook?hub.mode=subscribe&hub.verify_token=errada&hub.challenge=999"), env);
confere(r.status === 403, "palavra errada é recusada");

// 2) Assinatura
let a = await aviso(mensagem("5562911110000", "quanto custa?"), "sha256=" + "0".repeat(64));
confere(a.status === 401 && enviadas.length === 0, "aviso com assinatura falsa é recusado e nada é enviado");
a = await aviso(mensagem("5562911110000", "quanto custa?"), "");
confere(a.status === 401, "aviso sem assinatura é recusado");

// 3) Pergunta conhecida → resposta da faq, com saudação na primeira vez
a = await aviso(mensagem("5562911110000", "Quanto custa 1 TB?"));
confere(a.status === 200 && a.json.resultados[0] === "faq", "pergunta de preço acha resposta na faq");
confere(ultima().to === "5562911110000" && /Oi, Maria!/.test(ultima().text.body), "responde no número certo e cumprimenta pelo nome");
confere(!/\]\(|\*\*/.test(ultima().text.body), "resposta sem marcação do site ([..](..) e **)");
confere(/atendente/.test(ultima().text.body), "ensina a pedir atendente");

a = await aviso(mensagem("5562911110000", "vocês fazem sites?"));
confere(a.json.resultados[0] === "faq" && !/Oi, Maria/.test(ultima().text.body), "segunda pergunta não repete a saudação");
confere(/masternuvem\.com\.br\/sites/.test(ultima().text.body) || /site/i.test(ultima().text.body), "responde sobre criação de sites");

// 4) Mesmo aviso repetido pela Meta → não responde de novo
const antes = enviadas.length;
a = await aviso(mensagem("5562911110000", "Quanto custa 1 TB?", null, "wamid.repetido"));
a = await aviso(mensagem("5562911110000", "Quanto custa 1 TB?", null, "wamid.repetido"));
confere(enviadas.length === antes + 1 && a.json.resultados[0] === "repetida", "mensagem repetida pela Meta é respondida uma vez só");

// 5) Não sabe → chama o João por e-mail e fica quieto
a = await aviso(mensagem("5562922220000", "qual a cor do cavalo branco de napoleao", "Pedro"));
confere(a.json.resultados[0] === "joao", "pergunta desconhecida chama o João");
confere(emails.length === 1 && emails[0].to.includes("contato@masternuvem.com.br") && /wa\.me\/5562922220000/.test(emails[0].html), "e-mail para contato@ com o link do WhatsApp da pessoa");
const qtd = enviadas.length;
a = await aviso(mensagem("5562922220000", "quanto custa?", "Pedro"));
confere(a.json.resultados[0] === "joao-atendendo" && enviadas.length === qtd, "depois de chamar o João, o robô fica quieto");

// 5b) Cumprimento recebe menu (não chama o João); "como pago?" acha a resposta de pagamento
const emailsAntes = emails.length;
a = await aviso(mensagem("5562988880000", "Bom dia! tudo bem?", "Lia"));
confere(a.json.resultados[0] === "ok" && /Posso te ajudar com/.test(ultima().text.body) && emails.length === emailsAntes, "\"bom dia\" recebe o menu e não incomoda o João");
a = await aviso(mensagem("5562988880000", "oi 👋", "Lia"));
confere(/Posso te ajudar com/.test(ultima().text.body), "\"oi\" com emoji também recebe o menu");
a = await aviso(mensagem("5562988880000", "como pago?", "Lia"));
confere(a.json.resultados[0] === "faq" && /pix/i.test(ultima().text.body), "\"como pago?\" responde sobre pagamento");
a = await aviso(mensagem("5562988880000", "obrigada!", "Lia"));
confere(/Por nada/.test(ultima().text.body), "agradecimento recebe \"por nada\"");

// 6) Pede atendente
a = await aviso(mensagem("5562933330000", "quero falar com um atendente", "Ana"));
confere(a.json.resultados[0] === "joao" && /chamei o João/.test(ultima().text.body), "\"atendente\" chama o João");

// 7) O João respondeu pelo celular (coexistência): robô sai da conversa
await aviso({ object: "whatsapp_business_account", entry: [{ changes: [{ field: "smb_message_echoes", value: {
  message_echoes: [{ from: "5562982846067", to: "5562944440000", id: "wamid.eco1", type: "text", text: { body: "Oi! Sou o João" } }] } }] }] });
const qtd2 = enviadas.length;
a = await aviso(mensagem("5562944440000", "quanto custa 1 TB?", "Bia"));
confere(a.json.resultados[0] === "joao-atendendo" && enviadas.length === qtd2, "quando o João responde pelo app, o robô não se mete");

// 8) Áudio/foto → pede texto
a = await aviso({ object: "whatsapp_business_account", entry: [{ changes: [{ field: "messages", value: {
  contacts: [{ wa_id: "5562955550000", profile: { name: "Caio" } }],
  messages: [{ from: "5562955550000", id: "wamid.audio1", type: "audio", audio: { id: "x" } }] } }] }] });
confere(a.json.resultados[0] === "nao-texto" && /só entendo mensagens de texto/.test(ultima().text.body), "áudio recebe pedido para escrever");

// 9) Limite por número
for (let i = 0; i < 20; i++) await aviso(mensagem("5562966660000", "quanto custa 1 TB?", "Robo"));
const doRobo = db.prepare("SELECT COUNT(*) AS n FROM whatsapp_mensagens WHERE telefone = '5562966660000' AND direcao = 'robo'").get().n;
confere(doRobo === 15, "no máximo 15 respostas por hora para o mesmo número (foram " + doRobo + ")");

// 10) Funções de texto
confere(paraWhatsapp("Veja [os planos](/sites) e **já**") === "Veja os planos: https://masternuvem.com.br/sites e *já*", "converte link e negrito para o WhatsApp");
confere(buscarResposta([{ id: 1, pergunta: "Tem WhatsApp?", palavras: "whatsapp,zap" }], "vcs tem zap?").id === 1, "busca igual à do chat do site");

// 11) Sem os segredos: não quebra
const envSem = Object.assign({}, env, { WHATSAPP_TOKEN: "" });
const bruto = JSON.stringify(mensagem("5562977770000", "oi"));
r = await worker.fetch(new Request(BASE + "/api/whatsapp/webhook", { method: "POST", body: bruto,
  headers: { "X-Hub-Signature-256": "sha256=" + createHmac("sha256", SEGREDO_APP).update(bruto).digest("hex") } }), envSem);
confere(r.status === 200, "sem token configurado responde 200 para a Meta e não tenta enviar");
const envSemSegredo = Object.assign({}, env, { META_APP_SECRET: "" });
r = await worker.fetch(new Request(BASE + "/api/whatsapp/webhook", { method: "POST", body: bruto, headers: { "X-Hub-Signature-256": "sha256=abc" } }), envSemSegredo);
confere(r.status === 401, "sem META_APP_SECRET nada é aceito");

if (falhas) { console.log(falhas + " falha(s)"); process.exit(1); }
console.log("TODOS OS TESTES DO WHATSAPP PASSARAM");
