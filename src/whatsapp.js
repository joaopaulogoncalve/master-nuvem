// Robô do WhatsApp (API oficial da Meta, "WhatsApp Cloud API").
// A Meta avisa cada mensagem recebida em /api/whatsapp/webhook; a Nuvenzinha procura a resposta na tabela faq
// (as mesmas respostas do chat do site) e responde pelo número da Master Nuvem.
// Quando não sabe, ou quando a pessoa pede "atendente", avisa o João por e-mail e fica quieta por algumas horas.
// Se o João responder pelo celular (app WhatsApp Business no mesmo número), o robô também fica quieto.
//
// Segredos (Cloudflare → Variables and Secrets; só os NOMES ficam aqui):
//   WHATSAPP_TOKEN         token de acesso do usuário do sistema (Meta Business)
//   WHATSAPP_PHONE_ID      id do número na Meta (não é o telefone)
//   WHATSAPP_VERIFY_TOKEN  palavra que a Meta manda ao ligar o webhook
//   META_APP_SECRET        chave secreta do app na Meta (confere a assinatura de cada aviso)

const GRAPH = "https://graph.facebook.com/v21.0/";
const SITE = "https://masternuvem.com.br";
const HORAS_HUMANO = 12;              // o robô fica quieto esse tempo depois de chamar o João
const MAX_RESPOSTAS_HORA = 15;        // por número: evita conversa infinita com outro robô
const PEDE_PESSOA = /\b(atendente|humano|pessoa|joao|falar com alguem|falar com voce|suporte)\b/;
// Só um cumprimento ("oi", "bom dia, tudo bem?"): responde com o menu em vez de chamar o João.
const SO_CUMPRIMENTO = /^(oi+|ola|opa|e ai|eai|bom dia|boa tarde|boa noite|tudo bem|tudo bom|td bem|blz|beleza|alo|hello|hi|salve|ok|obrigad[oa]|valeu|vlw|[\s,!.?]|\p{Extended_Pictographic})+$/u;
const MENU = "Posso te ajudar com:\n" +
  "☁️ *Preço* do espaço na nuvem (ex.: \"quanto custa 1 TB?\")\n" +
  "🆓 *Teste grátis* de 24 horas\n" +
  "📸 *Portal do cliente* para fotógrafos\n" +
  "🌐 *Criação de sites* para empresas\n\n" +
  "É só escrever a sua dúvida. Para falar com o João, escreva *atendente*.";

const IGNORAR = { como: 1, para: 1, voce: 1, voces: 1, minha: 1, meus: 1, minhas: 1, posso: 1, quero: 1, sobre: 1, esta: 1, isso: 1, qual: 1, quais: 1, onde: 1, porque: 1, quando: 1, tenho: 1, nuvem: 1, master: 1 };

function semAcento(t) {
  return String(t || "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
}

// A mesma busca do chat do site (public/assistente.js): palavras-chave valem mais; palavras da pergunta ajudam.
export function buscarResposta(faq, texto) {
  const t = " " + semAcento(texto).replace(/[^a-z0-9,\s]/g, " ").replace(/\s+/g, " ") + " ";
  const palavrasT = t.split(" ").filter(function (p) { return p.length > 3 && !IGNORAR[p]; });
  let melhor = null;
  faq.forEach(function (f) {
    let pontos = 0;
    String(f.palavras || "").split(",").forEach(function (k) {
      k = k.trim();
      if (k.length > 1 && t.indexOf(" " + k) > -1) pontos += k.indexOf(" ") > -1 ? 3 : 2;
    });
    const doTitulo = semAcento(f.pergunta).replace(/[^a-z0-9\s]/g, " ").split(/\s+/);
    palavrasT.forEach(function (p) { if (doTitulo.indexOf(p) > -1) pontos += 1; });
    if (pontos >= 2 && (!melhor || pontos > melhor.pontos)) melhor = { f: f, pontos: pontos };
  });
  return melhor ? melhor.f : null;
}

// Respostas do site usam [texto](/caminho) e **negrito**; no WhatsApp vira "texto: https://..." e *negrito*.
export function paraWhatsapp(texto) {
  return String(texto || "")
    .replace(/\[([^\]]+)\]\(mailto:([^)\s]+)\)/g, "$1: $2")
    .replace(/\[([^\]]+)\]\((\/[^)\s]*)\)/g, function (_, t, c) { return t + ": " + SITE + c; })
    .replace(/\*\*([^*]+)\*\*/g, "*$1*");
}

function hex(buf) {
  return Array.from(new Uint8Array(buf)).map(function (b) { return b.toString(16).padStart(2, "0"); }).join("");
}

function iguais(a, b) {
  if (a.length !== b.length) return false;
  let d = 0;
  for (let i = 0; i < a.length; i++) d |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return d === 0;
}

async function assinaturaOk(env, corpo, cabecalho) {
  if (!env.META_APP_SECRET || !cabecalho || !cabecalho.startsWith("sha256=")) return false;
  const chave = await crypto.subtle.importKey("raw", new TextEncoder().encode(env.META_APP_SECRET),
    { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const esperado = hex(await crypto.subtle.sign("HMAC", chave, new TextEncoder().encode(corpo)));
  return iguais(esperado, cabecalho.slice(7).toLowerCase());
}

async function enviar(env, para, texto) {
  const r = await fetch(GRAPH + env.WHATSAPP_PHONE_ID + "/messages", {
    method: "POST",
    headers: { "Authorization": "Bearer " + env.WHATSAPP_TOKEN, "Content-Type": "application/json" },
    body: JSON.stringify({ messaging_product: "whatsapp", to: para, type: "text", text: { body: texto.slice(0, 4000), preview_url: true } })
  });
  if (!r.ok) console.error("WhatsApp: erro ao enviar", r.status, (await r.text()).slice(0, 300));
  return r.ok;
}

async function guardar(env, wamid, telefone, direcao, texto, faqId) {
  const r = await env.DB.prepare(
    "INSERT OR IGNORE INTO whatsapp_mensagens (wamid, telefone, direcao, texto, faq_id) VALUES (?, ?, ?, ?, ?)"
  ).bind(wamid, telefone, direcao, texto ? String(texto).slice(0, 2000) : null, faqId || null).run();
  return r.meta.changes > 0;
}

function formatarTelefone(t) {
  const m = String(t).match(/^55(\d{2})(\d{4,5})(\d{4})$/);
  return m ? "(" + m[1] + ") " + m[2] + "-" + m[3] : "+" + t;
}

async function chamarJoao(env, f, telefone, nome, texto, motivo) {
  await env.DB.prepare("UPDATE whatsapp_conversas SET humano_ate = datetime('now', '+" + HORAS_HUMANO + " hours') WHERE telefone = ?").bind(telefone).run();
  const link = "https://wa.me/" + telefone;
  const html = "<p><strong>" + f.escaparHtml(motivo) + "</strong></p><p>Nome no WhatsApp: " + f.escaparHtml(nome || "-") +
    "<br>Número: <a href=\"" + link + "\">" + formatarTelefone(telefone) + "</a></p><p style=\"white-space:pre-line\">" +
    f.escaparHtml(texto) + "</p><p>O robô fica quieto nessa conversa por " + HORAS_HUMANO + " horas. Responda em <a href=\"" + SITE + "/admin?secao=WhatsApp\">" +
    SITE.replace("https://", "") + "/admin → 💬 WhatsApp</a> (de graça até 24 horas depois da última mensagem da pessoa).</p>";
  await f.enviarEmail(env, f.EMAIL_SUPORTE, "WhatsApp: " + (nome || formatarTelefone(telefone)) + " precisa de você", html,
    motivo + "\nNome: " + (nome || "-") + "\nNúmero: " + formatarTelefone(telefone) + " (" + link + ")\n\n" + texto);
}

async function responder(env, f, telefone, nome, texto) {
  // Limite por número (cada resposta do robô conta).
  const n = await env.DB.prepare(
    "SELECT COUNT(*) AS n FROM whatsapp_mensagens WHERE telefone = ? AND direcao = 'robo' AND created_at > datetime('now', '-1 hour')"
  ).bind(telefone).first();
  if (n && n.n >= MAX_RESPOSTAS_HORA) return "limite";

  const primeiro = nome ? nome.split(" ")[0] : "";
  const ja = await env.DB.prepare(
    "SELECT COUNT(*) AS n FROM whatsapp_mensagens WHERE telefone = ? AND direcao = 'robo' AND created_at > datetime('now', '-1 day')"
  ).bind(telefone).first();
  const ola = ja && ja.n > 0 ? "" : "Oi" + (primeiro ? ", " + primeiro : "") + "! Aqui é a Nuvenzinha, a assistente da Master Nuvem ☁️\n\n";

  let saida, faqId = null, chamou = null;
  const limpo = semAcento(texto).trim();
  if (/^(obrigad[oa]|valeu|vlw)/.test(limpo) && SO_CUMPRIMENTO.test(limpo)) {
    saida = "Por nada! Qualquer coisa é só chamar 😊";
  } else if (SO_CUMPRIMENTO.test(limpo)) {
    saida = (ola || "Oi" + (primeiro ? ", " + primeiro : "") + "! ") + MENU;
  } else if (PEDE_PESSOA.test(limpo)) {
    saida = ola + "Certo! Já chamei o João, ele responde por aqui assim que puder (normalmente no mesmo dia, em dias úteis).";
    chamou = "Pediu para falar com uma pessoa";
  } else {
    const faq = (await env.DB.prepare("SELECT id, pergunta, palavras, resposta FROM faq WHERE ativo = 1 ORDER BY ordem, id").all()).results;
    const achou = buscarResposta(faq, texto);
    if (achou) {
      faqId = achou.id;
      saida = ola + paraWhatsapp(achou.resposta) + "\n\nSe quiser falar com uma pessoa, é só escrever *atendente*.";
    } else {
      saida = ola + "Essa eu ainda não sei responder 😅 Já passei a sua mensagem para o João, ele responde por aqui assim que puder.";
      chamou = "A Nuvenzinha não soube responder";
    }
  }
  await enviar(env, telefone, saida);
  await guardar(env, null, telefone, "robo", saida, faqId);
  if (chamou) await chamarJoao(env, f, telefone, nome, texto, chamou);
  return chamou ? "joao" : faqId ? "faq" : "ok";
}

/* ---------- /admin: o João lê e responde pelo site (o número não fica mais no app do celular) ---------- */

// Último texto, quem mandou e se a pessoa ainda está dentro das 24 h (fora disso a Meta só aceita modelo pago).
const SQL_CONVERSAS =
  "SELECT c.telefone, c.nome, c.ultima_em, c.humano_ate, (c.humano_ate > datetime('now')) AS humano, " +
  "(SELECT texto FROM whatsapp_mensagens m WHERE m.telefone = c.telefone ORDER BY m.id DESC LIMIT 1) AS ultima_texto, " +
  "(SELECT direcao FROM whatsapp_mensagens m WHERE m.telefone = c.telefone ORDER BY m.id DESC LIMIT 1) AS ultima_direcao, " +
  "((SELECT MAX(created_at) FROM whatsapp_mensagens m WHERE m.telefone = c.telefone AND m.direcao = 'entrada') > datetime('now', '-24 hours')) AS pode_responder " +
  "FROM whatsapp_conversas c ORDER BY c.ultima_em DESC LIMIT 100";

function telefoneOk(t) { return /^\d{10,15}$/.test(String(t || "")); }

export async function tratarAdminWhatsapp(request, env, url, f) {
  const caminho = url.pathname;
  if (request.method === "GET" && caminho === "/api/admin/whatsapp") {
    const r = await env.DB.prepare(SQL_CONVERSAS).all();
    const conversas = r.results.map(function (c) {
      c.humano = !!c.humano; c.pode_responder = !!c.pode_responder;
      // Esperando o João: ele foi chamado e a última mensagem é da pessoa.
      c.esperando = c.humano && c.ultima_direcao === "entrada";
      c.telefone_br = formatarTelefone(c.telefone);
      return c;
    });
    return f.resposta({ configurado: !!(env.WHATSAPP_TOKEN && env.WHATSAPP_PHONE_ID), conversas: conversas }, 200);
  }
  if (request.method === "GET" && caminho === "/api/admin/whatsapp/conversa") {
    const tel = url.searchParams.get("tel");
    if (!telefoneOk(tel)) return f.resposta({ error: "Número inválido" }, 400);
    const r = await env.DB.prepare(
      "SELECT direcao, texto, created_at FROM (SELECT * FROM whatsapp_mensagens WHERE telefone = ? ORDER BY id DESC LIMIT 100) ORDER BY id"
    ).bind(tel).all();
    return f.resposta({ mensagens: r.results }, 200);
  }

  if (request.method !== "POST") return f.resposta({ error: "Método não permitido" }, 405);
  if (!f.origemOk(request, url)) return f.resposta({ error: "Origem inválida" }, 403);
  const corpo = await f.lerJson(request);
  if (!corpo || !telefoneOk(corpo.telefone)) return f.resposta({ error: "Número inválido" }, 400);
  const conversa = await env.DB.prepare(SQL_CONVERSAS.replace("ORDER BY c.ultima_em DESC LIMIT 100", "WHERE c.telefone = ?")).bind(corpo.telefone).first();
  if (!conversa) return f.resposta({ error: "Conversa não encontrada" }, 404);

  if (caminho === "/api/admin/whatsapp/responder") {
    const texto = String(corpo.texto || "").replace(/\r/g, "").trim().slice(0, 4000);
    if (texto.length < 1) return f.resposta({ error: "Escreva a resposta" }, 400);
    if (!conversa.pode_responder) {
      return f.resposta({ error: "Já passaram 24 horas da última mensagem dessa pessoa. A Meta só deixa responder de graça dentro de 24 horas: peça para ela mandar uma mensagem de novo (ex.: pelo link wa.me) ou ligue." }, 409);
    }
    if (!env.WHATSAPP_TOKEN || !env.WHATSAPP_PHONE_ID) return f.resposta({ error: "O robô ainda não está ligado na Meta." }, 503);
    if (!(await enviar(env, corpo.telefone, texto))) return f.resposta({ error: "A Meta não aceitou a mensagem. Tente de novo em instantes." }, 502);
    await guardar(env, null, corpo.telefone, "joao", texto, null);
    // O João assumiu: o robô fica quieto nessa conversa.
    await env.DB.prepare("UPDATE whatsapp_conversas SET humano_ate = datetime('now', '+" + HORAS_HUMANO + " hours'), ultima_em = datetime('now') WHERE telefone = ?").bind(corpo.telefone).run();
    return f.resposta({ ok: true }, 200);
  }

  if (caminho === "/api/admin/whatsapp/robo") {
    // ligado = o robô volta a responder agora; desligado = fica quieto por HORAS_HUMANO horas.
    await env.DB.prepare("UPDATE whatsapp_conversas SET humano_ate = " + (corpo.ligado ? "NULL" : "datetime('now', '+" + HORAS_HUMANO + " hours')") + " WHERE telefone = ?").bind(corpo.telefone).run();
    return f.resposta({ ok: true }, 200);
  }
  return f.resposta({ error: "Rota não encontrada" }, 404);
}

// f = ferramentas do worker: { resposta, enviarEmail, escaparHtml, EMAIL_SUPORTE }
export async function tratarWhatsapp(request, env, url, f) {
  // 1) A Meta confirma o endereço do webhook (uma vez, ao ligar).
  if (request.method === "GET") {
    const p = url.searchParams;
    if (p.get("hub.mode") === "subscribe" && env.WHATSAPP_VERIFY_TOKEN && p.get("hub.verify_token") === env.WHATSAPP_VERIFY_TOKEN) {
      return new Response(p.get("hub.challenge") || "", { status: 200, headers: { "Content-Type": "text/plain" } });
    }
    return new Response("Proibido", { status: 403 });
  }
  if (request.method !== "POST") return f.resposta({ error: "Método não permitido" }, 405);

  // 2) Cada aviso vem assinado com a chave secreta do app; sem assinatura certa, ignora.
  const bruto = await request.text();
  if (!(await assinaturaOk(env, bruto, request.headers.get("X-Hub-Signature-256")))) {
    return f.resposta({ error: "Assinatura inválida" }, 401);
  }
  let corpo;
  try { corpo = JSON.parse(bruto); } catch (e) { return f.resposta({ ok: true }, 200); }
  if (!env.WHATSAPP_TOKEN || !env.WHATSAPP_PHONE_ID) {
    console.error("WhatsApp: falta WHATSAPP_TOKEN ou WHATSAPP_PHONE_ID");
    return f.resposta({ ok: true }, 200);
  }

  const resultados = [];
  for (const entrada of corpo.entry || []) {
    for (const mudanca of entrada.changes || []) {
      const v = mudanca.value || {};

      // O João respondeu pelo celular (app no mesmo número): o robô sai da conversa.
      if (mudanca.field === "smb_message_echoes") {
        for (const eco of v.message_echoes || []) {
          if (!eco.to) continue;
          await guardar(env, eco.id || null, eco.to, "joao", eco.text ? eco.text.body : null, null);
          await env.DB.prepare(
            "INSERT INTO whatsapp_conversas (telefone, humano_ate) VALUES (?, datetime('now', '+" + HORAS_HUMANO + " hours')) " +
            "ON CONFLICT(telefone) DO UPDATE SET humano_ate = excluded.humano_ate, ultima_em = datetime('now')"
          ).bind(eco.to).run();
          resultados.push("eco");
        }
        continue;
      }
      if (mudanca.field !== "messages") continue;

      const nomes = {};
      (v.contacts || []).forEach(function (c) { nomes[c.wa_id] = c.profile && c.profile.name ? String(c.profile.name).slice(0, 80) : null; });

      for (const m of v.messages || []) {
        const telefone = String(m.from || "").replace(/\D/g, "");
        if (!telefone) continue;
        const texto = m.type === "text" && m.text ? String(m.text.body || "").slice(0, 2000)
          : m.type === "button" && m.button ? String(m.button.text || "")
          : m.type === "interactive" && m.interactive ? String((m.interactive.button_reply || m.interactive.list_reply || {}).title || "")
          : "";
        // A Meta pode mandar o mesmo aviso de novo: mensagem já guardada = já respondida.
        if (!(await guardar(env, m.id || null, telefone, "entrada", texto || "[" + m.type + "]", null))) { resultados.push("repetida"); continue; }

        const nome = nomes[telefone] || null;
        await env.DB.prepare(
          "INSERT INTO whatsapp_conversas (telefone, nome) VALUES (?, ?) " +
          "ON CONFLICT(telefone) DO UPDATE SET nome = COALESCE(excluded.nome, whatsapp_conversas.nome), ultima_em = datetime('now')"
        ).bind(telefone, nome).run();
        const conversa = await env.DB.prepare(
          "SELECT humano_ate > datetime('now') AS quieto FROM whatsapp_conversas WHERE telefone = ?"
        ).bind(telefone).first();
        if (conversa && conversa.quieto) { resultados.push("joao-atendendo"); continue; }

        if (!texto.trim()) {
          await enviar(env, telefone, "Por enquanto eu só entendo mensagens de texto 🙂 Escreva a sua dúvida (ex.: \"quanto custa 1 TB?\") ou *atendente* para falar com o João.");
          await guardar(env, null, telefone, "robo", "[só texto]", null);
          resultados.push("nao-texto");
          continue;
        }
        resultados.push(await responder(env, f, telefone, nome, texto));
      }
    }
  }
  return f.resposta({ ok: true, resultados: resultados }, 200);
}
