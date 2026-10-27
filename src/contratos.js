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
const MAX_CODIGOS = 6;          // por pessoa
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

function novoToken() {
  return paraHex(crypto.getRandomValues(new Uint8Array(24)));
}

async function emailParaAssinar(env, titulo, assinante, estudio, total) {
  return await enviarEmail(env, assinante.email, "Contrato para assinar: " + titulo, [
    "Olá, " + assinante.nome.split(" ")[0] + "!",
    estudio + " enviou o contrato \"" + titulo + "\" para você ler e assinar online." + (total > 1 ? " Outras " + (total - 1) + " pessoa(s) também vão assinar, cada uma pelo próprio link." : ""),
    "É rápido: abra o link, leia com calma, informe seu nome e CPF e confirme com o código que vamos mandar para este e-mail."
  ], { texto: "Ler e assinar o contrato", link: linkContrato(assinante.token) });
}

async function assinantesDe(env, contratoId) {
  const r = await env.DB.prepare("SELECT * FROM contrato_assinantes WHERE contrato_id = ? ORDER BY id").bind(contratoId).all();
  return r.results;
}

// O contrato fica "assinado" quando todos os assinantes assinaram; "visto" quando alguém já abriu.
async function atualizarContrato(env, contratoId) {
  const lista = await assinantesDe(env, contratoId);
  const todos = lista.length > 0 && lista.every(function (a) { return a.status === "assinado"; });
  const algum = lista.some(function (a) { return a.status !== "enviado"; });
  await env.DB.prepare(
    "UPDATE contratos SET status = CASE WHEN status = 'cancelado' THEN 'cancelado' WHEN ? THEN 'assinado' WHEN ? THEN 'visto' ELSE status END, " +
    "assinado_em = CASE WHEN ? AND assinado_em IS NULL THEN datetime('now') ELSE assinado_em END WHERE id = ?"
  ).bind(todos ? 1 : 0, algum ? 1 : 0, todos ? 1 : 0, contratoId).run();
  return { todos: todos, lista: lista };
}

/* ---------- fotógrafo ---------- */

export async function tratarContratosDono(request, env, url) {
  const caminho = url.pathname;
  const u = await usuarioLogado(request, env);
  if (!u) return resp({ error: "Não autenticado" }, 401);
  const portal = await env.DB.prepare("SELECT id, nome, doc_nome, doc_numero, doc_cidade FROM portais WHERE user_id = ?").bind(u.id).first();
  if (!portal) return resp({ error: "Crie primeiro a sua página em Meu estúdio" }, 400);

  if (caminho === "/api/contratos" && request.method === "GET") {
    const meus = await env.DB.prepare("SELECT id, nome, texto, updated_at FROM contrato_modelos WHERE portal_id = ? ORDER BY nome").bind(portal.id).all();
    const lista = await env.DB.prepare(
      "SELECT id, titulo, status, regra, destinatario_nome, destinatario_email, created_at, assinado_em, album_id, cliente_id FROM contratos WHERE portal_id = ? ORDER BY id DESC LIMIT 200"
    ).bind(portal.id).all();
    const ass = await env.DB.prepare(
      "SELECT a.id, a.contrato_id, a.nome, a.email, a.status, a.assinado_em, a.token FROM contrato_assinantes a JOIN contratos c ON c.id = a.contrato_id WHERE c.portal_id = ? ORDER BY a.id"
    ).bind(portal.id).all();
    return resp({
      modelos: MODELOS.map(function (m) { return { id: m.id, nome: m.nome, texto: m.texto }; }),
      meus: meus.results, campos: CAMPOS,
      estudio: { nome: portal.doc_nome || portal.nome, documento: portal.doc_numero || "", cidade: portal.doc_cidade || "" },
      contratos: lista.results.map(function (c) {
        c.assinantes = ass.results.filter(function (a) { return a.contrato_id === c.id; }).map(function (a) {
          return { id: a.id, nome: a.nome, email: a.email, status: a.status, assinado_em: a.assinado_em, link: linkContrato(a.token) };
        });
        c.link = c.assinantes.length ? c.assinantes[0].link : null;
        return c;
      })
    }, 200);
  }

  if (caminho === "/api/contratos/ver" && request.method === "GET") {
    const c = await env.DB.prepare("SELECT id, titulo, texto, status, regra, album_id, cliente_id, created_at, assinado_em FROM contratos WHERE id = ? AND portal_id = ?")
      .bind(parseInt(url.searchParams.get("id"), 10) || 0, portal.id).first();
    if (!c) return resp({ error: "Contrato não encontrado" }, 404);
    c.assinantes = (await assinantesDe(env, c.id)).map(function (a) {
      return { id: a.id, nome: a.nome, email: a.email, status: a.status, assinado_em: a.assinado_em, assinante_nome: a.assinante_nome,
        documento: documentoMascarado(a.assinante_cpf), ip: a.assinado_ip, navegador: a.assinado_navegador, hash: a.documento_hash, link: linkContrato(a.token) };
    });
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
    if (titulo.length < 3) return resp({ error: "Dê um título ao contrato" }, 400);
    if (t.trim().length < 50) return resp({ error: "O texto do contrato está muito curto" }, 400);
    if (/\{\{[a-z_]+\}\}/.test(t)) return resp({ error: "Ainda há campos sem preencher no texto (entre {{ }})" }, 400);
    // Quem assina: lista de pessoas (casal, pai e mãe...). Compatível com o formato antigo (uma pessoa).
    let lista = Array.isArray(corpo.assinantes) && corpo.assinantes.length ? corpo.assinantes
      : [{ nome: corpo.destinatario_nome, email: corpo.destinatario_email, cliente_id: corpo.cliente_id }];
    if (lista.length > 6) return resp({ error: "No máximo 6 pessoas por contrato" }, 400);
    const vistos = {};
    const assinantes = [];
    for (const a of lista) {
      const nome = texto(a.nome, 100);
      const email = String(a.email || "").trim().toLowerCase();
      if (nome.length < 2) return resp({ error: "Digite o nome de cada pessoa que vai assinar" }, 400);
      if (!EMAIL_OK.test(email) || email.length > 120) return resp({ error: "E-mail inválido: " + nome }, 400);
      if (vistos[email]) return resp({ error: "Cada pessoa precisa de um e-mail diferente (" + email + " repetido)" }, 400);
      vistos[email] = true;
      let clienteId = null;
      if (a.cliente_id) {
        const cli = await env.DB.prepare("SELECT id FROM portal_clientes WHERE id = ? AND portal_id = ?").bind(parseInt(a.cliente_id, 10) || 0, portal.id).first();
        if (!cli) return resp({ error: "Cliente não encontrado" }, 400);
        clienteId = cli.id;
      }
      assinantes.push({ nome: nome, email: email, cliente_id: clienteId, token: novoToken() });
    }
    let albumId = null;
    if (corpo.album_id) {
      const a = await env.DB.prepare("SELECT id FROM albuns WHERE id = ? AND portal_id = ?").bind(parseInt(corpo.album_id, 10) || 0, portal.id).first();
      if (!a) return resp({ error: "Álbum não encontrado" }, 400);
      albumId = a.id;
    }
    // Regra de acesso: todos precisam assinar | basta uma pessoa | não trava o álbum.
    let regra = ["todos", "um", "nenhum"].indexOf(corpo.regra) > -1 ? corpo.regra : (corpo.obrigatorio ? "todos" : "nenhum");
    if (!albumId && !assinantes.some(function (a) { return a.cliente_id; })) regra = "nenhum";   // sem álbum nem cliente do portal, não há o que travar
    const n = await env.DB.prepare("SELECT COUNT(*) AS n FROM contratos WHERE portal_id = ? AND created_at > datetime('now', '-1 day')").bind(portal.id).first();
    if (n.n >= 100) return resp({ error: "Limite de 100 contratos por dia" }, 429);
    const p0 = assinantes[0];
    const r = await env.DB.prepare(
      "INSERT INTO contratos (portal_id, cliente_id, album_id, titulo, texto, destinatario_nome, destinatario_email, token, obrigatorio, regra) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)"
    ).bind(portal.id, p0.cliente_id, albumId, titulo, t, p0.nome, p0.email, p0.token, regra === "nenhum" ? 0 : 1, regra).run();
    const contratoId = r.meta.last_row_id;
    let enviados = 0;
    for (const a of assinantes) {
      await env.DB.prepare("INSERT INTO contrato_assinantes (contrato_id, nome, email, cliente_id, token) VALUES (?, ?, ?, ?, ?)")
        .bind(contratoId, a.nome, a.email, a.cliente_id, a.token).run();
      if (await emailParaAssinar(env, titulo, a, portal.nome, assinantes.length)) enviados++;
    }
    return resp({
      ok: true, id: contratoId, regra: regra, email_enviado: enviados === assinantes.length,
      link: linkContrato(p0.token),
      assinantes: assinantes.map(function (a) { return { nome: a.nome, email: a.email, link: linkContrato(a.token) }; })
    }, 200);
  }

  // Reenvia para quem ainda não assinou (ou só para uma pessoa, com assinante_id).
  if (caminho === "/api/contratos/reenviar") {
    const c = await env.DB.prepare("SELECT * FROM contratos WHERE id = ? AND portal_id = ?").bind(parseInt(corpo.id, 10) || 0, portal.id).first();
    if (!c) return resp({ error: "Contrato não encontrado" }, 404);
    if (c.status === "assinado" || c.status === "cancelado") return resp({ error: "Este contrato já foi " + c.status }, 400);
    const lista = (await assinantesDe(env, c.id)).filter(function (a) {
      return a.status !== "assinado" && (!corpo.assinante_id || a.id === parseInt(corpo.assinante_id, 10));
    });
    let enviados = 0;
    for (const a of lista) if (await emailParaAssinar(env, c.titulo, a, portal.nome, 1)) enviados++;
    return resp({ ok: true, email_enviado: enviados > 0 && enviados === lista.length, enviados: enviados }, 200);
  }

  if (caminho === "/api/contratos/cancelar") {
    const r = await env.DB.prepare("UPDATE contratos SET status = 'cancelado' WHERE id = ? AND portal_id = ? AND status != 'assinado'")
      .bind(parseInt(corpo.id, 10) || 0, portal.id).run();
    if (!r.meta.changes) return resp({ error: "Contrato assinado não pode ser cancelado aqui" }, 400);
    return resp({ ok: true }, 200);
  }

  return resp({ error: "Rota não encontrada" }, 404);
}

/* ---------- quem assina: ler e assinar ---------- */

async function assinantePeloToken(env, t) {
  const token = String(t || "");
  if (!/^[0-9a-f]{48}$/.test(token)) return null;
  return await env.DB.prepare(
    "SELECT a.*, c.titulo, c.texto, c.status AS contrato_status, c.regra, c.cliente_id AS contrato_cliente, c.album_id, " +
    "p.nome AS estudio, p.slug AS estudio_slug, u.email AS estudio_email " +
    "FROM contrato_assinantes a JOIN contratos c ON c.id = a.contrato_id JOIN portais p ON p.id = c.portal_id JOIN users u ON u.id = p.user_id WHERE a.token = ?"
  ).bind(token).first();
}

function paraQuemAssina(a, todos) {
  const x = {
    titulo: a.titulo, texto: a.texto, estudio: a.estudio, status: a.status,
    destinatario_nome: a.nome, email_mascarado: emailMascarado(a.email),
    portal: a.cliente_id ? "/p/" + a.estudio_slug : null,
    // Situação de cada pessoa (sem dados pessoais): "João assinou · Maria ainda não".
    pessoas: todos.map(function (p) { return { nome: p.nome, assinou: p.status === "assinado", eu: p.id === a.id }; })
  };
  if (a.status === "assinado") {
    x.assinatura = {
      nome: a.assinante_nome, documento: documentoMascarado(a.assinante_cpf), email: emailMascarado(a.email),
      quando: a.assinado_em, quando_br: dataHoraBr(a.assinado_em), hash: a.documento_hash
    };
  }
  return x;
}

export async function tratarContratoPublico(request, env, url) {
  const caminho = url.pathname;

  if (caminho === "/api/c/info" && request.method === "GET") {
    const a = await assinantePeloToken(env, url.searchParams.get("t"));
    if (!a) return resp({ error: "Contrato não encontrado. Confira o link que você recebeu." }, 404);
    if (a.contrato_status === "cancelado") return resp({ error: "Este contrato foi cancelado por " + a.estudio + "." }, 410);
    if (a.status === "enviado") {
      await env.DB.prepare("UPDATE contrato_assinantes SET status = 'visto', visto_em = datetime('now') WHERE id = ? AND status = 'enviado'").bind(a.id).run();
      a.status = "visto";
      await atualizarContrato(env, a.contrato_id);
    }
    return resp(paraQuemAssina(a, await assinantesDe(env, a.contrato_id)), 200);
  }

  if (request.method !== "POST") return resp({ error: "Método não permitido" }, 405);
  if (!origemOk(request, url)) return resp({ error: "Origem inválida" }, 403);
  const corpo = await lerJson(request);
  if (!corpo) return resp({ error: "JSON inválido" }, 400);
  const a = await assinantePeloToken(env, corpo.t);
  if (!a) return resp({ error: "Contrato não encontrado" }, 404);
  if (a.contrato_status === "cancelado") return resp({ error: "Este contrato foi cancelado." }, 410);
  if (a.status === "assinado") return resp({ error: "Você já assinou este contrato." }, 400);
  const nome = texto(corpo.nome, 100);
  const doc = documentoValido(corpo.cpf);
  if (nome.split(" ").filter(Boolean).length < 2) return resp({ error: "Digite o seu nome completo" }, 400);
  if (!doc) return resp({ error: "CPF (ou CNPJ) inválido. Confira os números." }, 400);

  // 1º passo: manda o código para o e-mail desta pessoa.
  if (caminho === "/api/c/codigo") {
    if (!corpo.aceite) return resp({ error: "Marque que leu e concorda com o contrato" }, 400);
    if (a.codigos_enviados >= MAX_CODIGOS) return resp({ error: "Muitos códigos pedidos para este contrato. Fale com " + a.estudio + "." }, 429);
    if (!(await dentroDoLimite(env, await chaveIp(request), "contrato_codigo", MAX_CODIGOS_IP_HORA))) {
      return resp({ error: "Muitas tentativas. Espere um pouco e tente de novo." }, 429);
    }
    const codigo = String(100000 + (crypto.getRandomValues(new Uint32Array(1))[0] % 900000));
    await env.DB.prepare(
      "UPDATE contrato_assinantes SET codigo_hash = ?, codigo_expira = datetime('now', ?), codigos_enviados = codigos_enviados + 1, tentativas = 0 WHERE id = ?"
    ).bind(await sha256Hex(a.id + ":" + codigo), "+" + MINUTOS_CODIGO + " minutes", a.id).run();
    const ok = await enviarEmail(env, a.email, "Seu código para assinar: " + codigo, [
      "Olá, " + nome.split(" ")[0] + "!",
      "Seu código para assinar o contrato \"" + a.titulo + "\" (" + a.estudio + ") é:",
      codigo,
      "Ele vale por " + MINUTOS_CODIGO + " minutos. Se não foi você que pediu, ignore este e-mail."
    ]);
    if (!ok) return resp({ error: "Não conseguimos enviar o código agora. Tente de novo em alguns minutos." }, 502);
    return resp({ ok: true, email: emailMascarado(a.email), minutos: MINUTOS_CODIGO }, 200);
  }

  // 2º passo: confere o código e assina.
  if (caminho === "/api/c/assinar") {
    if (!a.codigo_hash || !a.codigo_expira || new Date(a.codigo_expira.replace(" ", "T") + "Z").getTime() < Date.now()) {
      return resp({ error: "O código expirou. Peça um novo." }, 400);
    }
    if (a.tentativas >= MAX_TENTATIVAS) return resp({ error: "Muitas tentativas erradas. Peça um novo código." }, 429);
    const codigo = String(corpo.codigo || "").replace(/\D/g, "");
    if ((await sha256Hex(a.id + ":" + codigo)) !== a.codigo_hash) {
      await env.DB.prepare("UPDATE contrato_assinantes SET tentativas = tentativas + 1 WHERE id = ?").bind(a.id).run();
      return resp({ error: "Código errado. Confira no seu e-mail." }, 400);
    }
    const hash = await sha256Hex(a.texto);
    const r = await env.DB.prepare(
      "UPDATE contrato_assinantes SET status = 'assinado', assinante_nome = ?, assinante_cpf = ?, assinado_em = datetime('now'), " +
      "assinado_ip = ?, assinado_navegador = ?, documento_hash = ?, codigo_hash = NULL WHERE id = ? AND status != 'assinado'"
    ).bind(nome, doc, request.headers.get("CF-Connecting-IP") || "", texto(request.headers.get("User-Agent"), 300), hash, a.id).run();
    if (!r.meta.changes) return resp({ error: "Você já assinou este contrato." }, 400);
    // Compatibilidade: o contrato guarda também os dados da primeira assinatura.
    await env.DB.prepare("UPDATE contratos SET assinante_nome = COALESCE(assinante_nome, ?), assinante_cpf = COALESCE(assinante_cpf, ?), documento_hash = COALESCE(documento_hash, ?) WHERE id = ?")
      .bind(nome, doc, hash, a.contrato_id).run();
    const sit = await atualizarContrato(env, a.contrato_id);
    const assinado = await assinantePeloToken(env, corpo.t);
    const feitos = sit.lista.filter(function (p) { return p.status === "assinado"; }).length;
    const faltam = sit.lista.filter(function (p) { return p.status !== "assinado"; }).map(function (p) { return p.nome; });
    const linhas = [
      "Contrato: " + a.titulo,
      "Assinado por: " + nome + " (CPF/CNPJ " + documentoMascarado(doc) + ")",
      "Quando: " + dataHoraBr(assinado.assinado_em) + " (horário de Brasília)",
      "Código de verificação do documento (SHA-256): " + hash
    ];
    if (sit.lista.length > 1) linhas.push(sit.todos ? "Todas as " + sit.lista.length + " pessoas já assinaram." : "Assinaturas: " + feitos + " de " + sit.lista.length + ". Falta: " + faltam.join(", ") + ".");
    await enviarEmail(env, a.email, "Contrato assinado: " + a.titulo, ["Pronto! Você assinou o contrato. Guarde este e-mail como comprovante."].concat(linhas),
      { texto: "Ver o contrato assinado", link: linkContrato(a.token) });
    await enviarEmail(env, a.estudio_email, (sit.todos ? "✅ Contrato assinado por todos: " : "✍️ " + nome + " assinou (" + feitos + " de " + sit.lista.length + "): ") + a.titulo,
      [sit.todos ? "Boa notícia: todas as pessoas assinaram o contrato." : nome + " assinou o contrato. Ainda falta: " + faltam.join(", ") + "."].concat(linhas),
      { texto: "Ver no Meu estúdio", link: SITE + "/meu-portal?aba=contratos" });
    return resp(paraQuemAssina(assinado, sit.lista), 200);
  }

  return resp({ error: "Rota não encontrada" }, 404);
}
