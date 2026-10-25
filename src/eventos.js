// Galeria de evento (fotógrafo de rua, corrida, esporte, formatura, convidados de festa...).
// /api/eventos*  → o fotógrafo cria o evento, envia as fotos (original + prévia com marca d'água) e confirma os pedidos.
// /api/e/*       → o público vê as prévias, escolhe, faz o pedido, paga no PIX do fotógrafo e baixa os originais.
// O dinheiro vai direto para o fotógrafo: a Master Nuvem não cobra comissão nem passa o dinheiro pela conta dela.
import { urlArquivo, removerObjeto } from "./arquivos.js";
import { chaveIp, dentroDoLimite } from "./limite.js";

const enc = new TextEncoder();
const POR_PAGINA_DONO = 60;
const POR_PAGINA_PUBLICO = 60;
const MAX_APAGAR_POR_VEZ = 40;
const MAX_FOTOS_PEDIDO = 300;
const MAX_PEDIDOS_HORA = 10;
const SLUG_OK = /^[a-z0-9](?:[a-z0-9-]{1,58}[a-z0-9])$/;
const EMAIL_OK = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const REMETENTE = "Master Nuvem <nao-responda@masternuvem.com.br>";
export const TIPOS_EVENTO = ["Corrida", "Ciclismo", "Triathlon", "Futebol", "Vôlei / basquete", "Lutas", "Surf / skate",
  "Formatura", "Festa de 15 anos", "Casamento (convidados)", "Show / festa", "Evento corporativo", "Escola", "Outro"];

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

function escaparHtml(t) {
  return String(t).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

// "15" / "15,00" / "1.234,56" → centavos (R$ 1,00 a R$ 10.000,00). null se inválido.
function paraCentavos(v) {
  let t = String(v === undefined || v === null ? "" : v).trim().replace(/^R\$\s*/i, "");
  if (typeof v === "number") t = v.toFixed(2);
  else if (t.indexOf(",") > -1) t = t.replace(/\./g, "").replace(",", ".");
  if (!/^\d+(\.\d{1,2})?$/.test(t)) return null;
  const c = Math.round(parseFloat(t) * 100);
  return c >= 100 && c <= 1000000 ? c : null;
}

function reais(c) {
  return "R$ " + (c / 100).toFixed(2).replace(".", ",");
}

// Números de peito/camisa: guarda como ",123,45," para buscar com LIKE '%,123,%'.
function normalizarNumeros(v) {
  const lista = String(v || "").split(/[,;\s]+/).map(function (n) { return n.replace(/[^0-9a-zA-Z]/g, "").toUpperCase(); })
    .filter(function (n) { return n.length > 0 && n.length <= 10; }).slice(0, 30);
  return lista.length ? "," + Array.from(new Set(lista)).join(",") + "," : null;
}

function lerFaixas(json) {
  try {
    const f = JSON.parse(json || "[]");
    return Array.isArray(f) ? f : [];
  } catch (e) {
    return [];
  }
}

// Total do pedido: preço da foto, com desconto da maior faixa atingida (ex.: a partir de 5 fotos, R$ 10 cada).
export function calcularTotal(precoCentavos, faixas, qtd) {
  let unit = precoCentavos;
  for (const f of faixas) {
    if (qtd >= f.a_partir && f.preco_centavos < unit) unit = f.preco_centavos;
  }
  return { unit: unit, total: unit * qtd };
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

function eventoParaTela(e) {
  return {
    id: e.id, slug: e.slug, titulo: e.titulo, data: e.data, local: e.local, tipo: e.tipo,
    preco_centavos: e.preco_centavos, faixas: lerFaixas(e.faixas), marca_texto: e.marca_texto, publicado: !!e.publicado
  };
}

// Apaga original e prévia de uma foto (no Backblaze e no banco).
async function apagarFoto(env, foto) {
  for (const id of [foto.original_id, foto.previa_id]) {
    const f = await env.DB.prepare("SELECT id, object_key FROM files WHERE id = ?").bind(id).first();
    if (!f) continue;
    const r = await removerObjeto(env, f.object_key);
    if (!r.ok && r.status !== 404) return false;
    await env.DB.prepare("DELETE FROM files WHERE id = ?").bind(f.id).run();
  }
  await env.DB.prepare("DELETE FROM evento_fotos WHERE id = ?").bind(foto.id).run();
  return true;
}

/* ---------- fotógrafo ---------- */

export async function tratarEventosDono(request, env, url) {
  const caminho = url.pathname;
  const u = await usuarioLogado(request, env);
  if (!u) return resp({ error: "Não autenticado" }, 401);
  const portal = await env.DB.prepare("SELECT id, slug, nome, cor, instrucoes_pagamento FROM portais WHERE user_id = ?").bind(u.id).first();

  if (caminho === "/api/eventos" && request.method === "GET") {
    if (!portal) return resp({ portal: null, eventos: [], tipos: TIPOS_EVENTO }, 200);
    const r = await env.DB.prepare(
      "SELECT e.*, (SELECT COUNT(*) FROM evento_fotos f WHERE f.evento_id = e.id) AS fotos, " +
      "(SELECT COUNT(*) FROM evento_pedidos p WHERE p.evento_id = e.id AND p.status = 'pendente') AS pendentes, " +
      "(SELECT COALESCE(SUM(valor_centavos), 0) FROM evento_pedidos p WHERE p.evento_id = e.id AND p.status = 'pago') AS vendido, " +
      "(SELECT COALESCE(SUM(qtd), 0) FROM evento_pedidos p WHERE p.evento_id = e.id AND p.status = 'pago') AS fotos_vendidas " +
      "FROM eventos e WHERE e.portal_id = ? ORDER BY e.id DESC"
    ).bind(portal.id).all();
    return resp({
      portal: { nome: portal.nome, cor: portal.cor, tem_pix: !!portal.instrucoes_pagamento, instrucoes: portal.instrucoes_pagamento || "" },
      tipos: TIPOS_EVENTO,
      eventos: r.results.map(function (e) {
        const t = eventoParaTela(e);
        t.fotos = e.fotos; t.pendentes = e.pendentes; t.vendido = e.vendido; t.fotos_vendidas = e.fotos_vendidas;
        return t;
      })
    }, 200);
  }

  if (!portal) return resp({ error: "Crie o seu portal primeiro (em Meu portal)" }, 400);

  async function eventoDoDono(id) {
    return await env.DB.prepare("SELECT * FROM eventos WHERE id = ? AND portal_id = ?").bind(parseInt(id, 10) || 0, portal.id).first();
  }

  if (caminho === "/api/eventos/fotos" && request.method === "GET") {
    const ev = await eventoDoDono(url.searchParams.get("id"));
    if (!ev) return resp({ error: "Evento não encontrado" }, 404);
    const pagina = Math.max(0, parseInt(url.searchParams.get("pagina"), 10) || 0);
    const total = await env.DB.prepare("SELECT COUNT(*) AS n FROM evento_fotos WHERE evento_id = ?").bind(ev.id).first();
    const r = await env.DB.prepare(
      "SELECT f.id, f.numeros, o.name, o.size_bytes, p.object_key AS previa_key, p.name AS previa_nome, " +
      "(SELECT COUNT(*) FROM evento_pedidos x WHERE x.evento_id = f.evento_id AND x.status = 'pago' AND x.fotos LIKE '%,' || f.id || ',%') AS vendas " +
      "FROM evento_fotos f JOIN files o ON o.id = f.original_id JOIN files p ON p.id = f.previa_id " +
      "WHERE f.evento_id = ? ORDER BY f.id LIMIT ? OFFSET ?"
    ).bind(ev.id, POR_PAGINA_DONO, pagina * POR_PAGINA_DONO).all();
    const fotos = [];
    for (const f of r.results) {
      fotos.push({
        id: f.id, nome: f.name, tamanho: f.size_bytes, vendas: f.vendas,
        numeros: f.numeros ? f.numeros.split(",").filter(Boolean).join(", ") : "",
        previa: await urlArquivo(env, f.previa_key, f.previa_nome, false, 3600)
      });
    }
    return resp({ evento: eventoParaTela(ev), total: total.n, pagina: pagina, por_pagina: POR_PAGINA_DONO, fotos: fotos }, 200);
  }

  if (caminho === "/api/eventos/pedidos" && request.method === "GET") {
    const ev = await eventoDoDono(url.searchParams.get("id"));
    if (!ev) return resp({ error: "Evento não encontrado" }, 404);
    const r = await env.DB.prepare(
      "SELECT id, nome, email, whatsapp, qtd, valor_centavos, status, pago_em, created_at, fotos FROM evento_pedidos WHERE evento_id = ? " +
      "ORDER BY CASE status WHEN 'pendente' THEN 0 WHEN 'pago' THEN 1 ELSE 2 END, id DESC LIMIT 300"
    ).bind(ev.id).all();
    // Para o fotógrafo conferir quais fotos a pessoa escolheu (nome do arquivo original).
    const pedidos = [];
    for (const p of r.results) {
      const ids = p.fotos.split(",").filter(Boolean).map(Number).slice(0, MAX_FOTOS_PEDIDO);
      let nomes = [];
      if (ids.length) {
        const n = await env.DB.prepare(
          "SELECT o.name FROM evento_fotos f JOIN files o ON o.id = f.original_id WHERE f.evento_id = ? AND f.id IN (" + ids.map(function () { return "?"; }).join(",") + ") ORDER BY o.name"
        ).bind(ev.id, ...ids).all();
        nomes = n.results.map(function (x) { return x.name; });
      }
      delete p.fotos;
      p.arquivos = nomes;
      pedidos.push(p);
    }
    return resp({ pedidos: pedidos }, 200);
  }

  if (request.method !== "POST") return resp({ error: "Método não permitido" }, 405);
  if (!origemOk(request, url)) return resp({ error: "Origem inválida" }, 403);
  const corpo = await lerJson(request);
  if (!corpo) return resp({ error: "JSON inválido" }, 400);

  if (caminho === "/api/eventos/salvar") {
    const titulo = texto(corpo.titulo, 100);
    const slug = String(corpo.slug || "").trim().toLowerCase();
    const data = String(corpo.data || "");
    const preco = paraCentavos(corpo.preco);
    if (titulo.length < 3) return resp({ error: "Dê um nome ao evento (ex.: Corrida de Goiânia 2026)" }, 400);
    if (!SLUG_OK.test(slug)) return resp({ error: "Endereço inválido: use de 3 a 60 letras minúsculas, números e hífen" }, 400);
    if (data && !/^\d{4}-\d{2}-\d{2}$/.test(data)) return resp({ error: "Data inválida" }, 400);
    if (preco === null) return resp({ error: "Preço por foto inválido (de R$ 1,00 a R$ 10.000,00)" }, 400);
    const faixas = [];
    for (const f of Array.isArray(corpo.faixas) ? corpo.faixas.slice(0, 5) : []) {
      const qtd = parseInt(f.a_partir, 10);
      const valor = paraCentavos(f.preco);
      if (!qtd && !String(f.preco || "").trim()) continue;
      if (!qtd || qtd < 2 || qtd > 1000) return resp({ error: "Desconto: a quantidade precisa ser de 2 fotos ou mais" }, 400);
      if (valor === null || valor >= preco) return resp({ error: "Desconto: o preço com desconto precisa ser menor que o preço de 1 foto" }, 400);
      faixas.push({ a_partir: qtd, preco_centavos: valor });
    }
    faixas.sort(function (a, b) { return a.a_partir - b.a_partir; });
    const tipo = TIPOS_EVENTO.indexOf(corpo.tipo) > -1 ? corpo.tipo : "Outro";
    const id = parseInt(corpo.id, 10) || 0;
    const valores = [titulo, slug, data || null, texto(corpo.local, 100) || null, tipo, preco, JSON.stringify(faixas),
      texto(corpo.marca_texto, 40) || null, corpo.publicado === false ? 0 : 1];
    try {
      if (id) {
        const r = await env.DB.prepare(
          "UPDATE eventos SET titulo = ?, slug = ?, data = ?, local = ?, tipo = ?, preco_centavos = ?, faixas = ?, marca_texto = ?, publicado = ? WHERE id = ? AND portal_id = ?"
        ).bind(...valores, id, portal.id).run();
        if (!r.meta.changes) return resp({ error: "Evento não encontrado" }, 404);
        return resp({ ok: true, id: id }, 200);
      }
      const r = await env.DB.prepare(
        "INSERT INTO eventos (titulo, slug, data, local, tipo, preco_centavos, faixas, marca_texto, publicado, portal_id) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)"
      ).bind(...valores, portal.id).run();
      return resp({ ok: true, id: r.meta.last_row_id }, 200);
    } catch (e) {
      if (String(e.message).includes("UNIQUE")) return resp({ error: "Esse endereço já está em uso. Escolha outro." }, 409);
      throw e;
    }
  }

  // Liga a foto enviada (original + prévia, já concluídos em /api/files) ao evento.
  if (caminho === "/api/eventos/foto") {
    const ev = await eventoDoDono(corpo.evento_id);
    if (!ev) return resp({ error: "Evento não encontrado" }, 404);
    const arquivos = await env.DB.prepare(
      "SELECT id FROM files WHERE id IN (?, ?) AND user_id = ? AND evento_id = ? AND status = 'ready'"
    ).bind(parseInt(corpo.original_id, 10) || 0, parseInt(corpo.previa_id, 10) || 0, u.id, ev.id).all();
    if (arquivos.results.length !== 2 || corpo.original_id === corpo.previa_id) return resp({ error: "Envio da foto incompleto" }, 400);
    const r = await env.DB.prepare(
      "INSERT INTO evento_fotos (evento_id, original_id, previa_id, numeros) VALUES (?, ?, ?, ?)"
    ).bind(ev.id, parseInt(corpo.original_id, 10), parseInt(corpo.previa_id, 10), normalizarNumeros(corpo.numeros)).run();
    return resp({ ok: true, id: r.meta.last_row_id }, 200);
  }

  async function fotoDoDono(id) {
    return await env.DB.prepare(
      "SELECT f.* FROM evento_fotos f JOIN eventos e ON e.id = f.evento_id WHERE f.id = ? AND e.portal_id = ?"
    ).bind(parseInt(id, 10) || 0, portal.id).first();
  }

  if (caminho === "/api/eventos/foto/numeros") {
    const foto = await fotoDoDono(corpo.id);
    if (!foto) return resp({ error: "Foto não encontrada" }, 404);
    await env.DB.prepare("UPDATE evento_fotos SET numeros = ? WHERE id = ?").bind(normalizarNumeros(corpo.numeros), foto.id).run();
    return resp({ ok: true }, 200);
  }

  if (caminho === "/api/eventos/foto/remover") {
    const foto = await fotoDoDono(corpo.id);
    if (!foto) return resp({ error: "Foto não encontrada" }, 404);
    if (!(await apagarFoto(env, foto))) return resp({ error: "Não foi possível apagar agora. Tente de novo." }, 502);
    return resp({ ok: true }, 200);
  }

  if (caminho === "/api/eventos/remover") {
    const ev = await eventoDoDono(corpo.id);
    if (!ev) return resp({ error: "Evento não encontrado" }, 404);
    // Apaga aos poucos (limite de chamadas por vez); a tela chama de novo até zerar.
    const lote = await env.DB.prepare("SELECT * FROM evento_fotos WHERE evento_id = ? LIMIT ?").bind(ev.id, MAX_APAGAR_POR_VEZ / 2).all();
    for (const f of lote.results) {
      if (!(await apagarFoto(env, f))) return resp({ error: "Não foi possível apagar agora. Tente de novo." }, 502);
    }
    // Arquivos do evento que ficaram sem foto (envio interrompido).
    const soltos = await env.DB.prepare("SELECT id, object_key FROM files WHERE evento_id = ? AND id NOT IN (SELECT original_id FROM evento_fotos UNION SELECT previa_id FROM evento_fotos) LIMIT ?")
      .bind(ev.id, MAX_APAGAR_POR_VEZ / 2).all();
    for (const f of soltos.results) {
      const r = await removerObjeto(env, f.object_key);
      if (!r.ok && r.status !== 404) return resp({ error: "Não foi possível apagar agora. Tente de novo." }, 502);
      await env.DB.prepare("DELETE FROM files WHERE id = ?").bind(f.id).run();
    }
    const resta = await env.DB.prepare("SELECT COUNT(*) AS n FROM files WHERE evento_id = ?").bind(ev.id).first();
    if (resta.n === 0) {
      await env.DB.prepare("DELETE FROM evento_fotos WHERE evento_id = ?").bind(ev.id).run();
      await env.DB.prepare("DELETE FROM evento_pedidos WHERE evento_id = ?").bind(ev.id).run();
      await env.DB.prepare("DELETE FROM eventos WHERE id = ?").bind(ev.id).run();
    }
    return resp({ ok: true, restantes: resta.n }, 200);
  }

  if (caminho === "/api/eventos/pedidos/status") {
    const status = String(corpo.status || "");
    if (["pago", "pendente", "cancelado"].indexOf(status) < 0) return resp({ error: "Situação inválida" }, 400);
    const p = await env.DB.prepare(
      "SELECT p.id, p.status, p.nome, p.email, p.token, p.qtd, e.slug, e.titulo FROM evento_pedidos p JOIN eventos e ON e.id = p.evento_id WHERE p.id = ? AND e.portal_id = ?"
    ).bind(parseInt(corpo.id, 10) || 0, portal.id).first();
    if (!p) return resp({ error: "Pedido não encontrado" }, 404);
    await env.DB.prepare("UPDATE evento_pedidos SET status = ?, pago_em = CASE WHEN ? = 'pago' THEN datetime('now') ELSE NULL END WHERE id = ?")
      .bind(status, status, p.id).run();
    // Avisa o comprador que as fotos foram liberadas (só na primeira vez que vira "pago").
    if (status === "pago" && p.status !== "pago") {
      await enviarEmail(env, p.email, "Suas fotos estão liberadas! - " + p.titulo,
        ["Olá, " + p.nome.split(" ")[0] + "!", portal.nome + " confirmou o seu pagamento. Suas " + p.qtd + " foto(s) de \"" + p.titulo + "\" já podem ser baixadas na qualidade original, sem marca d'água."],
        { texto: "Baixar minhas fotos", link: url.origin + "/e/" + p.slug + "?pedido=" + p.token });
    }
    return resp({ ok: true }, 200);
  }

  return resp({ error: "Rota não encontrada" }, 404);
}

/* ---------- público (quem compra as fotos) ---------- */

async function eventoPublico(env, slug) {
  return await env.DB.prepare(
    "SELECT e.*, p.nome AS estudio, p.cor, p.instrucoes_pagamento, p.user_id FROM eventos e JOIN portais p ON p.id = e.portal_id WHERE e.slug = ? AND e.publicado = 1"
  ).bind(String(slug || "").toLowerCase()).first();
}

async function pedidoPorToken(env, token) {
  if (!/^[0-9a-f]{48}$/.test(String(token || ""))) return null;
  return await env.DB.prepare(
    "SELECT p.*, e.slug, e.titulo, e.portal_id, pt.nome AS estudio, pt.cor, pt.instrucoes_pagamento FROM evento_pedidos p " +
    "JOIN eventos e ON e.id = p.evento_id JOIN portais pt ON pt.id = e.portal_id WHERE p.token = ?"
  ).bind(token).first();
}

export async function tratarEventoPublico(request, env, url) {
  const caminho = url.pathname;

  if (caminho === "/api/e/info" && request.method === "GET") {
    const ev = await eventoPublico(env, url.searchParams.get("slug"));
    if (!ev) return resp({ error: "Evento não encontrado" }, 404);
    const n = await env.DB.prepare("SELECT COUNT(*) AS n FROM evento_fotos WHERE evento_id = ?").bind(ev.id).first();
    const t = eventoParaTela(ev);
    delete t.marca_texto;
    delete t.publicado;
    delete t.id;
    t.estudio = ev.estudio;
    t.cor = ev.cor;
    t.total_fotos = n.n;
    return resp(t, 200);
  }

  if (caminho === "/api/e/fotos" && request.method === "GET") {
    const ev = await eventoPublico(env, url.searchParams.get("slug"));
    if (!ev) return resp({ error: "Evento não encontrado" }, 404);
    const pagina = Math.max(0, parseInt(url.searchParams.get("pagina"), 10) || 0);
    const numero = String(url.searchParams.get("numero") || "").replace(/[^0-9a-zA-Z]/g, "").toUpperCase().slice(0, 10);
    const filtro = numero ? " AND f.numeros LIKE ?" : "";
    const params = numero ? [ev.id, "%," + numero + ",%"] : [ev.id];
    const total = await env.DB.prepare("SELECT COUNT(*) AS n FROM evento_fotos f WHERE f.evento_id = ?" + filtro).bind(...params).first();
    const r = await env.DB.prepare(
      "SELECT f.id, f.numeros, p.object_key, p.name FROM evento_fotos f JOIN files p ON p.id = f.previa_id WHERE f.evento_id = ?" + filtro +
      " ORDER BY f.id LIMIT ? OFFSET ?"
    ).bind(...params, POR_PAGINA_PUBLICO, pagina * POR_PAGINA_PUBLICO).all();
    const fotos = [];
    for (const f of r.results) {
      // Só a prévia (pequena e com marca d'água). O original nunca sai antes do pagamento.
      fotos.push({ id: f.id, previa: await urlArquivo(env, f.object_key, f.name, false, 3600) });
    }
    return resp({ total: total.n, pagina: pagina, por_pagina: POR_PAGINA_PUBLICO, fotos: fotos }, 200);
  }

  if (caminho === "/api/e/pedido" && request.method === "GET") {
    const p = await pedidoPorToken(env, url.searchParams.get("token"));
    if (!p) return resp({ error: "Pedido não encontrado" }, 404);
    const ids = p.fotos.split(",").filter(Boolean).map(Number).slice(0, MAX_FOTOS_PEDIDO);
    const fotos = [];
    if (ids.length) {
      const r = await env.DB.prepare(
        "SELECT f.id, pv.object_key, pv.name FROM evento_fotos f JOIN files pv ON pv.id = f.previa_id WHERE f.evento_id = ? AND f.id IN (" +
        ids.map(function () { return "?"; }).join(",") + ") ORDER BY f.id"
      ).bind(p.evento_id, ...ids).all();
      for (const f of r.results) fotos.push({ id: f.id, previa: await urlArquivo(env, f.object_key, f.name, false, 3600) });
    }
    return resp({
      evento: { slug: p.slug, titulo: p.titulo, estudio: p.estudio, cor: p.cor },
      pedido: { nome: p.nome, qtd: p.qtd, valor_centavos: p.valor_centavos, status: p.status, pago_em: p.pago_em, criado: p.created_at },
      instrucoes_pagamento: p.status === "pendente" ? p.instrucoes_pagamento : null,
      fotos: fotos
    }, 200);
  }

  // Original sem marca d'água: só para pedido pago, e só das fotos do pedido.
  if (caminho === "/api/e/baixar" && request.method === "GET") {
    const p = await pedidoPorToken(env, url.searchParams.get("token"));
    if (!p) return resp({ error: "Pedido não encontrado" }, 404);
    if (p.status !== "pago") return resp({ error: "As fotos são liberadas assim que o fotógrafo confirmar o pagamento." }, 402);
    const fotoId = parseInt(url.searchParams.get("foto"), 10) || 0;
    if (p.fotos.indexOf("," + fotoId + ",") < 0) return resp({ error: "Foto não faz parte deste pedido" }, 404);
    const f = await env.DB.prepare(
      "SELECT o.object_key, o.name FROM evento_fotos f JOIN files o ON o.id = f.original_id WHERE f.id = ? AND f.evento_id = ?"
    ).bind(fotoId, p.evento_id).first();
    if (!f) return resp({ error: "Foto não encontrada" }, 404);
    return resp({ url: await urlArquivo(env, f.object_key, f.name, true, 300) }, 200);
  }

  if (caminho === "/api/e/pedido" && request.method === "POST") {
    if (!origemOk(request, url)) return resp({ error: "Origem inválida" }, 403);
    const corpo = await lerJson(request);
    if (!corpo) return resp({ error: "JSON inválido" }, 400);
    const ev = await eventoPublico(env, corpo.slug);
    if (!ev) return resp({ error: "Evento não encontrado" }, 404);
    if (!ev.instrucoes_pagamento) return resp({ error: "O fotógrafo ainda não informou como receber. Tente mais tarde." }, 400);
    const nome = texto(corpo.nome, 80);
    const email = String(corpo.email || "").trim().toLowerCase();
    const whatsapp = texto(corpo.whatsapp, 20).replace(/[^0-9()+\s-]/g, "");
    if (nome.length < 2) return resp({ error: "Digite seu nome" }, 400);
    if (!EMAIL_OK.test(email) || email.length > 120) return resp({ error: "E-mail inválido (é por ele que as fotos chegam)" }, 400);
    const pedidas = Array.from(new Set((Array.isArray(corpo.fotos) ? corpo.fotos : []).map(function (x) { return parseInt(x, 10); }).filter(Boolean)));
    if (!pedidas.length) return resp({ error: "Escolha pelo menos 1 foto" }, 400);
    if (pedidas.length > MAX_FOTOS_PEDIDO) return resp({ error: "No máximo " + MAX_FOTOS_PEDIDO + " fotos por pedido" }, 400);
    const validas = await env.DB.prepare(
      "SELECT id FROM evento_fotos WHERE evento_id = ? AND id IN (" + pedidas.map(function () { return "?"; }).join(",") + ")"
    ).bind(ev.id, ...pedidas).all();
    if (validas.results.length !== pedidas.length) return resp({ error: "Alguma foto escolhida não está mais disponível. Atualize a página." }, 400);
    if (!(await dentroDoLimite(env, await chaveIp(request), "evento_pedido", MAX_PEDIDOS_HORA))) {
      return resp({ error: "Muitos pedidos em pouco tempo. Tente de novo mais tarde." }, 429);
    }
    // Preço sempre calculado aqui no servidor, nunca vem do navegador.
    const conta = calcularTotal(ev.preco_centavos, lerFaixas(ev.faixas), pedidas.length);
    const b = new Uint8Array(24);
    crypto.getRandomValues(b);
    const token = paraHex(b);
    pedidas.sort(function (a, c) { return a - c; });
    const r = await env.DB.prepare(
      "INSERT INTO evento_pedidos (evento_id, token, nome, email, whatsapp, fotos, qtd, valor_centavos) VALUES (?, ?, ?, ?, ?, ?, ?, ?)"
    ).bind(ev.id, token, nome, email, whatsapp || null, "," + pedidas.join(",") + ",", pedidas.length, conta.total).run();
    const link = url.origin + "/e/" + ev.slug + "?pedido=" + token;

    // Aviso para o fotógrafo conferir o PIX e para o comprador guardar o link.
    const dono = await env.DB.prepare("SELECT email FROM users WHERE id = ?").bind(ev.user_id).first();
    if (dono) {
      await enviarEmail(env, dono.email, "Novo pedido de fotos: " + reais(conta.total) + " - " + ev.titulo,
        [nome + " (" + email + (whatsapp ? ", WhatsApp " + whatsapp : "") + ") pediu " + pedidas.length + " foto(s) de \"" + ev.titulo + "\" e vai pagar " + reais(conta.total) + " no seu PIX.",
         "Quando o dinheiro cair, abra os pedidos do evento e clique em \"Pago\": as fotos são liberadas na hora para a pessoa."],
        { texto: "Ver pedidos", link: url.origin + "/meu-portal?aba=abertos" });
    }
    await enviarEmail(env, email, "Seu pedido de fotos - " + ev.titulo,
      ["Olá, " + nome.split(" ")[0] + "!", "Recebemos o seu pedido de " + pedidas.length + " foto(s) de \"" + ev.titulo + "\", no valor de " + reais(conta.total) + ".",
       "Como pagar (direto para " + ev.estudio + "):\n" + ev.instrucoes_pagamento,
       "Assim que o fotógrafo confirmar o pagamento, você recebe outro e-mail e baixa as fotos originais, sem marca d'água, por este link:"],
      { texto: "Acompanhar meu pedido", link: link });
    console.log("Pedido de evento", r.meta.last_row_id, "evento", ev.id, pedidas.length, "fotos", conta.total);
    return resp({ ok: true, token: token, qtd: pedidas.length, valor_centavos: conta.total, instrucoes_pagamento: ev.instrucoes_pagamento }, 200);
  }

  return resp({ error: "Rota não encontrada" }, 404);
}
