// Bancos e maquininhas: links das ajudas oficiais para cadastrar a chave PIX e criar link de pagamento.
// Aparecem em "Como recebo" (Meu estúdio) e a Nuvenzinha usa para responder. Banco novo só entra com aprovação
// do João no /admin: a lista nunca muda sozinha (um link falso de banco seria golpe dentro do site).
import { chaveIp, dentroDoLimite } from "./limite.js";

const LINK_OK = /^https:\/\/[^\s<>"']{5,300}$/;
const EMAIL_OK = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const MAX_PEDIDOS_HORA = 3;
const LINKS_POR_RODADA = 3;   // a checagem roda a cada 20 min; 3 links por vez cabe no limite de subrequests

function limpar(v, max) {
  return String(v || "").replace(/[\u0000-\u001f]/g, " ").trim().slice(0, max);
}

function linkOuNulo(v) {
  const l = String(v || "").trim();
  if (!l) return null;
  return LINK_OK.test(l) ? l : undefined;
}

function paraTela(b) {
  return { id: b.id, nome: b.nome, palavras: b.palavras, link_pix: b.link_pix, link_pagamento: b.link_pagamento, tem_api: !!b.tem_api };
}

// Público: GET /api/bancos (lista) e POST /api/bancos/pedido (banco que não está na lista).
export async function tratarBancos(request, env, url, f) {
  const caminho = url.pathname;
  if (caminho === "/api/bancos" && request.method === "GET") {
    const r = await env.DB.prepare("SELECT * FROM bancos WHERE ativo = 1 ORDER BY ordem, nome").all();
    return new Response(JSON.stringify({ bancos: r.results.map(paraTela) }), {
      status: 200, headers: { "Content-Type": "application/json", "Cache-Control": "public, max-age=300" }
    });
  }
  if (caminho === "/api/bancos/pedido") {
    if (request.method !== "POST") return f.resposta({ error: "Método não permitido" }, 405);
    if (!f.origemOk(request, url)) return f.resposta({ error: "Origem inválida" }, 403);
    const corpo = await f.lerJson(request);
    if (!corpo) return f.resposta({ error: "JSON inválido" }, 400);
    const banco = limpar(corpo.banco, 60);
    const nome = limpar(corpo.nome, 80);
    const email = String(corpo.email || "").trim().toLowerCase();
    if (banco.length < 2) return f.resposta({ error: "Digite o nome do banco ou da maquininha" }, 400);
    if (!EMAIL_OK.test(email) || email.length > 120) return f.resposta({ error: "E-mail inválido" }, 400);
    if (!(await dentroDoLimite(env, await chaveIp(request), "banco_pedido", MAX_PEDIDOS_HORA))) {
      return f.resposta({ error: "Muitos pedidos em pouco tempo. Tente de novo mais tarde." }, 429);
    }
    const r = await env.DB.prepare("INSERT INTO bancos_pedidos (banco, nome, email) VALUES (?, ?, ?)").bind(banco, nome || null, email).run();
    await f.enviarEmail(env, f.EMAIL_SUPORTE, "Pedido de banco: " + banco,
      "<p>Pediram os links do banco <strong>" + f.escaparHtml(banco) + "</strong> (" + f.escaparHtml(email) + ").</p><p>Aprove em " + f.SITE + "/admin, seção Bancos.</p>",
      "Pediram os links do banco " + banco + " (" + email + "). Aprove em " + f.SITE + "/admin, seção Bancos.");
    return f.resposta({ ok: true, protocolo: r.meta.last_row_id, prazo: f.PRAZO }, 200);
  }
  return f.resposta({ error: "Rota não encontrada" }, 404);
}

// Admin: GET /api/admin/bancos, POST /api/admin/bancos/salvar | /remover | /pedido-descartar.
export async function tratarAdminBancos(request, env, url, f) {
  const caminho = url.pathname;
  if (caminho === "/api/admin/bancos" && request.method === "GET") {
    const b = await env.DB.prepare("SELECT * FROM bancos ORDER BY ordem, nome").all();
    const p = await env.DB.prepare("SELECT * FROM bancos_pedidos WHERE status = 'aberto' ORDER BY id").all();
    return f.resposta({ bancos: b.results, pedidos: p.results }, 200);
  }
  if (request.method !== "POST") return f.resposta({ error: "Método não permitido" }, 405);
  if (!f.origemOk(request, url)) return f.resposta({ error: "Origem inválida" }, 403);
  const corpo = await f.lerJson(request);
  if (!corpo) return f.resposta({ error: "JSON inválido" }, 400);

  if (caminho === "/api/admin/bancos/salvar") {
    const nome = limpar(corpo.nome, 60);
    const palavras = limpar(corpo.palavras, 300).toLowerCase();
    const pix = linkOuNulo(corpo.link_pix), pag = linkOuNulo(corpo.link_pagamento);
    if (nome.length < 2) return f.resposta({ error: "Digite o nome do banco" }, 400);
    if (pix === undefined || pag === undefined) return f.resposta({ error: "Os links precisam começar com https://" }, 400);
    if (!pix && !pag) return f.resposta({ error: "Coloque pelo menos um link (PIX ou link de pagamento)" }, 400);
    const id = parseInt(corpo.id, 10) || 0;
    let bancoId = id;
    if (id) {
      await env.DB.prepare("UPDATE bancos SET nome = ?, palavras = ?, link_pix = ?, link_pagamento = ?, tem_api = ?, ativo = ?, link_pix_ok = 1, link_pagamento_ok = 1, checado_em = NULL WHERE id = ?")
        .bind(nome, palavras, pix, pag, corpo.tem_api ? 1 : 0, corpo.ativo === false ? 0 : 1, id).run();
    } else {
      const r = await env.DB.prepare("INSERT INTO bancos (nome, palavras, link_pix, link_pagamento, tem_api) VALUES (?, ?, ?, ?, ?)")
        .bind(nome, palavras || nome.toLowerCase(), pix, pag, corpo.tem_api ? 1 : 0).run();
      bancoId = r.meta.last_row_id;
    }
    // Aprovando um pedido: avisa por e-mail quem pediu.
    let avisado = null;
    const pedidoId = parseInt(corpo.pedido_id, 10) || 0;
    if (pedidoId) {
      const ped = await env.DB.prepare("SELECT * FROM bancos_pedidos WHERE id = ? AND status = 'aberto'").bind(pedidoId).first();
      if (ped) {
        await env.DB.prepare("UPDATE bancos_pedidos SET status = 'aprovado', banco_id = ?, respondido_em = datetime('now') WHERE id = ?").bind(bancoId, ped.id).run();
        const linhas = [];
        if (pix) linhas.push("Cadastrar a chave PIX: " + pix);
        if (pag) linhas.push("Criar link de pagamento: " + pag);
        linhas.push("Depois, cole a chave e o link no seu Meu estúdio, em \"Como recebo\".");
        const m = f.emailAviso(ped.nome ? ped.nome.split(" ")[0] : "", "Achamos os links do " + nome + "!", linhas.map(f.escaparHtml), { texto: "Abrir Como recebo", link: f.SITE + "/meu-portal?aba=receber" });
        await f.enviarEmail(env, ped.email, "Links do " + nome + " - Master Nuvem", m.html, m.texto);
        avisado = ped.email;
      }
    }
    return f.resposta({ ok: true, id: bancoId, avisado: avisado }, 200);
  }

  if (caminho === "/api/admin/bancos/remover") {
    await env.DB.prepare("DELETE FROM bancos WHERE id = ?").bind(parseInt(corpo.id, 10) || 0).run();
    return f.resposta({ ok: true }, 200);
  }

  if (caminho === "/api/admin/bancos/pedido-descartar") {
    await env.DB.prepare("UPDATE bancos_pedidos SET status = 'descartado', respondido_em = datetime('now') WHERE id = ?").bind(parseInt(corpo.id, 10) || 0).run();
    return f.resposta({ ok: true }, 200);
  }
  return f.resposta({ error: "Rota não encontrada" }, 404);
}

// Abre o link e diz se a página existe. 401/403/429 = site que bloqueia robôs (abre normal no navegador): conta como OK.
async function linkFunciona(link) {
  try {
    const r = await fetch(link, { method: "GET", redirect: "follow", headers: { "User-Agent": "Mozilla/5.0 (MasterNuvem verificador de links)" } });
    return r.ok || r.status === 401 || r.status === 403 || r.status === 429;
  } catch (e) {
    return false;
  }
}

// Cron de 20 min: confere os bancos que estão há mais tempo sem checagem (uma vez por dia cada um).
// Quando um link que funcionava quebra, manda e-mail para o suporte.
export async function checarLinksBancos(env, f) {
  const r = await env.DB.prepare(
    "SELECT * FROM bancos WHERE ativo = 1 AND (checado_em IS NULL OR checado_em < datetime('now', '-1 day')) ORDER BY checado_em IS NOT NULL, checado_em LIMIT ?"
  ).bind(LINKS_POR_RODADA).all();
  const quebrados = [];
  for (const b of r.results) {
    const pixOk = b.link_pix ? await linkFunciona(b.link_pix) : true;
    const pagOk = b.link_pagamento ? await linkFunciona(b.link_pagamento) : true;
    await env.DB.prepare("UPDATE bancos SET link_pix_ok = ?, link_pagamento_ok = ?, checado_em = datetime('now') WHERE id = ?")
      .bind(pixOk ? 1 : 0, pagOk ? 1 : 0, b.id).run();
    if ((!pixOk && b.link_pix_ok) || (!pagOk && b.link_pagamento_ok)) {
      quebrados.push(b.nome + ": " + (!pixOk ? b.link_pix : b.link_pagamento));
    }
  }
  if (quebrados.length) {
    await f.enviarEmail(env, f.EMAIL_SUPORTE, "Link de banco quebrado na Master Nuvem",
      "<p>Estes links pararam de abrir:</p><p>" + quebrados.map(f.escaparHtml).join("<br>") + "</p><p>Troque em " + f.SITE + "/admin, seção Bancos.</p>",
      "Estes links pararam de abrir:\n" + quebrados.join("\n") + "\n\nTroque em " + f.SITE + "/admin, seção Bancos.");
  }
  return quebrados.length;
}
