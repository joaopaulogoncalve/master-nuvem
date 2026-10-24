// Portal do Cliente (v1: fotografia e vídeo).
// /api/portal/*  → o assinante (fotógrafo) configura o portal, cria clientes e álbuns.
// /api/p/*       → o cliente final do fotógrafo entra, vê só os álbuns dele, marca favoritas e baixa.
import { urlArquivo, removerObjeto } from "./arquivos.js";

const enc = new TextEncoder();
const DIAS_SESSAO_CLIENTE = 30;
const POR_PAGINA = 40;
const MAX_APAGAR_POR_VEZ = 40;
const EMAIL_OK = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const SLUG_OK = /^[a-z0-9](?:[a-z0-9-]{1,38}[a-z0-9])$/;
const COR_OK = /^#[0-9a-fA-F]{6}$/;
const IMAGEM = /\.(jpe?g|png|webp|gif|avif|jfif)$/i;
const VIDEO = /\.(mp4|mov|m4v|webm|avi|mkv)$/i;
// Como o fotógrafo cobra cada serviço da tabela de preços.
export const UNIDADES = {
  foto: "por foto", edicao: "por foto editada", video: "por vídeo", minuto: "por minuto de vídeo",
  hora: "por hora", pacote: "por pacote/serviço", km: "por km"
};
export const TIPOS_FOTO = [
  "Casamento", "Pré-wedding", "Ensaio de casal", "Bodas", "15 anos", "Aniversário infantil", "Aniversário adulto",
  "Smash the cake", "Chá revelação / chá de bebê", "Gestante", "Newborn", "Ensaio de família", "Ensaio pet", "Batizado",
  "Eventos religiosos", "Formatura", "Book / moda", "Corporativo e eventos", "Produto e gastronomia", "Imóveis",
  "Shows e esportes", "Drone", "Outro"
];

function resp(obj, status, cookie) {
  const headers = new Headers({ "Content-Type": "application/json" });
  if (cookie) headers.append("Set-Cookie", cookie);
  return new Response(JSON.stringify(obj), { status: status, headers: headers });
}

function paraHex(buf) {
  return Array.from(new Uint8Array(buf)).map(function (b) {
    return b.toString(16).padStart(2, "0");
  }).join("");
}

function deHex(h) {
  const out = new Uint8Array(h.length / 2);
  for (let i = 0; i < out.length; i++) out[i] = parseInt(h.substr(i * 2, 2), 16);
  return out;
}

async function sha256Hex(txt) {
  return paraHex(await crypto.subtle.digest("SHA-256", enc.encode(txt)));
}

async function derivarSenha(senha, saltBytes) {
  const chave = await crypto.subtle.importKey("raw", enc.encode(senha), "PBKDF2", false, ["deriveBits"]);
  const bits = await crypto.subtle.deriveBits(
    { name: "PBKDF2", salt: saltBytes, iterations: 100000, hash: "SHA-256" }, chave, 256
  );
  return paraHex(bits);
}

function iguais(a, b) {
  if (a.length !== b.length) return false;
  let r = 0;
  for (let i = 0; i < a.length; i++) r |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return r === 0;
}

function lerCookie(request, nome) {
  const partes = (request.headers.get("Cookie") || "").split(";");
  for (const p of partes) {
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
  try {
    return await request.json();
  } catch (e) {
    return null;
  }
}

function texto(v, max) {
  return String(v || "").replace(/[\u0000-\u001f]/g, " ").trim().slice(0, max);
}

async function novaSenhaHash(senha) {
  const salt = new Uint8Array(16);
  crypto.getRandomValues(salt);
  return { hash: await derivarSenha(senha, salt), salt: paraHex(salt) };
}

function cookieCliente(token, maxAge) {
  return "portal_sessao=" + token + "; HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=" + maxAge;
}

function tipoArquivo(nome) {
  if (IMAGEM.test(nome)) return "foto";
  if (VIDEO.test(nome)) return "video";
  return "outro";
}

// Valor digitado ("800", "800,50", "1.234,56") → centavos. Devolve null se inválido.
function paraCentavos(v) {
  let t = String(v === undefined || v === null ? "" : v).trim().replace(/^R\$\s*/i, "");
  if (typeof v === "number") t = v.toFixed(2);
  else if (t.indexOf(",") > -1) t = t.replace(/\./g, "").replace(",", ".");
  if (!/^\d+(\.\d{1,2})?$/.test(t)) return null;
  const c = Math.round(parseFloat(t) * 100);
  return c >= 100 && c <= 10000000 ? c : null;
}

// Álbum trancado = tem cobrança pendente marcada para segurar o álbum até o pagamento.
async function albumTrancado(env, albumId) {
  const r = await env.DB.prepare(
    "SELECT 1 AS t FROM cobrancas b JOIN portais p ON p.id = b.portal_id WHERE b.album_id = ? AND b.status = 'pendente' AND b.bloqueia_album = 1 AND p.cobrar = 1 LIMIT 1"
  ).bind(albumId).first();
  return !!r;
}

// Monta uma página de arquivos de um álbum, com link de prévia (só imagens) e se é favorita do cliente.
// semPrevia = true quando o álbum está trancado para o cliente (não gera link nenhum do arquivo).
async function paginaArquivos(env, albumId, clienteId, pagina, semPrevia) {
  const total = await env.DB.prepare(
    "SELECT COUNT(*) AS n, COALESCE(SUM(size_bytes), 0) AS bytes FROM files WHERE album_id = ? AND status = 'ready'"
  ).bind(albumId).first();
  const r = await env.DB.prepare(
    "SELECT f.id, f.name, f.size_bytes, f.object_key, " +
    "EXISTS (SELECT 1 FROM favoritos v WHERE v.file_id = f.id AND v.cliente_id = ?) AS favorito " +
    "FROM files f WHERE f.album_id = ? AND f.status = 'ready' ORDER BY f.name, f.id LIMIT ? OFFSET ?"
  ).bind(clienteId, albumId, POR_PAGINA, pagina * POR_PAGINA).all();
  const arquivos = [];
  for (const f of r.results) {
    const tipo = tipoArquivo(f.name);
    arquivos.push({
      id: f.id,
      nome: f.name,
      tamanho: f.size_bytes,
      tipo: tipo,
      favorito: !!f.favorito,
      previa: tipo === "foto" && !semPrevia ? await urlArquivo(env, f.object_key, f.name, false, 3600) : null
    });
  }
  return { total: total.n, bytes: total.bytes, pagina: pagina, por_pagina: POR_PAGINA, arquivos: arquivos };
}

/* ---------- assinante (fotógrafo) ---------- */

async function usuarioLogado(request, env) {
  const token = lerCookie(request, "sessao");
  if (!token) return null;
  return await env.DB.prepare(
    "SELECT u.id, u.email FROM sessions s JOIN users u ON u.id = s.user_id WHERE s.token_hash = ? AND s.pending = 0 AND s.expires_at > datetime('now')"
  ).bind(await sha256Hex(token)).first();
}

async function temPlano(env, userId) {
  const p = await env.DB.prepare(
    "SELECT id FROM subscriptions WHERE user_id = ? AND status = 'active' AND paid_until > datetime('now') LIMIT 1"
  ).bind(userId).first();
  return !!p;
}

export async function tratarPortalDono(request, env, url) {
  const caminho = url.pathname;
  const u = await usuarioLogado(request, env);
  if (!u) return resp({ error: "Não autenticado" }, 401);

  const portal = await env.DB.prepare("SELECT id, slug, nome, cor, ramo, instrucoes_pagamento, cobrar FROM portais WHERE user_id = ?").bind(u.id).first();

  if (caminho === "/api/portal" && request.method === "GET") {
    return resp({ portal: portal, plano: await temPlano(env, u.id), tipos: TIPOS_FOTO }, 200);
  }

  if (caminho === "/api/portal/clientes" && request.method === "GET") {
    if (!portal) return resp({ clientes: [] }, 200);
    const r = await env.DB.prepare(
      "SELECT c.id, c.nome, c.email, c.created_at, (SELECT COUNT(*) FROM albuns a WHERE a.cliente_id = c.id) AS albuns " +
      "FROM portal_clientes c WHERE c.portal_id = ? ORDER BY c.nome"
    ).bind(portal.id).all();
    return resp({ clientes: r.results }, 200);
  }

  if (caminho === "/api/portal/albuns" && request.method === "GET") {
    if (!portal) return resp({ albuns: [] }, 200);
    const r = await env.DB.prepare(
      "SELECT a.id, a.titulo, a.tipo, a.created_at, a.cliente_id, c.nome AS cliente, " +
      "(SELECT COUNT(*) FROM files f WHERE f.album_id = a.id AND f.status = 'ready') AS arquivos, " +
      "(SELECT COALESCE(SUM(size_bytes), 0) FROM files f WHERE f.album_id = a.id AND f.status = 'ready') AS bytes, " +
      "(SELECT COUNT(*) FROM favoritos v JOIN files f ON f.id = v.file_id WHERE f.album_id = a.id) AS favoritas, " +
      "EXISTS (SELECT 1 FROM cobrancas b JOIN portais p ON p.id = b.portal_id WHERE b.album_id = a.id AND b.status = 'pendente' AND b.bloqueia_album = 1 AND p.cobrar = 1) AS trancado " +
      "FROM albuns a JOIN portal_clientes c ON c.id = a.cliente_id WHERE a.portal_id = ? ORDER BY a.id DESC"
    ).bind(portal.id).all();
    return resp({ albuns: r.results }, 200);
  }

  if (caminho === "/api/portal/album" && request.method === "GET") {
    if (!portal) return resp({ error: "Crie o seu portal primeiro" }, 400);
    const album = await env.DB.prepare(
      "SELECT a.id, a.titulo, a.tipo, a.cliente_id, c.nome AS cliente FROM albuns a JOIN portal_clientes c ON c.id = a.cliente_id WHERE a.id = ? AND a.portal_id = ?"
    ).bind(parseInt(url.searchParams.get("id"), 10) || 0, portal.id).first();
    if (!album) return resp({ error: "Álbum não encontrado" }, 404);
    if (url.searchParams.get("favoritas") === "1") {
      // Lista de nomes das favoritas, para o fotógrafo copiar e montar o álbum impresso.
      const f = await env.DB.prepare(
        "SELECT f.name FROM favoritos v JOIN files f ON f.id = v.file_id WHERE f.album_id = ? AND v.cliente_id = ? ORDER BY f.name"
      ).bind(album.id, album.cliente_id).all();
      return resp({ album: album, favoritas: f.results.map(function (x) { return x.name; }) }, 200);
    }
    const pagina = Math.max(0, parseInt(url.searchParams.get("pagina"), 10) || 0);
    const dados = await paginaArquivos(env, album.id, album.cliente_id, pagina);
    dados.album = album;
    return resp(dados, 200);
  }

  if (caminho === "/api/portal/cobrancas" && request.method === "GET") {
    if (!portal) return resp({ cobrancas: [], resumo: null }, 200);
    const r = await env.DB.prepare(
      "SELECT b.id, b.descricao, b.valor_centavos, b.vencimento, b.link_pagamento, b.bloqueia_album, b.status, b.pago_em, b.created_at, b.itens, " +
      "b.cliente_id, c.nome AS cliente, b.album_id, a.titulo AS album " +
      "FROM cobrancas b JOIN portal_clientes c ON c.id = b.cliente_id LEFT JOIN albuns a ON a.id = b.album_id " +
      "WHERE b.portal_id = ? ORDER BY CASE b.status WHEN 'pendente' THEN 0 WHEN 'pago' THEN 1 ELSE 2 END, b.id DESC LIMIT 300"
    ).bind(portal.id).all();
    const resumo = await env.DB.prepare(
      "SELECT COALESCE(SUM(CASE WHEN status = 'pendente' THEN valor_centavos END), 0) AS a_receber, " +
      "COALESCE(SUM(CASE WHEN status = 'pago' AND pago_em >= date('now', 'start of month') THEN valor_centavos END), 0) AS recebido_mes, " +
      "COALESCE(SUM(CASE WHEN status = 'pendente' AND vencimento IS NOT NULL AND vencimento < date('now') THEN valor_centavos END), 0) AS atrasado " +
      "FROM cobrancas WHERE portal_id = ?"
    ).bind(portal.id).first();
    const precos = await env.DB.prepare("SELECT id, nome, unidade, valor_centavos FROM precos WHERE portal_id = ? ORDER BY id").bind(portal.id).all();
    return resp({ cobrancas: r.results, resumo: resumo, precos: precos.results, unidades: UNIDADES }, 200);
  }

  if (request.method !== "POST") return resp({ error: "Método não permitido" }, 405);
  if (!origemOk(request, url)) return resp({ error: "Origem inválida" }, 403);
  const corpo = await lerJson(request);
  if (!corpo) return resp({ error: "JSON inválido" }, 400);

  if (caminho === "/api/portal/salvar") {
    const nome = texto(corpo.nome, 60);
    const slug = String(corpo.slug || "").trim().toLowerCase();
    const cor = String(corpo.cor || "");
    if (nome.length < 2) return resp({ error: "Digite o nome do seu estúdio" }, 400);
    if (!SLUG_OK.test(slug)) return resp({ error: "Endereço inválido: use de 3 a 40 letras minúsculas, números e hífen (ex.: estudio-aurora)" }, 400);
    if (!COR_OK.test(cor)) return resp({ error: "Cor inválida" }, 400);
    if (!portal && !(await temPlano(env, u.id))) return resp({ error: "Você precisa de um plano ativo para criar o portal" }, 403);
    try {
      if (portal) {
        await env.DB.prepare("UPDATE portais SET nome = ?, slug = ?, cor = ? WHERE id = ?").bind(nome, slug, cor, portal.id).run();
      } else {
        await env.DB.prepare("INSERT INTO portais (user_id, slug, nome, cor) VALUES (?, ?, ?, ?)").bind(u.id, slug, nome, cor).run();
      }
    } catch (e) {
      if (String(e.message).includes("UNIQUE")) return resp({ error: "Esse endereço já está em uso. Escolha outro." }, 409);
      throw e;
    }
    return resp({ ok: true }, 200);
  }

  if (!portal) return resp({ error: "Crie o seu portal primeiro" }, 400);

  if (caminho === "/api/portal/pagamento") {
    // Como o cliente paga: chave PIX, banco, link fixo... Aparece para o cliente em toda cobrança.
    // "cobrar" = 1: usa a central de cobranças; 0: acesso livre (o cliente vê e baixa tudo, nada fica trancado).
    if (corpo.cobrar !== undefined) {
      await env.DB.prepare("UPDATE portais SET cobrar = ? WHERE id = ?").bind(corpo.cobrar ? 1 : 0, portal.id).run();
    }
    if (corpo.instrucoes !== undefined) {
      const instrucoes = String(corpo.instrucoes || "").replace(/[\u0000-\u0009\u000b-\u001f]/g, " ").trim().slice(0, 500);
      await env.DB.prepare("UPDATE portais SET instrucoes_pagamento = ? WHERE id = ?").bind(instrucoes || null, portal.id).run();
    }
    return resp({ ok: true }, 200);
  }

  if (caminho === "/api/portal/precos/salvar") {
    const nome = texto(corpo.nome, 60);
    const unidade = String(corpo.unidade || "");
    const valor = paraCentavos(corpo.valor);
    if (nome.length < 2) return resp({ error: "Dê um nome ao serviço (ex.: Foto extra)" }, 400);
    if (!UNIDADES[unidade]) return resp({ error: "Escolha como cobra (por foto, por vídeo...)" }, 400);
    if (valor === null) return resp({ error: "Preço inválido (entre R$ 1,00 e R$ 100.000,00)" }, 400);
    const id = parseInt(corpo.id, 10) || 0;
    if (id) {
      const r = await env.DB.prepare("UPDATE precos SET nome = ?, unidade = ?, valor_centavos = ? WHERE id = ? AND portal_id = ?")
        .bind(nome, unidade, valor, id, portal.id).run();
      if (!r.meta.changes) return resp({ error: "Preço não encontrado" }, 404);
    } else {
      const n = await env.DB.prepare("SELECT COUNT(*) AS n FROM precos WHERE portal_id = ?").bind(portal.id).first();
      if (n.n >= 50) return resp({ error: "Limite de 50 itens na tabela" }, 400);
      await env.DB.prepare("INSERT INTO precos (portal_id, nome, unidade, valor_centavos) VALUES (?, ?, ?, ?)").bind(portal.id, nome, unidade, valor).run();
    }
    return resp({ ok: true }, 200);
  }

  if (caminho === "/api/portal/precos/remover") {
    await env.DB.prepare("DELETE FROM precos WHERE id = ? AND portal_id = ?").bind(parseInt(corpo.id, 10) || 0, portal.id).run();
    return resp({ ok: true }, 200);
  }

  if (caminho === "/api/portal/cobrancas/nova") {
    const cli = await env.DB.prepare("SELECT id FROM portal_clientes WHERE id = ? AND portal_id = ?")
      .bind(parseInt(corpo.cliente_id, 10) || 0, portal.id).first();
    if (!cli) return resp({ error: "Escolha o cliente" }, 400);
    let albumId = null;
    if (corpo.album_id) {
      const a = await env.DB.prepare("SELECT id FROM albuns WHERE id = ? AND portal_id = ? AND cliente_id = ?")
        .bind(parseInt(corpo.album_id, 10) || 0, portal.id, cli.id).first();
      if (!a) return resp({ error: "Esse álbum não é desse cliente" }, 400);
      albumId = a.id;
    }
    // Itens da tabela de preços (o preço vem do banco, nunca do navegador) + valor avulso opcional.
    const itens = [];
    let valor = 0;
    for (const it of Array.isArray(corpo.itens) ? corpo.itens.slice(0, 30) : []) {
      const qtd = parseInt(it.qtd, 10);
      if (!qtd || qtd < 1 || qtd > 10000) return resp({ error: "Quantidade inválida" }, 400);
      const p = await env.DB.prepare("SELECT nome, unidade, valor_centavos FROM precos WHERE id = ? AND portal_id = ?")
        .bind(parseInt(it.preco_id, 10) || 0, portal.id).first();
      if (!p) return resp({ error: "Item da tabela não encontrado" }, 400);
      itens.push({ nome: p.nome, unidade: p.unidade, qtd: qtd, valor_centavos: p.valor_centavos });
      valor += p.valor_centavos * qtd;
    }
    if (corpo.valor !== undefined && corpo.valor !== null && String(corpo.valor).trim() !== "") {
      const avulso = paraCentavos(corpo.valor);
      if (avulso === null) return resp({ error: "Valor inválido (entre R$ 1,00 e R$ 100.000,00)" }, 400);
      if (itens.length) itens.push({ nome: texto(corpo.descricao, 60) || "Outros", unidade: "avulso", qtd: 1, valor_centavos: avulso });
      valor += avulso;
    }
    if (valor < 100 || valor > 10000000) return resp({ error: "Adicione itens da tabela ou um valor (total entre R$ 1,00 e R$ 100.000,00)" }, 400);
    let descricao = texto(corpo.descricao, 120);
    if (descricao.length < 2) {
      if (!itens.length) return resp({ error: "Descreva a cobrança (ex.: Saldo do casamento)" }, 400);
      descricao = itens.map(function (i) { return i.qtd + "x " + i.nome; }).join(", ").slice(0, 120);
    }
    const venc = String(corpo.vencimento || "");
    if (venc && !/^\d{4}-\d{2}-\d{2}$/.test(venc)) return resp({ error: "Data de vencimento inválida" }, 400);
    const link = String(corpo.link || "").trim();
    if (link && (!/^https:\/\/[^\s<>"']+$/.test(link) || link.length > 300)) return resp({ error: "O link de pagamento precisa começar com https://" }, 400);
    if (!link && !portal.instrucoes_pagamento) return resp({ error: "Informe um link de pagamento ou cadastre sua chave PIX em \"Como você recebe\"" }, 400);
    const r = await env.DB.prepare(
      "INSERT INTO cobrancas (portal_id, cliente_id, album_id, descricao, valor_centavos, vencimento, link_pagamento, bloqueia_album, itens) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)"
    ).bind(portal.id, cli.id, albumId, descricao, valor, venc || null, link || null, albumId && corpo.bloqueia_album ? 1 : 0,
      itens.length ? JSON.stringify(itens) : null).run();
    return resp({ ok: true, id: r.meta.last_row_id }, 200);
  }

  if (caminho === "/api/portal/cobrancas/status") {
    const status = String(corpo.status || "");
    if (["pago", "pendente", "cancelado"].indexOf(status) < 0) return resp({ error: "Situação inválida" }, 400);
    const r = await env.DB.prepare(
      "UPDATE cobrancas SET status = ?, pago_em = CASE WHEN ? = 'pago' THEN datetime('now') ELSE NULL END WHERE id = ? AND portal_id = ?"
    ).bind(status, status, parseInt(corpo.id, 10) || 0, portal.id).run();
    if (!r.meta.changes) return resp({ error: "Cobrança não encontrada" }, 404);
    return resp({ ok: true }, 200);
  }

  if (caminho === "/api/portal/clientes/novo") {
    const nome = texto(corpo.nome, 80);
    const email = String(corpo.email || "").trim().toLowerCase();
    const senha = String(corpo.senha || "");
    if (nome.length < 2) return resp({ error: "Digite o nome do cliente" }, 400);
    if (!EMAIL_OK.test(email) || email.length > 120) return resp({ error: "E-mail inválido" }, 400);
    if (senha.length < 8 || senha.length > 100) return resp({ error: "A senha precisa ter de 8 a 100 caracteres" }, 400);
    const h = await novaSenhaHash(senha);
    try {
      await env.DB.prepare(
        "INSERT INTO portal_clientes (portal_id, nome, email, password_hash, password_salt) VALUES (?, ?, ?, ?, ?)"
      ).bind(portal.id, nome, email, h.hash, h.salt).run();
    } catch (e) {
      if (String(e.message).includes("UNIQUE")) return resp({ error: "Você já tem um cliente com esse e-mail" }, 409);
      throw e;
    }
    return resp({ ok: true }, 200);
  }

  const cliente = corpo.cliente_id !== undefined
    ? await env.DB.prepare("SELECT id FROM portal_clientes WHERE id = ? AND portal_id = ?").bind(parseInt(corpo.cliente_id, 10) || 0, portal.id).first()
    : null;

  if (caminho === "/api/portal/clientes/senha") {
    if (!cliente) return resp({ error: "Cliente não encontrado" }, 404);
    const senha = String(corpo.senha || "");
    if (senha.length < 8 || senha.length > 100) return resp({ error: "A senha precisa ter de 8 a 100 caracteres" }, 400);
    const h = await novaSenhaHash(senha);
    await env.DB.prepare("UPDATE portal_clientes SET password_hash = ?, password_salt = ? WHERE id = ?").bind(h.hash, h.salt, cliente.id).run();
    await env.DB.prepare("DELETE FROM portal_sessoes WHERE cliente_id = ?").bind(cliente.id).run();
    return resp({ ok: true }, 200);
  }

  if (caminho === "/api/portal/clientes/remover") {
    if (!cliente) return resp({ error: "Cliente não encontrado" }, 404);
    const n = await env.DB.prepare("SELECT COUNT(*) AS n FROM albuns WHERE cliente_id = ?").bind(cliente.id).first();
    if (n.n > 0) return resp({ error: "Apague os álbuns deste cliente antes de removê-lo" }, 400);
    await env.DB.prepare("DELETE FROM favoritos WHERE cliente_id = ?").bind(cliente.id).run();
    await env.DB.prepare("DELETE FROM portal_sessoes WHERE cliente_id = ?").bind(cliente.id).run();
    await env.DB.prepare("DELETE FROM portal_clientes WHERE id = ?").bind(cliente.id).run();
    return resp({ ok: true }, 200);
  }

  if (caminho === "/api/portal/albuns/novo") {
    if (!cliente) return resp({ error: "Escolha o cliente do álbum" }, 400);
    const titulo = texto(corpo.titulo, 100);
    const tipo = TIPOS_FOTO.indexOf(corpo.tipo) > -1 ? corpo.tipo : "Outro";
    if (titulo.length < 2) return resp({ error: "Digite o nome do álbum" }, 400);
    const r = await env.DB.prepare(
      "INSERT INTO albuns (portal_id, cliente_id, titulo, tipo) VALUES (?, ?, ?, ?)"
    ).bind(portal.id, cliente.id, titulo, tipo).run();
    return resp({ ok: true, id: r.meta.last_row_id }, 200);
  }

  if (caminho === "/api/portal/albuns/remover") {
    const album = await env.DB.prepare("SELECT id FROM albuns WHERE id = ? AND portal_id = ?")
      .bind(parseInt(corpo.id, 10) || 0, portal.id).first();
    if (!album) return resp({ error: "Álbum não encontrado" }, 404);
    // Apaga as fotos no Backblaze aos poucos (limite de chamadas por vez); a tela chama de novo até zerar.
    const lote = await env.DB.prepare("SELECT id, object_key FROM files WHERE album_id = ? LIMIT ?")
      .bind(album.id, MAX_APAGAR_POR_VEZ).all();
    for (const f of lote.results) {
      const r = await removerObjeto(env, f.object_key);
      if (!r.ok && r.status !== 404) return resp({ error: "Não foi possível apagar agora. Tente de novo." }, 502);
      await env.DB.prepare("DELETE FROM favoritos WHERE file_id = ?").bind(f.id).run();
      await env.DB.prepare("DELETE FROM files WHERE id = ?").bind(f.id).run();
    }
    const resta = await env.DB.prepare("SELECT COUNT(*) AS n FROM files WHERE album_id = ?").bind(album.id).first();
    if (resta.n === 0) await env.DB.prepare("DELETE FROM albuns WHERE id = ?").bind(album.id).run();
    return resp({ ok: true, restantes: resta.n }, 200);
  }

  return resp({ error: "Rota não encontrada" }, 404);
}

/* ---------- cliente final do fotógrafo ---------- */

async function clienteLogado(request, env) {
  const token = lerCookie(request, "portal_sessao");
  if (!token) return null;
  return await env.DB.prepare(
    "SELECT c.id, c.nome, c.email, c.portal_id, p.slug, p.nome AS portal_nome, p.cor FROM portal_sessoes s " +
    "JOIN portal_clientes c ON c.id = s.cliente_id JOIN portais p ON p.id = c.portal_id " +
    "WHERE s.token_hash = ? AND s.expires_at > datetime('now')"
  ).bind(await sha256Hex(token)).first();
}

export async function tratarPortalCliente(request, env, url) {
  const caminho = url.pathname;

  if (caminho === "/api/p/info" && request.method === "GET") {
    const p = await env.DB.prepare("SELECT nome, cor, slug FROM portais WHERE slug = ?")
      .bind(String(url.searchParams.get("slug") || "").toLowerCase()).first();
    if (!p) return resp({ error: "Portal não encontrado" }, 404);
    return resp(p, 200);
  }

  if (caminho === "/api/p/login") {
    if (request.method !== "POST") return resp({ error: "Método não permitido" }, 405);
    if (!origemOk(request, url)) return resp({ error: "Origem inválida" }, 403);
    const corpo = await lerJson(request);
    if (!corpo) return resp({ error: "JSON inválido" }, 400);
    const c = await env.DB.prepare(
      "SELECT c.id, c.password_hash, c.password_salt FROM portal_clientes c JOIN portais p ON p.id = c.portal_id WHERE p.slug = ? AND c.email = ?"
    ).bind(String(corpo.slug || "").toLowerCase(), String(corpo.email || "").trim().toLowerCase()).first();
    const senha = String(corpo.senha || "");
    if (!c) {
      await derivarSenha(senha, new Uint8Array(16));
      return resp({ error: "E-mail ou senha incorretos" }, 401);
    }
    if (!iguais(await derivarSenha(senha, deHex(c.password_salt)), c.password_hash)) {
      return resp({ error: "E-mail ou senha incorretos" }, 401);
    }
    const b = new Uint8Array(32);
    crypto.getRandomValues(b);
    const token = paraHex(b);
    await env.DB.prepare("INSERT INTO portal_sessoes (token_hash, cliente_id, expires_at) VALUES (?, ?, datetime('now', ?))")
      .bind(await sha256Hex(token), c.id, "+" + DIAS_SESSAO_CLIENTE + " days").run();
    return resp({ ok: true }, 200, cookieCliente(token, DIAS_SESSAO_CLIENTE * 86400));
  }

  if (caminho === "/api/p/logout") {
    if (request.method !== "POST") return resp({ error: "Método não permitido" }, 405);
    if (!origemOk(request, url)) return resp({ error: "Origem inválida" }, 403);
    const token = lerCookie(request, "portal_sessao");
    if (token) await env.DB.prepare("DELETE FROM portal_sessoes WHERE token_hash = ?").bind(await sha256Hex(token)).run();
    return resp({ ok: true }, 200, cookieCliente("", 0));
  }

  const c = await clienteLogado(request, env);
  if (!c) return resp({ error: "Não autenticado" }, 401);

  if (caminho === "/api/p/me" && request.method === "GET") {
    const r = await env.DB.prepare(
      "SELECT a.id, a.titulo, a.tipo, a.created_at, " +
      "(SELECT COUNT(*) FROM files f WHERE f.album_id = a.id AND f.status = 'ready') AS arquivos, " +
      "(SELECT COUNT(*) FROM favoritos v JOIN files f ON f.id = v.file_id WHERE f.album_id = a.id AND v.cliente_id = a.cliente_id) AS favoritas, " +
      "EXISTS (SELECT 1 FROM cobrancas b JOIN portais p ON p.id = b.portal_id WHERE b.album_id = a.id AND b.status = 'pendente' AND b.bloqueia_album = 1 AND p.cobrar = 1) AS trancado " +
      "FROM albuns a WHERE a.cliente_id = ? ORDER BY a.id DESC"
    ).bind(c.id).all();
    const cob = await env.DB.prepare(
      "SELECT b.id, b.descricao, b.valor_centavos, b.vencimento, b.link_pagamento, b.status, b.pago_em, b.itens, a.titulo AS album " +
      "FROM cobrancas b LEFT JOIN albuns a ON a.id = b.album_id WHERE b.cliente_id = ? AND b.status != 'cancelado' ORDER BY b.status DESC, b.id DESC"
    ).bind(c.id).all();
    const instr = await env.DB.prepare("SELECT instrucoes_pagamento, cobrar FROM portais WHERE id = ?").bind(c.portal_id).first();
    return resp({
      nome: c.nome,
      portal: { slug: c.slug, nome: c.portal_nome, cor: c.cor, instrucoes_pagamento: instr ? instr.instrucoes_pagamento : null },
      albuns: r.results,
      // Acesso livre (cobrar = 0): o cliente não vê cobranças.
      cobrancas: instr && instr.cobrar ? cob.results.map(function (b) {
        let itens = [];
        try { itens = b.itens ? JSON.parse(b.itens) : []; } catch (e) {}
        b.itens = itens;
        return b;
      }) : []
    }, 200);
  }

  // Álbum só aparece se for deste cliente.
  async function albumDoCliente(id) {
    return await env.DB.prepare("SELECT id, titulo, tipo FROM albuns WHERE id = ? AND cliente_id = ?")
      .bind(parseInt(id, 10) || 0, c.id).first();
  }

  if (caminho === "/api/p/album" && request.method === "GET") {
    const album = await albumDoCliente(url.searchParams.get("id"));
    if (!album) return resp({ error: "Álbum não encontrado" }, 404);
    const pagina = Math.max(0, parseInt(url.searchParams.get("pagina"), 10) || 0);
    const trancado = await albumTrancado(env, album.id);
    const dados = await paginaArquivos(env, album.id, c.id, pagina, trancado);
    dados.album = album;
    dados.trancado = trancado;
    return resp(dados, 200);
  }

  if (caminho === "/api/p/baixar" && request.method === "GET") {
    const f = await env.DB.prepare(
      "SELECT f.object_key, f.name, f.album_id FROM files f JOIN albuns a ON a.id = f.album_id WHERE f.id = ? AND a.cliente_id = ? AND f.status = 'ready'"
    ).bind(parseInt(url.searchParams.get("id"), 10) || 0, c.id).first();
    if (!f) return resp({ error: "Arquivo não encontrado" }, 404);
    if (await albumTrancado(env, f.album_id)) return resp({ error: "Este álbum será liberado assim que o pagamento for confirmado pelo estúdio." }, 402);
    return resp({ url: await urlArquivo(env, f.object_key, f.name, true, 300) }, 200);
  }

  if (caminho === "/api/p/favorito") {
    if (request.method !== "POST") return resp({ error: "Método não permitido" }, 405);
    if (!origemOk(request, url)) return resp({ error: "Origem inválida" }, 403);
    const corpo = await lerJson(request);
    if (!corpo) return resp({ error: "JSON inválido" }, 400);
    const f = await env.DB.prepare(
      "SELECT f.id FROM files f JOIN albuns a ON a.id = f.album_id WHERE f.id = ? AND a.cliente_id = ?"
    ).bind(parseInt(corpo.file_id, 10) || 0, c.id).first();
    if (!f) return resp({ error: "Arquivo não encontrado" }, 404);
    if (corpo.favorito) {
      await env.DB.prepare("INSERT OR IGNORE INTO favoritos (cliente_id, file_id) VALUES (?, ?)").bind(c.id, f.id).run();
    } else {
      await env.DB.prepare("DELETE FROM favoritos WHERE cliente_id = ? AND file_id = ?").bind(c.id, f.id).run();
    }
    return resp({ ok: true }, 200);
  }

  return resp({ error: "Rota não encontrada" }, 404);
}
