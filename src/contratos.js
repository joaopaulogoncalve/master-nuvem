// Contratos com assinatura eletrônica simples.
// /api/contratos*  → o fotógrafo vê os modelos, cria o contrato (texto já preenchido), envia e acompanha.
// /api/c/*         → o cliente abre o link /c/<token>, lê, informa nome e CPF e assina com o código que chega no e-mail dele.
// O comprovante guarda data, IP, navegador, e-mail confirmado e o SHA-256 do texto assinado.
import { chaveIp, dentroDoLimite } from "./limite.js";
import { MODELOS, CAMPOS } from "./contratos-modelos.js";

const enc = new TextEncoder();
const EMAIL_OK = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const REMETENTE = "Master Nuvem <nao-responda@masternuvem.com.br>";
const SITE = "https://masternuvem.com.br";
const MINUTOS_CODIGO = 15;
const MAX_CODIGOS = 6;          // por contrato
const MAX_TENTATIVAS = 5;       // por código
const MAX_CODIGOS_IP_HORA = 10;
const MAX_TEXTO = 40000;

function resp(obj, status) {
  return new Response(JSON.stringify(obj), { status: status, headers: { "Content-Type": "application/json" } });
}
function paraHex(buf) {
  return Array.from(new Uint8Array(buf)).map(function (b) { return b.toString(16).padStart(2, "0"); }).join("");
}
async function sha256Hex(txt) {
  return paraHex(await crypto.subtle.digest("SHA-256", enc.encode(txt)));
}
function lerCookie(request, nome) {
  for (const p of (request.headers.get("Cookie") || "").split(";")) {
    const i = p.indexOf("=");
    if (i > -1 && p.slice(0, i).trim() === nome) return p.slice(i + 1).trim();
  }
  return null;
}
function origemOk(request, url) {
  const o = request.headers.get("Origin");
  return !o || o === url.origin;
}
async function lerJson(request) {
  try { return await request.json(); } catch (e) { return null; }
}
function texto(v, max) {
  return String(v || "").replace(/[\u0000-\u001f]/g, " ").trim().slice(0, max);
}
function textoLongo(v, max) {
  return String(v || "").replace(/\r\n/g, "\n").replace(/[\u0000-\u0008\u000b-\u001f]/g, " ").slice(0, max);
}
function escaparHtml(t) {
  return String(t).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}
function dataHoraBr(t) {
  const d = new Date(String(t).replace(" ", "T") + "Z");
  return d.toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo", day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" });
}

// CPF (11) ou CNPJ (14) com dígitos verificadores. Devolve só os números, ou null.
export function documentoValido(v) {
  const d = String(v || "").replace(/\D/g, "");
  if (d.length === 11) {
    if (/^(\d)\1{10}$/.test(d)) return null;
    for (const n of [9, 10]) {
      let s = 0;
      for (let i = 0; i < n; i++) s += parseInt(d[i], 10) * (n + 1 - i);
      const dv = (s * 10) % 11 % 10;
      if (dv !== parseInt(d[n], 10)) return null;
    }
    return d;
  }
  if (d.length === 14) {
    if (/^(\d)\1{13}$/.test(d)) return null;
    const pesos = [6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2];
    for (const n of [12, 13]) {
      let s = 0;
      for (let i = 0; i < n; i++) s += parseInt(d[i], 10) * pesos[i + (13 - n)];
      const r = s % 11, dv = r < 2 ? 0 : 11 - r;
      if (dv !== parseInt(d[n], 10)) return null;
    }
    return d;
  }
  return null;
}
function documentoMascarado(d) {
  if (!d) return "";
  return d.length === 11 ? "***." + d.slice(3, 6) + "." + d.slice(6, 9) + "-**" : d.slice(0, 2) + ".***.***/" + d.slice(8, 12) + "-**";
}
function emailMascarado(e) {
  const [a, b] = String(e).split("@");
  return (a.length <= 2 ? a[0] + "*" : a.slice(0, 2) + "***") + "@" + b;
}

async function enviarEmail(env, para, assunto, paragrafos, botao) {
  if (!env.RESEND_API_KEY) {
    console.error("RESEND_API_KEY ausente; e-mail não enviado:", assunto);
    return false;
  }
  const html = "<div style=\"font-family:Arial,sans-serif;max-width:520px;margin:auto;color:#0f172a\">" +
    "<h2 style=\"color:#0ea5e9\">Master Nuvem</h2>" + paragrafos.map(function (p) { return "<p>" + escaparHtml(p).replace(/\n/g, "<br>") + "</p>"; }).join("") +
    (botao ? "<p style=\"margin:28px 0\"><a href=\"" + escaparHtml(botao.link) + "\" style=\"background:#0ea5e9;color:#fff;padding:12px 22px;border-radius:10px;text-decoration:none;font-weight:bold\">" + escaparHtml(botao.texto) + "</a></p>" : "") +
    "</div>";
  const textoPuro = paragrafos.join("\n\n") + (botao ? "\n\n" + botao.texto + ": " + botao.link : "") + "\n\nMaster Nuvem";
  try {
    const r = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { "Authorization": "Bearer " + env.RESEND_API_KEY, "Content-Type": "application/json" },
      body: JSON.stringify({ from: REMETENTE, to: [para], subject: assunto, html: html, text: textoPuro })
    });
    if (!r.ok) console.error("Resend recusou o e-mail:", r.status, (await r.text()).slice(0, 200));
    return r.ok;
  } catch (e) {
    console.error("Falha ao enviar e-mail:", e.message);
    return false;
  }
}

async function usuarioLogado(request, env) {
  const token = lerCookie(request, "sessao");
  if (!token) return null;
  return await env.DB.prepare(
    "SELECT u.id, u.email FROM sessions s JOIN users u ON u.id = s.user_id WHERE s.token_hash = ? AND s.pending = 0 AND s.expires_at > datetime('now')"
  ).bind(await sha256Hex(token)).first();
}

function linkContrato(token) {
  return SITE + "/c/" + token;
}

async function emailParaAssinar(env, c, estudio) {
  return await enviarEmail(env, c.destinatario_email, "Contrato para assinar: " + c.titulo, [
    "Olá, " + c.destinatario_nome.split(" ")[0] + "!",
    estudio + " enviou o contrato \"" + c.titulo + "\" para você ler e assinar online.",
    "É rápido: abra o link, leia com calma, informe seu nome e CPF e confirme com o código que vamos mandar para este e-mail."
  ], { texto: "Ler e assinar o contrato", link: linkContrato(c.token) });
}

/* ---------- fotógrafo ---------- */

export async function tratarContratosDono(request, env, url) {
  const caminho = url.pathname;
  const u = await usuarioLogado(request, env);
  if (!u) return resp({ error: "Não autenticado" }, 401);
  const portal = await env.DB.prepare("SELECT id, nome FROM portais WHERE user_id = ?").bind(u.id).first();
  if (!portal) return resp({ error: "Crie primeiro a sua página em Meu estúdio" }, 400);

  if (caminho === "/api/contratos" && request.method === "GET") {
    const meus = await env.DB.prepare("SELECT id, nome, texto, updated_at FROM contrato_modelos WHERE portal_id = ? ORDER BY nome").bind(portal.id).all();
    const lista = await env.DB.prepare(
      "SELECT c.id, c.titulo, c.status, c.destinatario_nome, c.destinatario_email, c.created_at, c.visto_em, c.assinado_em, c.token, c.album_id, c.obrigatorio, " +
      "c.cliente_id FROM contratos c WHERE c.portal_id = ? ORDER BY c.id DESC LIMIT 200"
    ).bind(portal.id).all();
    return resp({
      modelos: MODELOS.map(function (m) { return { id: m.id, nome: m.nome, texto: m.texto }; }),
      meus: meus.results, campos: CAMPOS,
      contratos: lista.results.map(function (c) { c.link = linkContrato(c.token); delete c.token; return c; })
    }, 200);
  }

  if (caminho === "/api/contratos/ver" && request.method === "GET") {
    const c = await env.DB.prepare("SELECT * FROM contratos WHERE id = ? AND portal_id = ?").bind(parseInt(url.searchParams.get("id"), 10) || 0, portal.id).first();
    if (!c) return resp({ error: "Contrato não encontrado" }, 404);
    c.link = linkContrato(c.token);
    delete c.token; delete c.codigo_hash;
    return resp({ contrato: c }, 200);
  }

  if (request.method !== "POST") return resp({ error: "Método não permitido" }, 405);
  if (!origemOk(request, url)) return resp({ error: "Origem inválida" }, 403);
  const corpo = await lerJson(request);
  if (!corpo) return resp({ error: "JSON inválido" }, 400);

  if (caminho === "/api/contratos/modelos/salvar") {
    const nome = texto(corpo.nome, 80);
    const t = textoLongo(corpo.texto, MAX_TEXTO);
    if (nome.length < 3) return resp({ error: "Dê um nome ao modelo" }, 400);
    if (t.trim().length < 50) return resp({ error: "O texto do modelo está muito curto" }, 400);
    const id = parseInt(corpo.id, 10) || 0;
    if (id) {
      const r = await env.DB.prepare("UPDATE contrato_modelos SET nome = ?, texto = ?, updated_at = datetime('now') WHERE id = ? AND portal_id = ?").bind(nome, t, id, portal.id).run();
      if (!r.meta.changes) return resp({ error: "Modelo não encontrado" }, 404);
      return resp({ ok: true, id: id }, 200);
    }
    const n = await env.DB.prepare("SELECT COUNT(*) AS n FROM contrato_modelos WHERE portal_id = ?").bind(portal.id).first();
    if (n.n >= 50) return resp({ error: "Limite de 50 modelos" }, 400);
    const r = await env.DB.prepare("INSERT INTO contrato_modelos (portal_id, nome, texto) VALUES (?, ?, ?)").bind(portal.id, nome, t).run();
    return resp({ ok: true, id: r.meta.last_row_id }, 200);
  }

  if (caminho === "/api/contratos/modelos/remover") {
    await env.DB.prepare("DELETE FROM contrato_modelos WHERE id = ? AND portal_id = ?").bind(parseInt(corpo.id, 10) || 0, portal.id).run();
    return resp({ ok: true }, 200);
  }

  if (caminho === "/api/contratos/novo") {
    const titulo = texto(corpo.titulo, 120);
    const t = textoLongo(corpo.texto, MAX_TEXTO);
    const nome = texto(corpo.destinatario_nome, 100);
    const email = String(corpo.destinatario_email || "").trim().toLowerCase();
    if (titulo.length < 3) return resp({ error: "Dê um título ao contrato" }, 400);
    if (t.trim().length < 50) return resp({ error: "O texto do contrato está muito curto" }, 400);
    if (/\{\{[a-z_]+\}\}/.test(t)) return resp({ error: "Ainda há campos sem preencher no texto (entre {{ }})" }, 400);
    if (nome.length < 2) return resp({ error: "Digite o nome de quem vai assinar" }, 400);
    if (!EMAIL_OK.test(email) || email.length > 120) return resp({ error: "E-mail de quem vai assinar inválido" }, 400);
    let clienteId = null, albumId = null;
    if (corpo.cliente_id) {
      const cli = await env.DB.prepare("SELECT id FROM portal_clientes WHERE id = ? AND portal_id = ?").bind(parseInt(corpo.cliente_id, 10) || 0, portal.id).first();
      if (!cli) return resp({ error: "Cliente não encontrado" }, 400);
      clienteId = cli.id;
    }
    if (corpo.album_id) {
      const a = await env.DB.prepare("SELECT id FROM albuns WHERE id = ? AND portal_id = ?").bind(parseInt(corpo.album_id, 10) || 0, portal.id).first();
      if (!a) return resp({ error: "Álbum não encontrado" }, 400);
      albumId = a.id;
    }
    const n = await env.DB.prepare("SELECT COUNT(*) AS n FROM contratos WHERE portal_id = ? AND created_at > datetime('now', '-1 day')").bind(portal.id).first();
    if (n.n >= 100) return resp({ error: "Limite de 100 contratos por dia" }, 429);
    const token = paraHex(crypto.getRandomValues(new Uint8Array(24)));
    const r = await env.DB.prepare(
      "INSERT INTO contratos (portal_id, cliente_id, album_id, titulo, texto, destinatario_nome, destinatario_email, token, obrigatorio) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)"
    ).bind(portal.id, clienteId, albumId, titulo, t, nome, email, token, clienteId && corpo.obrigatorio ? 1 : 0).run();
    const enviado = await emailParaAssinar(env, { titulo: titulo, destinatario_nome: nome, destinatario_email: email, token: token }, portal.nome);
    return resp({ ok: true, id: r.meta.last_row_id, link: linkContrato(token), email_enviado: enviado }, 200);
  }

  if (caminho === "/api/contratos/reenviar") {
    const c = await env.DB.prepare("SELECT * FROM contratos WHERE id = ? AND portal_id = ?").bind(parseInt(corpo.id, 10) || 0, portal.id).first();
    if (!c) return resp({ error: "Contrato não encontrado" }, 404);
    if (c.status === "assinado" || c.status === "cancelado") return resp({ error: "Este contrato já foi " + c.status }, 400);
    const enviado = await emailParaAssinar(env, c, portal.nome);
    return resp({ ok: true, email_enviado: enviado }, 200);
  }

  if (caminho === "/api/contratos/cancelar") {
    const r = await env.DB.prepare("UPDATE contratos SET status = 'cancelado' WHERE id = ? AND portal_id = ? AND status != 'assinado'")
      .bind(parseInt(corpo.id, 10) || 0, portal.id).run();
    if (!r.meta.changes) return resp({ error: "Contrato assinado não pode ser cancelado aqui" }, 400);
    return resp({ ok: true }, 200);
  }

  return resp({ error: "Rota não encontrada" }, 404);
}

/* ---------- cliente: ler e assinar ---------- */

async function contratoPeloToken(env, t) {
  const token = String(t || "");
  if (!/^[0-9a-f]{48}$/.test(token)) return null;
  return await env.DB.prepare(
    "SELECT c.*, p.nome AS estudio, p.slug AS estudio_slug, u.email AS estudio_email FROM contratos c JOIN portais p ON p.id = c.portal_id JOIN users u ON u.id = p.user_id WHERE c.token = ?"
  ).bind(token).first();
}

function contratoParaCliente(c) {
  const x = {
    titulo: c.titulo, texto: c.texto, estudio: c.estudio, status: c.status,
    destinatario_nome: c.destinatario_nome, email_mascarado: emailMascarado(c.destinatario_email), criado_em: c.created_at,
    portal: c.cliente_id ? "/p/" + c.estudio_slug : null
  };
  if (c.status === "assinado") {
    x.assinatura = {
      nome: c.assinante_nome, documento: documentoMascarado(c.assinante_cpf), email: emailMascarado(c.assinante_email),
      quando: c.assinado_em, quando_br: dataHoraBr(c.assinado_em), hash: c.documento_hash
    };
  }
  return x;
}

export async function tratarContratoPublico(request, env, url) {
  const caminho = url.pathname;

  if (caminho === "/api/c/info" && request.method === "GET") {
    const c = await contratoPeloToken(env, url.searchParams.get("t"));
    if (!c) return resp({ error: "Contrato não encontrado. Confira o link que você recebeu." }, 404);
    if (c.status === "cancelado") return resp({ error: "Este contrato foi cancelado por " + c.estudio + "." }, 410);
    if (c.status === "enviado") {
      await env.DB.prepare("UPDATE contratos SET status = 'visto', visto_em = datetime('now') WHERE id = ? AND status = 'enviado'").bind(c.id).run();
      c.status = "visto";
    }
    return resp(contratoParaCliente(c), 200);
  }

  if (request.method !== "POST") return resp({ error: "Método não permitido" }, 405);
  if (!origemOk(request, url)) return resp({ error: "Origem inválida" }, 403);
  const corpo = await lerJson(request);
  if (!corpo) return resp({ error: "JSON inválido" }, 400);
  const c = await contratoPeloToken(env, corpo.t);
  if (!c) return resp({ error: "Contrato não encontrado" }, 404);
  if (c.status === "cancelado") return resp({ error: "Este contrato foi cancelado." }, 410);
  if (c.status === "assinado") return resp({ error: "Este contrato já foi assinado." }, 400);
  const nome = texto(corpo.nome, 100);
  const doc = documentoValido(corpo.cpf);
  if (nome.split(" ").filter(Boolean).length < 2) return resp({ error: "Digite o seu nome completo" }, 400);
  if (!doc) return resp({ error: "CPF (ou CNPJ) inválido. Confira os números." }, 400);

  // 1º passo: manda o código para o e-mail cadastrado no contrato.
  if (caminho === "/api/c/codigo") {
    if (!corpo.aceite) return resp({ error: "Marque que leu e concorda com o contrato" }, 400);
    if (c.codigos_enviados >= MAX_CODIGOS) return resp({ error: "Muitos códigos pedidos para este contrato. Fale com " + c.estudio + "." }, 429);
    if (!(await dentroDoLimite(env, await chaveIp(request), "contrato_codigo", MAX_CODIGOS_IP_HORA))) {
      return resp({ error: "Muitas tentativas. Espere um pouco e tente de novo." }, 429);
    }
    const codigo = String(100000 + (crypto.getRandomValues(new Uint32Array(1))[0] % 900000));
    await env.DB.prepare(
      "UPDATE contratos SET codigo_hash = ?, codigo_expira = datetime('now', ?), codigos_enviados = codigos_enviados + 1, tentativas = 0 WHERE id = ?"
    ).bind(await sha256Hex(c.id + ":" + codigo), "+" + MINUTOS_CODIGO + " minutes", c.id).run();
    const ok = await enviarEmail(env, c.destinatario_email, "Seu código para assinar: " + codigo, [
      "Olá, " + nome.split(" ")[0] + "!",
      "Seu código para assinar o contrato \"" + c.titulo + "\" (" + c.estudio + ") é:",
      codigo,
      "Ele vale por " + MINUTOS_CODIGO + " minutos. Se não foi você que pediu, ignore este e-mail."
    ]);
    if (!ok) return resp({ error: "Não conseguimos enviar o código agora. Tente de novo em alguns minutos." }, 502);
    return resp({ ok: true, email: emailMascarado(c.destinatario_email), minutos: MINUTOS_CODIGO }, 200);
  }

  // 2º passo: confere o código e assina.
  if (caminho === "/api/c/assinar") {
    if (!c.codigo_hash || !c.codigo_expira || new Date(c.codigo_expira.replace(" ", "T") + "Z").getTime() < Date.now()) {
      return resp({ error: "O código expirou. Peça um novo." }, 400);
    }
    if (c.tentativas >= MAX_TENTATIVAS) return resp({ error: "Muitas tentativas erradas. Peça um novo código." }, 429);
    const codigo = String(corpo.codigo || "").replace(/\D/g, "");
    if ((await sha256Hex(c.id + ":" + codigo)) !== c.codigo_hash) {
      await env.DB.prepare("UPDATE contratos SET tentativas = tentativas + 1 WHERE id = ?").bind(c.id).run();
      return resp({ error: "Código errado. Confira no seu e-mail." }, 400);
    }
    const hash = await sha256Hex(c.texto);
    const ip = request.headers.get("CF-Connecting-IP") || "";
    const navegador = texto(request.headers.get("User-Agent"), 300);
    const r = await env.DB.prepare(
      "UPDATE contratos SET status = 'assinado', assinante_nome = ?, assinante_cpf = ?, assinante_email = destinatario_email, assinado_em = datetime('now'), " +
      "assinado_ip = ?, assinado_navegador = ?, documento_hash = ?, codigo_hash = NULL WHERE id = ? AND status != 'assinado'"
    ).bind(nome, doc, ip, navegador, hash, c.id).run();
    if (!r.meta.changes) return resp({ error: "Este contrato já foi assinado." }, 400);
    const assinado = await contratoPeloToken(env, corpo.t);
    const linhas = [
      "Contrato: " + c.titulo,
      "Assinado por: " + nome + " (CPF/CNPJ " + documentoMascarado(doc) + ")",
      "Quando: " + dataHoraBr(assinado.assinado_em) + " (horário de Brasília)",
      "Código de verificação do documento (SHA-256): " + hash
    ];
    await enviarEmail(env, c.destinatario_email, "Contrato assinado: " + c.titulo, ["Pronto! O contrato foi assinado. Guarde este e-mail como comprovante."].concat(linhas),
      { texto: "Ver o contrato assinado", link: linkContrato(c.token) });
    await enviarEmail(env, c.estudio_email, "✅ " + nome + " assinou o contrato", ["Boa notícia: o contrato foi assinado."].concat(linhas),
      { texto: "Ver no Meu estúdio", link: SITE + "/meu-portal?aba=contratos" });
    return resp(contratoParaCliente(assinado), 200);
  }

  return resp({ error: "Rota não encontrada" }, 404);
}
