// Portfólio público do fotógrafo (página de vendas dele, aberta no Google).
// /api/portfolio*  → o fotógrafo liga a página, preenche contatos, cria galerias, envia fotos e vê os pedidos de orçamento.
// /api/f/*         → o público vê a página (/f/<endereço do estúdio>) e pede orçamento.
// As fotos são uma versão leve (2000 px) feita no navegador do fotógrafo: files.uso = 'portfolio' (conta na cota).
import { urlArquivo, removerObjeto } from "./arquivos.js";
import { chaveIp, dentroDoLimite } from "./limite.js";
import { urlDoArquivo, usuarioLogado, emailComBotao } from "./portal.js";

const SITE = "https://masternuvem.com.br";
const MAX_GALERIAS = 12;
const MAX_FOTOS_GALERIA = 60;
const MAX_APAGAR_POR_VEZ = 40;
const MAX_ORCAMENTOS_HORA = 5;
const EMAIL_OK = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const SLUG_OK = /^[a-z0-9](?:[a-z0-9-]{1,38}[a-z0-9])$/;
export const TIPOS_ORCAMENTO = ["Casamento", "15 anos", "Aniversário / festa", "Ensaio", "Gestante / newborn", "Evento / empresa", "Vídeo", "Outro"];

function resp(obj, status) {
  return new Response(JSON.stringify(obj), { status: status, headers: { "Content-Type": "application/json" } });
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
function soNumeros(v) {
  return String(v || "").replace(/\D/g, "");
}
async function temPlano(env, userId) {
  const p = await env.DB.prepare("SELECT id FROM subscriptions WHERE user_id = ? AND status = 'active' AND paid_until > datetime('now') LIMIT 1").bind(userId).first();
  return !!p;
}

// Galerias com as fotos (link assinado de 1 hora). Usado na tela do fotógrafo e na página pública.
async function galeriasComFotos(env, portalId, comIds) {
  const gal = (await env.DB.prepare("SELECT id, titulo FROM portfolio_galerias WHERE portal_id = ? ORDER BY ordem, id").bind(portalId).all()).results;
  const fotos = (await env.DB.prepare(
    "SELECT pf.id, pf.galeria_id, f.id AS file_id, f.object_key, f.name FROM portfolio_fotos pf JOIN portfolio_galerias g ON g.id = pf.galeria_id " +
    "JOIN files f ON f.id = pf.file_id AND f.status = 'ready' WHERE g.portal_id = ? ORDER BY pf.ordem, pf.id"
  ).bind(portalId).all()).results;
  const porGaleria = {};
  for (const f of fotos) {
    const url = await urlArquivo(env, f.object_key, f.name, false, 3600);
    (porGaleria[f.galeria_id] = porGaleria[f.galeria_id] || []).push(comIds ? { id: f.id, file_id: f.file_id, url: url } : url);
  }
  return gal.map(function (g) { return { id: g.id, titulo: g.titulo, fotos: porGaleria[g.id] || [] }; });
}

// Apaga fotos do portfólio (arquivo no B2 + registros). Devolve quantas apagou.
async function apagarFotos(env, linhas) {
  let n = 0;
  for (const f of linhas) {
    try { await removerObjeto(env, f.object_key); } catch (e) { console.error("Portfólio: falha ao apagar no B2", e.message); }
    await env.DB.prepare("DELETE FROM portfolio_fotos WHERE id = ?").bind(f.id).run();
    await env.DB.prepare("DELETE FROM files WHERE id = ?").bind(f.file_id).run();
    await env.DB.prepare("UPDATE portais SET portfolio_capa_id = NULL WHERE portfolio_capa_id = ?").bind(f.file_id).run();
    n++;
  }
  return n;
}

export async function tratarPortfolioDono(request, env, url) {
  const caminho = url.pathname;
  const u = await usuarioLogado(request, env);
  if (!u) return resp({ error: "Não autenticado" }, 401);
  const portal = await env.DB.prepare(
    "SELECT id, slug, nome, bio, portfolio_ativo, portfolio_titulo, portfolio_capa_id, whatsapp, instagram, cidade FROM portais WHERE user_id = ?"
  ).bind(u.id).first();
  if (!portal) return resp({ error: "Crie a sua página primeiro (🎨 Minha página).", sem_portal: true }, 404);

  if (caminho === "/api/portfolio" && request.method === "GET") {
    const orc = await env.DB.prepare(
      "SELECT id, nome, email, whatsapp, tipo, quando, mensagem, status, created_at FROM orcamentos WHERE portal_id = ? AND status != 'arquivado' ORDER BY id DESC LIMIT 50"
    ).bind(portal.id).all();
    return resp({
      portfolio: {
        ativo: !!portal.portfolio_ativo, titulo: portal.portfolio_titulo || "", capa_id: portal.portfolio_capa_id,
        whatsapp: portal.whatsapp || "", instagram: portal.instagram || "", cidade: portal.cidade || "",
        link: SITE + "/f/" + portal.slug
      },
      galerias: await galeriasComFotos(env, portal.id, true),
      orcamentos: orc.results,
      tipos: TIPOS_ORCAMENTO
    }, 200);
  }

  if (request.method !== "POST") return resp({ error: "Método não permitido" }, 405);
  if (!origemOk(request, url)) return resp({ error: "Origem inválida" }, 403);
  const corpo = (await lerJson(request)) || {};

  if (caminho === "/api/portfolio/salvar") {
    const whats = soNumeros(corpo.whatsapp);
    if (whats && (whats.length < 10 || whats.length > 13)) return resp({ error: "WhatsApp: coloque o número com DDD (ex.: 62 98888-7777)." }, 400);
    const insta = texto(corpo.instagram, 40).replace(/^@+/, "").replace(/^https?:\/\/(www\.)?instagram\.com\//i, "").replace(/\/.*$/, "");
    if (insta && !/^[A-Za-z0-9._]{1,30}$/.test(insta)) return resp({ error: "Instagram: coloque só o seu @ (ex.: @estudioana)." }, 400);
    const ativo = corpo.ativo ? 1 : 0;
    if (ativo && !(await temPlano(env, u.id))) return resp({ error: "Para colocar a página no ar é preciso ter um plano ativo." }, 403);
    let capa = portal.portfolio_capa_id;
    if (corpo.capa_id !== undefined) {
      capa = null;
      if (corpo.capa_id !== null) {
        const f = await env.DB.prepare(
          "SELECT f.id FROM portfolio_fotos pf JOIN portfolio_galerias g ON g.id = pf.galeria_id JOIN files f ON f.id = pf.file_id WHERE f.id = ? AND g.portal_id = ?"
        ).bind(parseInt(corpo.capa_id, 10) || 0, portal.id).first();
        if (!f) return resp({ error: "Foto de capa não encontrada" }, 404);
        capa = f.id;
      }
    }
    await env.DB.prepare("UPDATE portais SET portfolio_ativo = ?, portfolio_titulo = ?, whatsapp = ?, instagram = ?, cidade = ?, portfolio_capa_id = ? WHERE id = ?")
      .bind(ativo, texto(corpo.titulo, 90) || null, whats || null, insta || null, texto(corpo.cidade, 60) || null, capa, portal.id).run();
    return resp({ ok: true, link: SITE + "/f/" + portal.slug }, 200);
  }

  if (caminho === "/api/portfolio/galerias/nova") {
    const titulo = texto(corpo.titulo, 60);
    if (!titulo) return resp({ error: "Dê um nome para a galeria (ex.: Casamentos)." }, 400);
    const n = await env.DB.prepare("SELECT COUNT(*) AS n, COALESCE(MAX(ordem), 0) AS ordem FROM portfolio_galerias WHERE portal_id = ?").bind(portal.id).first();
    if (n.n >= MAX_GALERIAS) return resp({ error: "Limite de " + MAX_GALERIAS + " galerias." }, 400);
    const r = await env.DB.prepare("INSERT INTO portfolio_galerias (portal_id, titulo, ordem) VALUES (?, ?, ?)").bind(portal.id, titulo, n.ordem + 1).run();
    return resp({ ok: true, id: r.meta.last_row_id }, 200);
  }

  if (caminho === "/api/portfolio/galerias/renomear") {
    const titulo = texto(corpo.titulo, 60);
    if (!titulo) return resp({ error: "Dê um nome para a galeria." }, 400);
    const r = await env.DB.prepare("UPDATE portfolio_galerias SET titulo = ? WHERE id = ? AND portal_id = ?").bind(titulo, parseInt(corpo.id, 10) || 0, portal.id).run();
    return resp(r.meta.changes ? { ok: true } : { error: "Galeria não encontrada" }, r.meta.changes ? 200 : 404);
  }

  // Remove a galeria e as fotos dela, em lotes (a tela chama de novo enquanto "restam" > 0).
  if (caminho === "/api/portfolio/galerias/remover") {
    const g = await env.DB.prepare("SELECT id FROM portfolio_galerias WHERE id = ? AND portal_id = ?").bind(parseInt(corpo.id, 10) || 0, portal.id).first();
    if (!g) return resp({ error: "Galeria não encontrada" }, 404);
    const fotos = (await env.DB.prepare(
      "SELECT pf.id, f.id AS file_id, f.object_key FROM portfolio_fotos pf JOIN files f ON f.id = pf.file_id WHERE pf.galeria_id = ? LIMIT ?"
    ).bind(g.id, MAX_APAGAR_POR_VEZ).all()).results;
    await apagarFotos(env, fotos);
    const resto = await env.DB.prepare("SELECT COUNT(*) AS n FROM portfolio_fotos WHERE galeria_id = ?").bind(g.id).first();
    if (resto.n === 0) await env.DB.prepare("DELETE FROM portfolio_galerias WHERE id = ?").bind(g.id).run();
    return resp({ ok: true, restam: resto.n }, 200);
  }

  // Liga uma foto já enviada (files.uso = 'portfolio', status ready) a uma galeria.
  if (caminho === "/api/portfolio/fotos/adicionar") {
    const g = await env.DB.prepare("SELECT id FROM portfolio_galerias WHERE id = ? AND portal_id = ?").bind(parseInt(corpo.galeria_id, 10) || 0, portal.id).first();
    if (!g) return resp({ error: "Galeria não encontrada" }, 404);
    const n = await env.DB.prepare("SELECT COUNT(*) AS n, COALESCE(MAX(ordem), 0) AS ordem FROM portfolio_fotos WHERE galeria_id = ?").bind(g.id).first();
    if (n.n >= MAX_FOTOS_GALERIA) return resp({ error: "Cada galeria tem até " + MAX_FOTOS_GALERIA + " fotos. Escolha as melhores!" }, 400);
    const f = await env.DB.prepare("SELECT id FROM files WHERE id = ? AND user_id = ? AND uso = 'portfolio' AND status = 'ready'").bind(parseInt(corpo.file_id, 10) || 0, u.id).first();
    if (!f) return resp({ error: "Foto não encontrada" }, 404);
    const ja = await env.DB.prepare("SELECT id FROM portfolio_fotos WHERE file_id = ?").bind(f.id).first();
    if (ja) return resp({ error: "Essa foto já está no portfólio" }, 400);
    const r = await env.DB.prepare("INSERT INTO portfolio_fotos (galeria_id, file_id, ordem) VALUES (?, ?, ?)").bind(g.id, f.id, n.ordem + 1).run();
    return resp({ ok: true, id: r.meta.last_row_id }, 200);
  }

  if (caminho === "/api/portfolio/fotos/remover") {
    const f = await env.DB.prepare(
      "SELECT pf.id, f.id AS file_id, f.object_key FROM portfolio_fotos pf JOIN portfolio_galerias g ON g.id = pf.galeria_id JOIN files f ON f.id = pf.file_id WHERE pf.id = ? AND g.portal_id = ?"
    ).bind(parseInt(corpo.id, 10) || 0, portal.id).first();
    if (!f) return resp({ error: "Foto não encontrada" }, 404);
    await apagarFotos(env, [f]);
    return resp({ ok: true }, 200);
  }

  if (caminho === "/api/portfolio/orcamentos/status") {
    const status = String(corpo.status || "");
    if (["novo", "respondido", "arquivado"].indexOf(status) < 0) return resp({ error: "Situação inválida" }, 400);
    const r = await env.DB.prepare("UPDATE orcamentos SET status = ? WHERE id = ? AND portal_id = ?").bind(status, parseInt(corpo.id, 10) || 0, portal.id).run();
    return resp(r.meta.changes ? { ok: true } : { error: "Pedido não encontrado" }, r.meta.changes ? 200 : 404);
  }

  return resp({ error: "Rota não encontrada" }, 404);
}

// Portfólio no ar = ligado pelo fotógrafo, com plano ativo e pelo menos 1 foto.
async function portfolioNoAr(env, slug) {
  if (!SLUG_OK.test(slug)) return null;
  const p = await env.DB.prepare(
    "SELECT p.*, u.email AS dono_email FROM portais p JOIN users u ON u.id = p.user_id WHERE p.slug = ? AND p.portfolio_ativo = 1"
  ).bind(slug).first();
  if (!p || !(await temPlano(env, p.user_id))) return null;
  return p;
}

// Endereços dos portfólios no ar, para o sitemap.xml.
export async function portfoliosNoAr(env) {
  const r = await env.DB.prepare(
    "SELECT DISTINCT p.slug FROM portais p JOIN subscriptions s ON s.user_id = p.user_id AND s.status = 'active' AND s.paid_until > datetime('now') " +
    "JOIN portfolio_galerias g ON g.portal_id = p.id JOIN portfolio_fotos pf ON pf.galeria_id = g.id WHERE p.portfolio_ativo = 1"
  ).all();
  return r.results.map(function (x) { return "/f/" + x.slug; });
}

export async function tratarPortfolioPublico(request, env, url) {
  const caminho = url.pathname;

  if (caminho === "/api/f/info" && request.method === "GET") {
    const p = await portfolioNoAr(env, String(url.searchParams.get("slug") || ""));
    if (!p) return resp({ error: "Página não encontrada" }, 404);
    const galerias = (await galeriasComFotos(env, p.id, false)).filter(function (g) { return g.fotos.length; });
    if (!galerias.length) return resp({ error: "Página não encontrada" }, 404);
    return resp({
      slug: p.slug, nome: p.nome, titulo: p.portfolio_titulo, bio: p.bio, cor: p.cor, cidade: p.cidade,
      whatsapp: p.whatsapp, instagram: p.instagram,
      logo: await urlDoArquivo(env, p.logo_file_id),
      capa: (p.portfolio_capa_id && await urlDoArquivo(env, p.portfolio_capa_id)) || galerias[0].fotos[0],
      galerias: galerias,
      tipos: TIPOS_ORCAMENTO
    }, 200);
  }

  if (caminho === "/api/f/orcamento") {
    if (request.method !== "POST") return resp({ error: "Método não permitido" }, 405);
    if (!origemOk(request, url)) return resp({ error: "Origem inválida" }, 403);
    const corpo = (await lerJson(request)) || {};
    const p = await portfolioNoAr(env, String(corpo.slug || ""));
    if (!p) return resp({ error: "Página não encontrada" }, 404);
    const nome = texto(corpo.nome, 80);
    const email = texto(corpo.email, 120).toLowerCase();
    const whats = soNumeros(corpo.whatsapp).slice(0, 13);
    if (!nome) return resp({ error: "Coloque o seu nome." }, 400);
    if (email && !EMAIL_OK.test(email)) return resp({ error: "E-mail inválido." }, 400);
    if (!email && whats.length < 10) return resp({ error: "Deixe um e-mail ou WhatsApp com DDD para o fotógrafo responder." }, 400);
    if (!(await dentroDoLimite(env, await chaveIp(request), "orcamento", MAX_ORCAMENTOS_HORA))) {
      return resp({ error: "Muitos pedidos desta conexão. Tente de novo em 1 hora." }, 429);
    }
    const tipo = TIPOS_ORCAMENTO.indexOf(corpo.tipo) >= 0 ? corpo.tipo : null;
    const quando = texto(corpo.quando, 40);
    const mensagem = texto(corpo.mensagem, 1500);
    await env.DB.prepare("INSERT INTO orcamentos (portal_id, nome, email, whatsapp, tipo, quando, mensagem) VALUES (?, ?, ?, ?, ?, ?, ?)")
      .bind(p.id, nome, email || null, whats || null, tipo, quando || null, mensagem || null).run();
    await emailComBotao(env, p.dono_email, "Pedido de orçamento: " + nome + (tipo ? " (" + tipo + ")" : ""), [
      "Você recebeu um pedido de orçamento pelo seu portfólio.",
      "Nome: " + nome,
      email ? "E-mail: " + email : "",
      whats ? "WhatsApp: " + whats : "",
      tipo ? "Tipo: " + tipo : "",
      quando ? "Data / quando: " + quando : "",
      mensagem ? "Mensagem: " + mensagem : ""
    ].filter(Boolean), { texto: "Ver no Meu estúdio", link: SITE + "/meu-portal?aba=portfolio" });
    return resp({ ok: true }, 200);
  }

  return resp({ error: "Rota não encontrada" }, 404);
}
