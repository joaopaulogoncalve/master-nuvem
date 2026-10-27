import { tratarArquivos, medirBucket, removerObjeto, urlArquivo } from "./arquivos.js";
import { fazerCopia } from "./copia.js";
import { tratarPortalDono, tratarPortalCliente } from "./portal.js";
import { chaveIp, chaveConta, limiteAtingido, registrarTentativa, dentroDoLimite, registrarEvento } from "./limite.js";
import { sentinela, REGRAS as REGRAS_SENTINELA } from "./sentinela.js";
import { tratarEventosDono, tratarEventoPublico } from "./eventos.js";
import { tratarContratosDono, tratarContratoPublico } from "./contratos.js";
import { tratarBlog, agendaBlog } from "./blog.js";
import { purgarLixeira } from "./lixeira.js";
import { tratarBancos, tratarAdminBancos, checarLinksBancos } from "./bancos.js";
const enc = new TextEncoder();
const DIAS_SESSAO = 30;
const EMAIL_OK = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const B32 = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";
const MAX_TENTATIVAS_2FA = 5;
// Limites por hora contra quem tenta adivinhar senhas (contam só as tentativas erradas, exceto o cadastro).
const MAX_ERROS_LOGIN_IP = 20;
const MAX_ERROS_LOGIN_CONTA = 10;
const MAX_ERROS_2FA_CONTA = 10;
const MAX_CADASTROS_IP = 5;
const MSG_MUITAS_TENTATIVAS = "Muitas tentativas. Espere 1 hora e tente de novo, ou use \"Esqueci minha senha\".";
const DIAS_PLANO = 30;
const MINUTOS_PIX = 30;   // tempo para pagar o QR code do PIX
// Backblaze B2 (pague pelo uso): US$ 6,95 por TB a cada 30 dias, primeiros 10 GB grátis.
// Conferir em backblaze.com/cloud-storage/pricing se o preço mudar.
const B2_US_POR_TB = 6.95;
const B2_GRATIS_BYTES = 10e9;
const DOLAR_RESERVA = 5.5;
const MINUTOS_LINK_SENHA = 30;
const MAX_PEDIDOS_SENHA_HORA = 3;
const REMETENTE = "Master Nuvem <nao-responda@masternuvem.com.br>";
const SITE = "https://masternuvem.com.br";
// Limpeza automática (roda de hora em hora pelo Cron). Os Termos prometem 15 dias depois do vencimento.
const DIAS_GUARDA_APOS_VENCER = 15;
const DIAS_AVISO_ANTES = 3;
// Limite de chamadas externas por execução (o plano grátis da Cloudflare permite 50 por vez).
const MAX_EMAILS_POR_RODADA = 10;
const MAX_APAGAR_POR_RODADA = 30;

function calcularPreco(gb) {
  var valor;
  if (gb <= 1000) {
    valor = 5 + gb * 0.054;
  } else {
    valor = 59 + (gb - 1000) * 0.06;
  }
  if (valor < 9.90) valor = 9.90;
  return Math.round(valor * 100) / 100;
}

function resposta(obj, status, cookie) {
  const headers = new Headers({ "Content-Type": "application/json" });
  if (cookie) headers.append("Set-Cookie", cookie);
  return new Response(JSON.stringify(obj), { status: status, headers: headers });
}

function paraHex(buf) {
  return Array.from(new Uint8Array(buf)).map(function (b) {
    return b.toString(16).padStart(2, "0");
  }).join("");
}

async function sha256Hex(txt) {
  return paraHex(await crypto.subtle.digest("SHA-256", enc.encode(txt)));
}

async function derivarSenha(senha, saltBytes) {
  const chave = await crypto.subtle.importKey("raw", enc.encode(senha), "PBKDF2", false, ["deriveBits"]);
  const bits = await crypto.subtle.deriveBits(
    { name: "PBKDF2", salt: saltBytes, iterations: 100000, hash: "SHA-256" },
    chave,
    256
  );
  return paraHex(bits);
}

function deHex(h) {
  const out = new Uint8Array(h.length / 2);
  for (let i = 0; i < out.length; i++) {
    out[i] = parseInt(h.substr(i * 2, 2), 16);
  }
  return out;
}

function iguais(a, b) {
  if (a.length !== b.length) return false;
  let r = 0;
  for (let i = 0; i < a.length; i++) {
    r |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return r === 0;
}

function novoToken() {
  const b = new Uint8Array(32);
  crypto.getRandomValues(b);
  return paraHex(b);
}

function cookieSessao(token, maxAge) {
  return "sessao=" + token + "; HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=" + maxAge;
}

function lerCookie(request, nome) {
  const c = request.headers.get("Cookie") || "";
  const partes = c.split(";");
  for (const p of partes) {
    const i = p.indexOf("=");
    if (i > -1 && p.slice(0, i).trim() === nome) return p.slice(i + 1).trim();
  }
  return null;
}

/* ---------- 2FA (TOTP) ---------- */

function base32Encode(bytes) {
  let bits = 0;
  let valor = 0;
  let out = "";
  for (let i = 0; i < bytes.length; i++) {
    valor = (valor << 8) | bytes[i];
    bits += 8;
    while (bits >= 5) {
      out += B32[(valor >>> (bits - 5)) & 31];
      bits -= 5;
    }
  }
  if (bits > 0) out += B32[(valor << (5 - bits)) & 31];
  return out;
}

function base32Decode(txt) {
  let bits = 0;
  let valor = 0;
  const out = [];
  for (const ch of txt) {
    const idx = B32.indexOf(ch);
    if (idx < 0) continue;
    valor = (valor << 5) | idx;
    bits += 5;
    if (bits >= 8) {
      out.push((valor >>> (bits - 8)) & 255);
      bits -= 8;
    }
  }
  return new Uint8Array(out);
}

async function hotp(segredoBytes, contador) {
  const chave = await crypto.subtle.importKey("raw", segredoBytes, { name: "HMAC", hash: "SHA-1" }, false, ["sign"]);
  const msg = new ArrayBuffer(8);
  const view = new DataView(msg);
  view.setUint32(0, Math.floor(contador / 4294967296));
  view.setUint32(4, contador >>> 0);
  const h = new Uint8Array(await crypto.subtle.sign("HMAC", chave, msg));
  const off = h[19] & 15;
  const bin = ((h[off] & 127) << 24) | (h[off + 1] << 16) | (h[off + 2] << 8) | h[off + 3];
  return String(bin % 1000000).padStart(6, "0");
}

async function verificarTotp(segredo, codigo, ultimoPasso) {
  codigo = String(codigo || "").replace(/\s/g, "");
  if (!/^\d{6}$/.test(codigo)) return null;
  const bytes = base32Decode(segredo);
  const agora = Math.floor(Date.now() / 30000);
  for (let d = -1; d <= 1; d++) {
    const passo = agora + d;
    if (passo <= ultimoPasso) continue;
    const esperado = await hotp(bytes, passo);
    if (iguais(esperado, codigo)) return passo;
  }
  return null;
}

/* ---------- sessões ---------- */

async function criarSessao(env, userId, pendente) {
  const token = novoToken();
  const h = await sha256Hex(token);
  const validade = pendente ? "+10 minutes" : "+" + DIAS_SESSAO + " days";
  await env.DB.prepare(
    "INSERT INTO sessions (token_hash, user_id, expires_at, pending) VALUES (?, ?, datetime('now', ?), ?)"
  ).bind(h, userId, validade, pendente ? 1 : 0).run();
  return token;
}

async function usuarioLogado(request, env) {
  const token = lerCookie(request, "sessao");
  if (!token) return null;
  const h = await sha256Hex(token);
  return await env.DB.prepare(
    "SELECT u.id, u.email, u.name, u.role, u.totp_enabled, u.email_confirmado_em FROM sessions s JOIN users u ON u.id = s.user_id WHERE s.token_hash = ? AND s.pending = 0 AND s.expires_at > datetime('now')"
  ).bind(h).first();
}

async function sessaoPendente(request, env) {
  const token = lerCookie(request, "sessao");
  if (!token) return null;
  const h = await sha256Hex(token);
  return await env.DB.prepare(
    "SELECT s.token_hash, s.tentativas, u.id AS user_id, u.totp_secret, u.totp_last FROM sessions s JOIN users u ON u.id = s.user_id WHERE s.token_hash = ? AND s.pending = 1 AND s.expires_at > datetime('now')"
  ).bind(h).first();
}

async function senhaConfere(env, userId, senha) {
  const u = await env.DB.prepare(
    "SELECT password_hash, password_salt FROM users WHERE id = ?"
  ).bind(userId).first();
  if (!u) return false;
  const hash = await derivarSenha(senha, deHex(u.password_salt));
  return iguais(hash, u.password_hash);
}

async function lerJson(request) {
  try {
    return await request.json();
  } catch (e) {
    return null;
  }
}

function origemOk(request, url) {
  const o = request.headers.get("Origin");
  return !o || o === url.origin;
}

/* ---------- e-mail (Resend) ---------- */

async function enviarEmail(env, para, assunto, html, texto) {
  if (!env.RESEND_API_KEY) {
    console.error("RESEND_API_KEY não configurado; e-mail não enviado para", para);
    return false;
  }
  const r = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { "Authorization": "Bearer " + env.RESEND_API_KEY, "Content-Type": "application/json" },
    body: JSON.stringify({ from: REMETENTE, to: [para], subject: assunto, html: html, text: texto })
  });
  if (!r.ok) {
    console.error("Resend recusou o e-mail:", r.status, (await r.text()).slice(0, 300));
    return false;
  }
  return true;
}

/* ---------- confirmação de e-mail ---------- */
const DIAS_LINK_CONFIRMACAO = 3;
const MSG_CONFIRMAR = "Confirme o seu e-mail para continuar: clique no link que mandamos para você (olhe também o Spam). No Painel dá para pedir outro.";
async function enviarConfirmacao(env, u) {
  const b = new Uint8Array(24);
  crypto.getRandomValues(b);
  const token = paraHex(b);
  await env.DB.prepare("UPDATE users SET confirmacao_hash = ?, confirmacao_expira = datetime('now', ?) WHERE id = ?")
    .bind(await sha256Hex(token), "+" + DIAS_LINK_CONFIRMACAO + " days", u.id).run();
  const m = emailAviso(String(u.name || "").split(" ")[0], "Confirme o seu e-mail na Master Nuvem",
    ["Falta só um clique para ativar a sua conta.", "O link vale " + DIAS_LINK_CONFIRMACAO + " dias. Se você não criou esta conta, ignore este e-mail."],
    { texto: "Confirmar meu e-mail", link: SITE + "/api/email/confirmar?t=" + token });
  return await enviarEmail(env, u.email, "Confirme o seu e-mail - Master Nuvem", m.html, m.texto);
}

/* ---------- Turnstile (Cloudflare): prova que é uma pessoa no login e no cadastro ---------- */
async function turnstileOk(env, request, token) {
  if (!env.TURNSTILE_SECRET) return true;   // ainda não configurado: não bloqueia ninguém
  try {
    const form = new FormData();
    form.append("secret", env.TURNSTILE_SECRET);
    form.append("response", String(token || ""));
    form.append("remoteip", request.headers.get("CF-Connecting-IP") || "");
    const r = await fetch("https://challenges.cloudflare.com/turnstile/v0/siteverify", { method: "POST", body: form });
    const d = await r.json();
    return !!d.success;
  } catch (e) {
    console.error("Turnstile indisponível:", e.message);
    return true;   // se o serviço da Cloudflare cair, não trava o site inteiro
  }
}
const MSG_ROBO = "Não conseguimos confirmar que você não é um robô. Recarregue a página e tente de novo.";

function emailRecuperarSenha(nome, link) {
  const ola = "Olá" + (nome ? ", " + nome.replace(/[<>&"]/g, "") : "") + "!";
  const texto = ola + "\n\nRecebemos um pedido para criar uma nova senha na Master Nuvem.\n" +
    "Abra este link (vale por " + MINUTOS_LINK_SENHA + " minutos e só pode ser usado uma vez):\n\n" + link +
    "\n\nSe não foi você, ignore este e-mail: sua senha continua a mesma.\n\nMaster Nuvem";
  const html = "<div style=\"font-family:Arial,sans-serif;max-width:480px;margin:auto;color:#0f172a\">" +
    "<h2 style=\"color:#0ea5e9\">Master Nuvem</h2><p>" + ola + "</p>" +
    "<p>Recebemos um pedido para criar uma nova senha na sua conta.</p>" +
    "<p style=\"margin:28px 0\"><a href=\"" + link + "\" style=\"background:#0ea5e9;color:#fff;padding:12px 22px;border-radius:10px;text-decoration:none;font-weight:bold\">Criar nova senha</a></p>" +
    "<p style=\"font-size:13px;color:#475569\">O link vale por " + MINUTOS_LINK_SENHA + " minutos e só pode ser usado uma vez.<br>" +
    "Se não foi você, ignore este e-mail: sua senha continua a mesma.</p></div>";
  return { html: html, texto: texto };
}

/* ---------- planos / Mercado Pago ---------- */

async function planoAtual(env, userId) {
  return await env.DB.prepare(
    "SELECT id, quota_gb, paid_until, mp_payment_id FROM subscriptions WHERE user_id = ? AND status = 'active' AND paid_until > datetime('now') ORDER BY id DESC LIMIT 1"
  ).bind(userId).first();
}

// Confere a assinatura x-signature do Mercado Pago (só se MP_WEBHOOK_SECRET estiver configurado).
async function assinaturaMpOk(request, env, dataId) {
  if (!env.MP_WEBHOOK_SECRET) return true;
  const cab = request.headers.get("x-signature") || "";
  let ts = "";
  let v1 = "";
  for (const parte of cab.split(",")) {
    const [k, v] = parte.split("=").map(function (s) { return s.trim(); });
    if (k === "ts") ts = v || "";
    if (k === "v1") v1 = v || "";
  }
  if (!ts || !v1) return false;
  const reqId = request.headers.get("x-request-id") || "";
  let manifesto = "id:" + String(dataId).toLowerCase() + ";";
  if (reqId) manifesto += "request-id:" + reqId + ";";
  manifesto += "ts:" + ts + ";";
  const chave = await crypto.subtle.importKey("raw", enc.encode(env.MP_WEBHOOK_SECRET), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const esperado = paraHex(await crypto.subtle.sign("HMAC", chave, enc.encode(manifesto)));
  return iguais(esperado, v1);
}

// Aplica um pagamento consultado direto na API do Mercado Pago (nunca confia no corpo do aviso).
async function aplicarPagamento(env, pg) {
  const subId = parseInt(pg.external_reference, 10);
  if (!subId) return "sem referência";

  const sub = await env.DB.prepare(
    "SELECT id, user_id, quota_gb, status, mp_payment_id, valor_centavos, aumento_ate FROM subscriptions WHERE id = ?"
  ).bind(subId).first();
  if (!sub) return "pedido não encontrado";

  const idPg = String(pg.id);

  if (pg.status === "approved") {
    if (sub.status !== "pending") return "já processado";
    const valor = Number(pg.transaction_amount || 0);
    // Pedidos novos guardam o valor cobrado (pode ter cupom); pedidos antigos usam o preço da calculadora.
    const esperado = sub.valor_centavos !== null && sub.valor_centavos !== undefined ? sub.valor_centavos / 100 : calcularPreco(sub.quota_gb);
    if (pg.currency_id !== "BRL" || valor + 0.01 < esperado) {
      console.error("Valor pago não confere", subId, valor, pg.currency_id);
      return "valor não confere";
    }

    let r;
    if (sub.aumento_ate) {
      // Aumento de espaço no meio do plano: mantém o vencimento que o cliente já tinha (se já venceu, vale 30 dias).
      r = await env.DB.prepare(
        "UPDATE subscriptions SET status = 'active', mp_payment_id = ?, paid_until = CASE WHEN ? > datetime('now') THEN ? ELSE datetime('now', ?) END WHERE id = ? AND status = 'pending'"
      ).bind(idPg, sub.aumento_ate, sub.aumento_ate, "+" + DIAS_PLANO + " days", sub.id).run();
    } else {
      // Renovação do mesmo tamanho soma os dias que faltam; troca de tamanho começa hoje.
      const anterior = await planoAtual(env, sub.user_id);
      const inicio = anterior && anterior.quota_gb === sub.quota_gb ? anterior.paid_until : null;
      r = await env.DB.prepare(
        "UPDATE subscriptions SET status = 'active', mp_payment_id = ?, paid_until = datetime(COALESCE(?, datetime('now')), ?) WHERE id = ? AND status = 'pending'"
      ).bind(idPg, inicio, "+" + DIAS_PLANO + " days", sub.id).run();
    }
    if (!r.meta.changes) return "já processado";

    await env.DB.prepare(
      "UPDATE subscriptions SET status = 'replaced' WHERE user_id = ? AND status = 'active' AND id != ?"
    ).bind(sub.user_id, sub.id).run();
    return "plano ativado";
  }

  if ((pg.status === "refunded" || pg.status === "charged_back") && sub.mp_payment_id === idPg) {
    // paid_until = agora: a contagem dos 15 dias de guarda dos arquivos começa no cancelamento.
    await env.DB.prepare("UPDATE subscriptions SET status = 'cancelled', paid_until = datetime('now') WHERE id = ?").bind(sub.id).run();
    return "plano cancelado";
  }

  return "status " + pg.status;
}

/* ---------- painel admin ---------- */

function ferramentasBancos() {
  return { resposta: resposta, lerJson: lerJson, origemOk: origemOk, enviarEmail: enviarEmail, emailAviso: emailAviso,
    escaparHtml: escaparHtml, SITE: SITE, EMAIL_SUPORTE: EMAIL_SUPORTE, PRAZO: PRAZO_CHAMADO };
}

async function tratarAdmin(request, env, url) {
  const caminho = url.pathname;
  const u = await usuarioLogado(request, env);
  if (!u) return resposta({ error: "Não autenticado" }, 401);
  if (u.role !== "admin") return resposta({ error: "Acesso restrito" }, 403);
  if (caminho === "/api/admin/bancos" || caminho.startsWith("/api/admin/bancos/")) return await tratarAdminBancos(request, env, url, ferramentasBancos());

  if (caminho === "/api/admin/clientes") {
    const r = await env.DB.prepare(
      "SELECT u.id, u.email, u.name, u.role, u.created_at, u.totp_enabled, u.travada_em, " +
      "p.quota_gb, p.paid_until, p.mp_payment_id, " +
      "(SELECT COALESCE(SUM(size_bytes), 0) FROM files f WHERE f.user_id = u.id AND f.status = 'ready') AS usado_bytes, " +
      "(SELECT COUNT(*) FROM files f WHERE f.user_id = u.id AND f.status = 'ready') AS arquivos, " +
      "(SELECT MAX(s.paid_until) FROM subscriptions s WHERE s.user_id = u.id AND s.status IN ('active', 'replaced', 'cancelled')) AS fim_plano, " +
      "datetime((SELECT MAX(s.paid_until) FROM subscriptions s WHERE s.user_id = u.id AND s.status IN ('active', 'replaced', 'cancelled')), '+" + DIAS_GUARDA_APOS_VENCER + " days') AS apaga_em " +
      "FROM users u LEFT JOIN subscriptions p ON p.id = (" +
      "SELECT s.id FROM subscriptions s WHERE s.user_id = u.id AND s.status = 'active' AND s.paid_until > datetime('now') ORDER BY s.id DESC LIMIT 1) " +
      "ORDER BY u.id DESC"
    ).all();
    const clientes = r.results.map(function (c) {
      return {
        id: c.id,
        email: c.email,
        nome: c.name,
        role: c.role,
        criado: c.created_at,
        totp: !!c.totp_enabled,
        travada_em: c.travada_em,
        // Pago = tem id numérico de pagamento do Mercado Pago; o resto (manual ou lançado direto no banco) é manual.
        plano: c.quota_gb ? { quota_gb: c.quota_gb, paid_until: c.paid_until, manual: !/^\d+$/.test(String(c.mp_payment_id || "")) } : null,
        usado_bytes: c.usado_bytes,
        arquivos: c.arquivos,
        fim_plano: c.fim_plano,
        apaga_em: c.role === "admin" ? null : c.apaga_em
      };
    });
    // Receita mensal estimada: só planos pagos pelo Mercado Pago (manuais não contam).
    let receita = 0;
    for (const c of clientes) {
      if (c.plano && !c.plano.manual) receita += calcularPreco(c.plano.quota_gb);
    }
    return resposta({
      clientes: clientes,
      receita_mensal: Math.round(receita * 100) / 100,
      apagar_arquivos: env.APAGAR_ARQUIVOS === "sim"
    }, 200);
  }

  if (caminho === "/api/admin/assistente" && request.method === "GET") {
    const faq = await env.DB.prepare(
      "SELECT f.id, f.pergunta, f.palavras, f.resposta, f.ordem, f.ativo, " +
      "(SELECT COUNT(*) FROM perguntas_chat p WHERE p.faq_id = f.id AND p.created_at > datetime('now', '-30 days')) AS usos_30d " +
      "FROM faq f ORDER BY f.ordem, f.id"
    ).all();
    // Perguntas que a nuvem não soube responder (agrupadas pelo texto), dos últimos 30 dias.
    const sem = await env.DB.prepare(
      "SELECT LOWER(texto) AS texto, COUNT(*) AS vezes, MAX(created_at) AS ultima FROM perguntas_chat " +
      "WHERE faq_id IS NULL AND created_at > datetime('now', '-30 days') GROUP BY LOWER(texto) ORDER BY vezes DESC, ultima DESC LIMIT 50"
    ).all();
    const chamados = await env.DB.prepare(
      "SELECT id, nome, email, mensagem, pagina, status, created_at, resolvido_em FROM chamados " +
      "ORDER BY CASE status WHEN 'aberto' THEN 0 ELSE 1 END, id DESC LIMIT 100"
    ).all();
    const total = await env.DB.prepare(
      "SELECT COUNT(*) AS perguntas, COALESCE(SUM(CASE WHEN faq_id IS NOT NULL THEN 1 ELSE 0 END), 0) AS respondidas " +
      "FROM perguntas_chat WHERE created_at > datetime('now', '-30 days')"
    ).first();
    return resposta({ faq: faq.results, sem_resposta: sem.results, chamados: chamados.results, total: total }, 200);
  }

  if (caminho === "/api/admin/sentinela" && request.method === "GET") {
    const alertas = await env.DB.prepare(
      "SELECT id, nivel, mensagem, visto, created_at FROM sentinela_alertas ORDER BY id DESC LIMIT 100"
    ).all();
    const contas = await env.DB.prepare("SELECT id, email, name, travada_em FROM users WHERE travada_em IS NOT NULL ORDER BY travada_em DESC").all();
    const clientes = await env.DB.prepare(
      "SELECT c.id, c.email, c.nome, c.travada_em, p.nome AS portal FROM portal_clientes c JOIN portais p ON p.id = c.portal_id WHERE c.travada_em IS NOT NULL ORDER BY c.travada_em DESC"
    ).all();
    const resumo = await env.DB.prepare(
      "SELECT COALESCE(SUM(CASE WHEN tipo IN ('login_erro', 'portal_login_erro') THEN 1 ELSE 0 END), 0) AS senhas_erradas, " +
      "COALESCE(SUM(CASE WHEN tipo = '2fa_erro' THEN 1 ELSE 0 END), 0) AS codigos_errados, " +
      "COALESCE(SUM(CASE WHEN tipo IN ('login_ok', 'portal_login_ok') THEN 1 ELSE 0 END), 0) AS entradas, " +
      "COALESCE(SUM(CASE WHEN tipo = 'download' THEN 1 ELSE 0 END), 0) AS downloads " +
      "FROM seguranca_eventos WHERE created_at > datetime('now', '-1 day')"
    ).first();
    return resposta({ alertas: alertas.results, contas: contas.results, clientes: clientes.results, resumo_24h: resumo, regras: REGRAS_SENTINELA }, 200);
  }

  if (caminho === "/api/admin/blog" && request.method === "GET") {
    return resposta({ posts: agendaBlog() }, 200);
  }

  if (caminho === "/api/admin/cupons" && request.method === "GET") {
    const r = await env.DB.prepare(
      "SELECT c.codigo, c.quota_mb, c.horas, c.max_usos, c.usos, c.valido_ate, c.ativo, c.created_at, c.preco_centavos, u.email AS so_email " +
      "FROM cupons c LEFT JOIN users u ON u.id = c.so_user_id ORDER BY c.created_at DESC"
    ).all();
    return resposta({ cupons: r.results }, 200);
  }

  // Cópias de segurança do banco: lista, fazer agora e baixar (link de 5 min).
  if (caminho === "/api/admin/copias" && request.method === "GET") {
    const r = await env.DB.prepare("SELECT id, chave, bytes, tabelas, linhas, ok, erro, created_at FROM copias ORDER BY id DESC LIMIT 10").all();
    return resposta({ copias: r.results }, 200);
  }
  if (caminho === "/api/admin/copias/baixar" && request.method === "GET") {
    const c = await env.DB.prepare("SELECT chave FROM copias WHERE id = ? AND ok = 1").bind(parseInt(url.searchParams.get("id"), 10) || 0).first();
    if (!c) return resposta({ error: "Cópia não encontrada" }, 404);
    return resposta({ url: await urlArquivo(env, c.chave, c.chave.split("/").pop(), true, 300) }, 200);
  }
  if (caminho === "/api/admin/copias/agora" && request.method === "POST") {
    if (!origemOk(request, url)) return resposta({ error: "Origem inválida" }, 403);
    const r = await fazerCopia(env);
    return resposta(r, r.ok ? 200 : 502);
  }

  if (caminho === "/api/admin/backblaze") {
    let medida;
    try {
      medida = await medirBucket(env);
    } catch (e) {
      console.error("Falha ao medir o bucket:", e.message);
      return resposta({ error: "Não foi possível consultar o Backblaze" }, 502);
    }
    const reg = await env.DB.prepare(
      "SELECT COALESCE(SUM(size_bytes), 0) AS bytes FROM files WHERE status = 'ready'"
    ).first();
    const vendido = await env.DB.prepare(
      "SELECT COALESCE(SUM(quota_gb), 0) AS gb FROM subscriptions WHERE status = 'active' AND paid_until > datetime('now')"
    ).first();

    // Cotação do dólar (AwesomeAPI); se falhar, usa um valor de reserva.
    let dolar = DOLAR_RESERVA;
    let dolarAoVivo = false;
    try {
      const c = await fetch("https://economia.awesomeapi.com.br/json/last/USD-BRL");
      const v = parseFloat((await c.json()).USDBRL.bid);
      if (v > 1 && v < 20) { dolar = v; dolarAoVivo = true; }
    } catch (e) {}

    // O Backblaze cobra também as cópias de segurança do banco (são poucos KB/MB).
    const cobrado = Math.max(0, medida.bytes + (medida.copias_bytes || 0) - B2_GRATIS_BYTES);
    const custoUsd = cobrado / 1e12 * B2_US_POR_TB;
    return resposta({
      copias_bytes: medida.copias_bytes || 0,
      bucket_bytes: medida.bytes,
      bucket_objetos: medida.objetos,
      bucket_completo: medida.completo,
      site_bytes: reg.bytes,
      vendido_gb: vendido.gb,
      preco_tb_usd: B2_US_POR_TB,
      gratis_bytes: B2_GRATIS_BYTES,
      dolar: Math.round(dolar * 100) / 100,
      dolar_ao_vivo: dolarAoVivo,
      custo_usd: Math.round(custoUsd * 100) / 100,
      custo_brl: Math.round(custoUsd * dolar * 100) / 100,
      custo_vendido_brl: Math.round(vendido.gb / 1000 * B2_US_POR_TB * dolar * 100) / 100
    }, 200);
  }

  if (request.method !== "POST") return resposta({ error: "Método não permitido" }, 405);
  if (!origemOk(request, url)) return resposta({ error: "Origem inválida" }, 403);
  const corpo = await lerJson(request);
  if (!corpo) return resposta({ error: "JSON inválido" }, 400);

  if (caminho === "/api/admin/faq/salvar") {
    const pergunta = limparTexto(corpo.pergunta, 150);
    const resp = String(corpo.resposta || "").replace(/[\u0000-\u0009\u000b-\u001f]/g, " ").trim().slice(0, 1500);
    // Palavras-chave: sem acento, minúsculas, separadas por vírgula.
    const palavras = String(corpo.palavras || "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase()
      .split(",").map(function (p) { return p.trim(); }).filter(function (p) { return p.length > 1; }).slice(0, 40).join(", ");
    const ordem = parseInt(corpo.ordem, 10) || 100;
    if (pergunta.length < 3) return resposta({ error: "Escreva a pergunta" }, 400);
    if (resp.length < 3) return resposta({ error: "Escreva a resposta" }, 400);
    if (!palavras) return resposta({ error: "Coloque palavras-chave separadas por vírgula" }, 400);
    const id = parseInt(corpo.id, 10) || 0;
    if (id) {
      const r = await env.DB.prepare("UPDATE faq SET pergunta = ?, palavras = ?, resposta = ?, ordem = ?, ativo = ? WHERE id = ?")
        .bind(pergunta, palavras, resp, ordem, corpo.ativo === false ? 0 : 1, id).run();
      if (!r.meta.changes) return resposta({ error: "Pergunta não encontrada" }, 404);
    } else {
      await env.DB.prepare("INSERT INTO faq (pergunta, palavras, resposta, ordem) VALUES (?, ?, ?, ?)").bind(pergunta, palavras, resp, ordem).run();
    }
    return resposta({ ok: true }, 200);
  }

  if (caminho === "/api/admin/faq/remover") {
    await env.DB.prepare("DELETE FROM faq WHERE id = ?").bind(parseInt(corpo.id, 10) || 0).run();
    return resposta({ ok: true }, 200);
  }

  if (caminho === "/api/admin/chamados/status") {
    const status = corpo.status === "resolvido" ? "resolvido" : "aberto";
    const r = await env.DB.prepare(
      "UPDATE chamados SET status = ?, resolvido_em = CASE WHEN ? = 'resolvido' THEN datetime('now') ELSE NULL END WHERE id = ?"
    ).bind(status, status, parseInt(corpo.id, 10) || 0).run();
    if (!r.meta.changes) return resposta({ error: "Chamado não encontrado" }, 404);
    return resposta({ ok: true }, 200);
  }

  if (caminho === "/api/admin/cupons/salvar") {
    const codigo = String(corpo.codigo || "").trim().toUpperCase();
    const mb = parseInt(corpo.quota_mb, 10);
    const horas = parseInt(corpo.horas, 10);
    const max = corpo.max_usos === "" || corpo.max_usos === null || corpo.max_usos === undefined ? null : parseInt(corpo.max_usos, 10);
    const ate = String(corpo.valido_ate || "");
    if (!/^[A-Z0-9_-]{3,30}$/.test(codigo)) return resposta({ error: "Código: 3 a 30 letras, números, - ou _" }, 400);
    if (!mb || mb < 1 || mb > 100000) return resposta({ error: "Espaço inválido (1 a 100.000 MB)" }, 400);
    if (!horas || horas < 1 || horas > 24 * 90) return resposta({ error: "Duração inválida (1 hora a 90 dias)" }, 400);
    if (max !== null && (!max || max < 1)) return resposta({ error: "Limite de usos inválido" }, 400);
    if (ate && !/^\d{4}-\d{2}-\d{2}$/.test(ate)) return resposta({ error: "Data inválida" }, 400);
    // Preço fixo (opcional): vira cupom de pagamento (ex.: 1000 MB por R$ 1,00) em vez de teste grátis.
    let preco = null;
    const precoTxt = String(corpo.preco || "").trim().replace(/^R\$\s*/i, "").replace(/\./g, "").replace(",", ".");
    if (precoTxt) {
      preco = Math.round(parseFloat(precoTxt) * 100);
      if (!(preco >= 100 && preco <= 10000000)) return resposta({ error: "Preço inválido (mínimo R$ 1,00)" }, 400);
      if (mb < 1000) return resposta({ error: "Cupom com preço precisa ser de pelo menos 1000 MB (1 GB)" }, 400);
    }
    let soUser = null;
    const soEmail = String(corpo.so_email || "").trim().toLowerCase();
    if (soEmail) {
      const dono = await env.DB.prepare("SELECT id FROM users WHERE email = ?").bind(soEmail).first();
      if (!dono) return resposta({ error: "Nenhuma conta com esse e-mail" }, 400);
      soUser = dono.id;
    }
    await env.DB.prepare(
      "INSERT INTO cupons (codigo, quota_mb, horas, max_usos, valido_ate, ativo, preco_centavos, so_user_id) VALUES (?, ?, ?, ?, ?, 1, ?, ?) " +
      "ON CONFLICT(codigo) DO UPDATE SET quota_mb = excluded.quota_mb, horas = excluded.horas, max_usos = excluded.max_usos, " +
      "valido_ate = excluded.valido_ate, preco_centavos = excluded.preco_centavos, so_user_id = excluded.so_user_id"
    ).bind(codigo, mb, horas, max, ate || null, preco, soUser).run();
    return resposta({ ok: true }, 200);
  }

  if (caminho === "/api/admin/cupons/ativo") {
    const r = await env.DB.prepare("UPDATE cupons SET ativo = ? WHERE codigo = ?")
      .bind(corpo.ativo ? 1 : 0, String(corpo.codigo || "").toUpperCase()).run();
    if (!r.meta.changes) return resposta({ error: "Cupom não encontrado" }, 404);
    return resposta({ ok: true }, 200);
  }

  if (caminho === "/api/admin/sentinela/vistos") {
    await env.DB.prepare("UPDATE sentinela_alertas SET visto = 1 WHERE visto = 0").run();
    return resposta({ ok: true }, 200);
  }

  // Destravar cliente de portal (o fotógrafo também consegue, dando uma senha nova ao cliente).
  if (caminho === "/api/admin/sentinela/destravar" && corpo.cliente_id) {
    const r = await env.DB.prepare("UPDATE portal_clientes SET travada_em = NULL WHERE id = ? AND travada_em IS NOT NULL")
      .bind(parseInt(corpo.cliente_id, 10) || 0).run();
    if (!r.meta.changes) return resposta({ error: "Cliente não está trancado" }, 404);
    await registrarEvento(env, request, "destravada", { cliente_id: parseInt(corpo.cliente_id, 10) });
    return resposta({ ok: true }, 200);
  }

  const alvo = await env.DB.prepare("SELECT id, email FROM users WHERE id = ?").bind(parseInt(corpo.user_id, 10) || 0).first();
  if (!alvo) return resposta({ error: "Cliente não encontrado" }, 404);

  if (caminho === "/api/admin/sentinela/destravar") {
    const r = await env.DB.prepare("UPDATE users SET travada_em = NULL WHERE id = ? AND travada_em IS NOT NULL").bind(alvo.id).run();
    if (!r.meta.changes) return resposta({ error: "Conta não está trancada" }, 404);
    await registrarEvento(env, request, "destravada", { user_id: alvo.id });
    console.log("Admin", u.id, "destravou a conta", alvo.id);
    return resposta({ ok: true }, 200);
  }

  if (caminho === "/api/admin/sentinela/trancar") {
    if (alvo.id === u.id) return resposta({ error: "Você não pode trancar a sua própria conta" }, 400);
    await env.DB.prepare("UPDATE users SET travada_em = datetime('now') WHERE id = ?").bind(alvo.id).run();
    await env.DB.prepare("DELETE FROM sessions WHERE user_id = ?").bind(alvo.id).run();
    await env.DB.prepare("INSERT OR IGNORE INTO sentinela_alertas (chave, nivel, user_id, mensagem) VALUES (?, 'trancou', ?, ?)")
      .bind("manual:" + alvo.id + ":" + Date.now(), alvo.id, "Conta " + alvo.email + " trancada à mão pelo administrador").run();
    console.log("Admin", u.id, "trancou a conta", alvo.id);
    return resposta({ ok: true }, 200);
  }

  if (caminho === "/api/admin/plano") {
    const gb = parseInt(corpo.gb, 10);
    const dias = parseInt(corpo.dias, 10);
    if (!gb || gb < 1 || gb > 5000) return resposta({ error: "Quantidade de GB inválida (1 a 5000)" }, 400);
    if (!dias || dias < 1 || dias > 3650) return resposta({ error: "Dias inválidos (1 a 3650)" }, 400);

    const r = await env.DB.prepare(
      "INSERT INTO subscriptions (user_id, quota_gb, status, paid_until, mp_payment_id) VALUES (?, ?, 'active', datetime('now', ?), ?)"
    ).bind(alvo.id, gb, "+" + dias + " days", "manual:" + u.id).run();
    await env.DB.prepare(
      "UPDATE subscriptions SET status = 'replaced' WHERE user_id = ? AND status = 'active' AND id != ?"
    ).bind(alvo.id, r.meta.last_row_id).run();
    console.log("Admin", u.id, "deu plano", gb, "GB por", dias, "dias ao cliente", alvo.id);
    return resposta({ ok: true }, 200);
  }

  if (caminho === "/api/admin/plano/remover") {
    await env.DB.prepare(
      "UPDATE subscriptions SET status = 'cancelled', paid_until = MIN(paid_until, datetime('now')) WHERE user_id = ? AND status = 'active'"
    ).bind(alvo.id).run();
    console.log("Admin", u.id, "removeu o plano do cliente", alvo.id);
    return resposta({ ok: true }, 200);
  }

  return resposta({ error: "Rota não encontrada" }, 404);
}

/* ---------- assistente (chat da nuvenzinha) ---------- */

const EMAIL_SUPORTE = "contato@masternuvem.com.br";
const PRAZO_CHAMADO = "48 horas";
const MAX_PERGUNTAS_HORA = 40;
const MAX_CHAMADOS_HORA = 3;

function limparTexto(v, max) {
  return String(v || "").replace(/[\u0000-\u0009\u000b-\u001f]/g, " ").trim().slice(0, max);
}

function escaparHtml(t) {
  return String(t).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

async function tratarAssistente(request, env, url) {
  const caminho = url.pathname;

  if (caminho === "/api/assistente/faq" && request.method === "GET") {
    const r = await env.DB.prepare("SELECT id, pergunta, palavras, resposta FROM faq WHERE ativo = 1 ORDER BY ordem, id").all();
    return new Response(JSON.stringify({ faq: r.results, prazo: PRAZO_CHAMADO, email: EMAIL_SUPORTE }), {
      status: 200, headers: { "Content-Type": "application/json", "Cache-Control": "public, max-age=300" }
    });
  }

  if (request.method !== "POST") return resposta({ error: "Método não permitido" }, 405);
  if (!origemOk(request, url)) return resposta({ error: "Origem inválida" }, 403);
  const corpo = await lerJson(request);
  if (!corpo) return resposta({ error: "JSON inválido" }, 400);

  // Guarda o que perguntaram (e se a nuvem achou resposta) para o João ensinar respostas novas.
  if (caminho === "/api/assistente/pergunta") {
    const texto = limparTexto(corpo.texto, 300);
    if (texto.length < 2) return resposta({ ok: true }, 200);
    if (!(await dentroDoLimite(env, await chaveIp(request), "pergunta", MAX_PERGUNTAS_HORA))) return resposta({ ok: true }, 200);
    const faqId = parseInt(corpo.faq_id, 10) || null;
    const existe = faqId ? await env.DB.prepare("SELECT id FROM faq WHERE id = ?").bind(faqId).first() : null;
    await env.DB.prepare("INSERT INTO perguntas_chat (texto, faq_id) VALUES (?, ?)").bind(texto, existe ? existe.id : null).run();
    return resposta({ ok: true }, 200);
  }

  if (caminho === "/api/assistente/chamado") {
    const nome = limparTexto(corpo.nome, 80);
    const email = String(corpo.email || "").trim().toLowerCase();
    const mensagem = String(corpo.mensagem || "").replace(/[\u0000-\u0009\u000b-\u001f]/g, " ").trim().slice(0, 2000);
    const pagina = limparTexto(corpo.pagina, 100);
    if (nome.length < 2) return resposta({ error: "Digite seu nome" }, 400);
    if (!EMAIL_OK.test(email) || email.length > 120) return resposta({ error: "E-mail inválido" }, 400);
    if (mensagem.length < 5) return resposta({ error: "Conte um pouco mais sobre a sua dúvida" }, 400);
    if (!(await dentroDoLimite(env, await chaveIp(request), "chamado", MAX_CHAMADOS_HORA))) {
      return resposta({ error: "Muitos chamados em pouco tempo. Tente de novo mais tarde ou escreva para " + EMAIL_SUPORTE }, 429);
    }
    const u = await usuarioLogado(request, env);
    const r = await env.DB.prepare(
      "INSERT INTO chamados (nome, email, mensagem, pagina, user_id) VALUES (?, ?, ?, ?, ?)"
    ).bind(nome, email, mensagem, pagina || null, u ? u.id : null).run();
    const protocolo = r.meta.last_row_id;

    // Aviso para o suporte (contato@ cai no Gmail da empresa) e confirmação para a pessoa.
    const corpoSuporte = "<p><strong>Chamado nº " + protocolo + "</strong></p><p>Nome: " + escaparHtml(nome) + "<br>E-mail: " + escaparHtml(email) +
      "<br>Página: " + escaparHtml(pagina || "-") + (u ? "<br>Conta: " + escaparHtml(u.email) : "<br>Conta: (não estava logado)") +
      "</p><p style=\"white-space:pre-line\">" + escaparHtml(mensagem) + "</p>";
    await enviarEmail(env, EMAIL_SUPORTE, "Chamado nº " + protocolo + " - " + nome, corpoSuporte,
      "Chamado nº " + protocolo + "\nNome: " + nome + "\nE-mail: " + email + "\nPágina: " + (pagina || "-") + "\n\n" + mensagem);
    const conf = emailAviso(nome.split(" ")[0], "Recebemos o seu chamado nº " + protocolo + ".",
      ["Vamos responder neste e-mail em até " + PRAZO_CHAMADO + ".", "Sua mensagem: \"" + escaparHtml(mensagem.slice(0, 500)) + "\""],
      { texto: "Voltar para a Master Nuvem", link: SITE });
    await enviarEmail(env, email, "Recebemos seu chamado nº " + protocolo + " - Master Nuvem", conf.html, conf.texto);
    return resposta({ ok: true, protocolo: protocolo, prazo: PRAZO_CHAMADO }, 200);
  }

  return resposta({ error: "Rota não encontrada" }, 404);
}

// Data no formato que o Mercado Pago pede, no horário de Brasília (ex.: 2026-10-25T12:30:00.000-03:00).
function dataMp(minutosAFrente) {
  const d = new Date(Date.now() + minutosAFrente * 60000 - 3 * 3600000);
  return d.toISOString().slice(0, 23) + "-03:00";
}

// PIX dentro do site: cria o pagamento direto na API do Mercado Pago e devolve o QR code.
// O id do pagamento fica guardado no pedido (ainda "pending") para a tela consultar se já caiu.
async function criarPix(env, url, u, pedidoId, gb, precoCentavos, nome) {
  const mp = await fetch("https://api.mercadopago.com/v1/payments", {
    method: "POST",
    headers: {
      "Authorization": "Bearer " + env.MP_ACCESS_TOKEN,
      "Content-Type": "application/json",
      "X-Idempotency-Key": "pedido-" + pedidoId
    },
    body: JSON.stringify({
      transaction_amount: precoCentavos / 100,
      description: "Master Nuvem - " + nome + " Armazenamento (30 dias)",
      payment_method_id: "pix",
      payer: { email: u.email },
      external_reference: String(pedidoId),
      notification_url: url.origin + "/api/mp/webhook",
      date_of_expiration: dataMp(MINUTOS_PIX)
    })
  });
  const dados = await mp.json();
  const td = dados.point_of_interaction && dados.point_of_interaction.transaction_data;
  if (!mp.ok || !dados.id || !td || !td.qr_code) {
    console.error("Mercado Pago recusou o PIX:", mp.status, JSON.stringify(dados).slice(0, 500));
    return resposta({ error: "Não foi possível gerar o PIX agora. Tente de novo ou pague com cartão." }, 502);
  }
  await env.DB.prepare("UPDATE subscriptions SET mp_payment_id = ? WHERE id = ? AND status = 'pending'")
    .bind(String(dados.id), pedidoId).run();
  return resposta({
    pix: {
      pedido: pedidoId,
      gb: gb,
      valor_centavos: precoCentavos,
      qr_code: td.qr_code,
      qr_code_base64: td.qr_code_base64 || null,
      expira_em: dados.date_of_expiration || null,
      minutos: MINUTOS_PIX
    }
  }, 200);
}

// Cria o pedido "pending" (com o valor cobrado) e o pagamento no Mercado Pago:
// metodo "pix" = QR code na própria Master Nuvem; senão = link do Checkout do Mercado Pago (cartão, PIX, etc.).
// Aumentar espaço no meio do plano: paga a diferença de preço só pelos dias que faltam (mínimo R$ 2,00).
const MINIMO_AUMENTO_CENTAVOS = 200;
function precoAumento(gbAtual, gbNovo, paidUntil) {
  const dias = Math.max(0, (new Date(String(paidUntil).replace(" ", "T") + "Z").getTime() - Date.now()) / 86400000);
  const centavos = Math.round((calcularPreco(gbNovo) - calcularPreco(gbAtual)) * dias / 30 * 100);
  return { centavos: Math.max(MINIMO_AUMENTO_CENTAVOS, centavos), dias: Math.ceil(dias) };
}

async function criarPagamento(env, url, u, gb, precoCentavos, metodo, aumentoAte) {
  const nome = gb >= 1000 ? (gb / 1000).toFixed(2) + "TB" : gb + "GB";

  // Pedido fica "pending" até o webhook confirmar o pagamento; pedidos abandonados com mais de 2 dias são limpos.
  await env.DB.prepare(
    "DELETE FROM subscriptions WHERE user_id = ? AND status = 'pending' AND created_at < datetime('now', '-2 days')"
  ).bind(u.id).run();
  const pedido = await env.DB.prepare(
    "INSERT INTO subscriptions (user_id, quota_gb, status, valor_centavos, aumento_ate) VALUES (?, ?, 'pending', ?, ?)"
  ).bind(u.id, gb, precoCentavos, aumentoAte || null).run();
  const pedidoId = pedido.meta.last_row_id;

  try {
    if (metodo === "pix") return await criarPix(env, url, u, pedidoId, gb, precoCentavos, nome);
    const mp = await fetch("https://api.mercadopago.com/checkout/preferences", {
      method: "POST",
      headers: {
        "Authorization": "Bearer " + env.MP_ACCESS_TOKEN,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        items: [{
          title: "Master Nuvem - " + nome + " Armazenamento",
          quantity: 1,
          currency_id: "BRL",
          unit_price: precoCentavos / 100
        }],
        payer: { email: u.email },
        external_reference: String(pedidoId),
        notification_url: url.origin + "/api/mp/webhook",
        back_urls: {
          success: url.origin + "/painel?pagamento=ok",
          failure: url.origin + "/painel?pagamento=erro",
          pending: url.origin + "/painel?pagamento=pendente"
        },
        auto_return: "approved"
      })
    });

    const dados = await mp.json();
    if (!dados.init_point) {
      console.error("Mercado Pago recusou:", JSON.stringify(dados));
      return resposta({ error: "Falha ao criar pagamento" }, 502);
    }
    return resposta({ init_point: dados.init_point }, 200);
  } catch (e) {
    console.error("Erro ao chamar Mercado Pago:", e.message);
    return resposta({ error: "Falha ao criar pagamento" }, 502);
  }
}

async function tratarApi(request, env, url) {
  const caminho = url.pathname;

  if (caminho === "/api/me") {
    const u = await usuarioLogado(request, env);
    if (!u) return resposta({ error: "Não autenticado" }, 401);
    const plano = await planoAtual(env, u.id);
    return resposta({
      email: u.email,
      nome: u.name,
      role: u.role,
      totp: !!u.totp_enabled,
      email_confirmado: !!u.email_confirmado_em,
      plano: plano ? { quota_gb: plano.quota_gb, paid_until: plano.paid_until, teste: String(plano.mp_payment_id || "").indexOf("cupom:") === 0 } : null
    }, 200);
  }

  // Link do e-mail de confirmação: confirma e volta para o Painel.
  if (caminho === "/api/email/confirmar" && request.method === "GET") {
    const tk = String(url.searchParams.get("t") || "");
    const r = /^[0-9a-f]{48}$/.test(tk) ? await env.DB.prepare(
      "UPDATE users SET email_confirmado_em = datetime('now'), confirmacao_hash = NULL, confirmacao_expira = NULL WHERE confirmacao_hash = ? AND confirmacao_expira > datetime('now')"
    ).bind(await sha256Hex(tk)).run() : null;
    return Response.redirect(SITE + "/painel?" + (r && r.meta.changes ? "confirmado=1" : "confirmado=0"), 302);
  }

  if (caminho === "/api/email/reenviar") {
    if (request.method !== "POST") return resposta({ error: "Método não permitido" }, 405);
    if (!origemOk(request, url)) return resposta({ error: "Origem inválida" }, 403);
    const u = await usuarioLogado(request, env);
    if (!u) return resposta({ error: "Não autenticado" }, 401);
    if (u.email_confirmado_em) return resposta({ ok: true, ja_confirmado: true }, 200);
    if (!(await dentroDoLimite(env, await chaveConta("confirmar|" + u.email), "confirmar_email", 3))) return resposta({ error: "Já mandamos alguns e-mails. Espere 1 hora e olhe também o Spam." }, 429);
    const ok = await enviarConfirmacao(env, u);
    return resposta(ok ? { ok: true, email: u.email } : { error: "Não conseguimos enviar agora. Tente de novo em alguns minutos." }, ok ? 200 : 502);
  }

  // Configurações públicas que a página precisa (ex.: chave pública do Turnstile).
  if (caminho === "/api/config" && request.method === "GET") {
    return resposta({ turnstile_site_key: env.TURNSTILE_SITE_KEY || null }, 200);
  }

  // Saúde do site, para o monitor externo (ex.: UptimeRobot) avisar se cair.
  if (caminho === "/api/saude") {
    try {
      await env.DB.prepare("SELECT 1 AS ok").first();
      return resposta({ ok: true, site: "no ar" }, 200);
    } catch (e) {
      return resposta({ ok: false, erro: "banco" }, 503);
    }
  }

  if (caminho === "/api/register") {
    if (request.method !== "POST") return resposta({ error: "Método não permitido" }, 405);
    if (!origemOk(request, url)) return resposta({ error: "Origem inválida" }, 403);

    const corpo = await lerJson(request);
    if (!corpo) return resposta({ error: "JSON inválido" }, 400);

    const email = String(corpo.email || "").trim().toLowerCase();
    const senha = String(corpo.senha || "");
    const nome = String(corpo.nome || "").trim().slice(0, 80);

    if (!EMAIL_OK.test(email) || email.length > 120) {
      return resposta({ error: "E-mail inválido" }, 400);
    }
    if (senha.length < 8 || senha.length > 100) {
      return resposta({ error: "A senha precisa ter de 8 a 100 caracteres" }, 400);
    }
    if (corpo.aceite !== true) {
      return resposta({ error: "Para criar a conta, aceite os Termos de uso e a Política de privacidade." }, 400);
    }
    if (!(await turnstileOk(env, request, corpo.turnstile))) return resposta({ error: MSG_ROBO, robo: true }, 400);
    if (!(await dentroDoLimite(env, await chaveIp(request), "cadastro", MAX_CADASTROS_IP))) {
      return resposta({ error: "Muitas contas criadas desta conexão. Tente de novo em 1 hora." }, 429);
    }

    const salt = new Uint8Array(16);
    crypto.getRandomValues(salt);
    const hash = await derivarSenha(senha, salt);

    let userId;
    try {
      const r = await env.DB.prepare(
        "INSERT INTO users (email, name, password_hash, password_salt, terms_accepted_at) VALUES (?, ?, ?, ?, datetime('now'))"
      ).bind(email, nome, hash, paraHex(salt)).run();
      userId = r.meta.last_row_id;
    } catch (e) {
      if (String(e.message).includes("UNIQUE")) {
        return resposta({ error: "Este e-mail já está cadastrado" }, 409);
      }
      console.error("Erro ao cadastrar:", e.message);
      return resposta({ error: "Erro ao cadastrar" }, 500);
    }

    // Manda o link para confirmar o e-mail (contratar plano e usar cupom pedem e-mail confirmado).
    await enviarConfirmacao(env, { id: userId, email: email, name: nome });
    const token = await criarSessao(env, userId, false);
    return resposta({ ok: true, confirmar_email: true }, 200, cookieSessao(token, DIAS_SESSAO * 86400));
  }

  if (caminho === "/api/login") {
    if (request.method !== "POST") return resposta({ error: "Método não permitido" }, 405);
    if (!origemOk(request, url)) return resposta({ error: "Origem inválida" }, 403);

    const corpo = await lerJson(request);
    if (!corpo) return resposta({ error: "JSON inválido" }, 400);

    const email = String(corpo.email || "").trim().toLowerCase();
    const senha = String(corpo.senha || "");
    if (!(await turnstileOk(env, request, corpo.turnstile))) return resposta({ error: MSG_ROBO, robo: true }, 400);

    // Bloqueia por 1 hora depois de muitas senhas erradas (do mesmo IP ou contra a mesma conta).
    const kIp = await chaveIp(request);
    const kConta = await chaveConta(email);
    if (await limiteAtingido(env, kIp, "login", MAX_ERROS_LOGIN_IP) || await limiteAtingido(env, kConta, "login", MAX_ERROS_LOGIN_CONTA)) {
      return resposta({ error: MSG_MUITAS_TENTATIVAS }, 429);
    }

    const u = await env.DB.prepare(
      "SELECT id, password_hash, password_salt, totp_enabled, travada_em FROM users WHERE email = ?"
    ).bind(email).first();

    const hash = await derivarSenha(senha, u ? deHex(u.password_salt) : new Uint8Array(16));
    if (!u || !iguais(hash, u.password_hash)) {
      await registrarTentativa(env, kIp, "login");
      await registrarTentativa(env, kConta, "login");
      await registrarEvento(env, request, "login_erro", { user_id: u ? u.id : null });
      return resposta({ error: "E-mail ou senha incorretos" }, 401);
    }
    // Trancada pela sentinela: só volta criando uma senha nova pelo link do e-mail.
    if (u.travada_em) {
      return resposta({ error: "Sua conta foi protegida pela nossa sentinela por atividade suspeita. Para voltar a entrar, clique em \"Esqueci minha senha\" e crie uma senha nova.", travada: true }, 423);
    }

    if (u.totp_enabled) {
      const pend = await criarSessao(env, u.id, true);
      return resposta({ need2fa: true }, 200, cookieSessao(pend, 600));
    }

    await registrarEvento(env, request, "login_ok", { user_id: u.id });
    const token = await criarSessao(env, u.id, false);
    return resposta({ ok: true }, 200, cookieSessao(token, DIAS_SESSAO * 86400));
  }

  if (caminho === "/api/senha/esqueci") {
    if (request.method !== "POST") return resposta({ error: "Método não permitido" }, 405);
    if (!origemOk(request, url)) return resposta({ error: "Origem inválida" }, 403);

    const corpo = await lerJson(request);
    if (!corpo) return resposta({ error: "JSON inválido" }, 400);
    const email = String(corpo.email || "").trim().toLowerCase();

    // Resposta é sempre a mesma, exista ou não a conta (não revela quem é cliente).
    const u = EMAIL_OK.test(email) ? await env.DB.prepare("SELECT id, name FROM users WHERE email = ?").bind(email).first() : null;
    if (u) {
      const recentes = await env.DB.prepare(
        "SELECT COUNT(*) AS n FROM password_resets WHERE user_id = ? AND created_at > datetime('now', '-1 hour')"
      ).bind(u.id).first();
      if (recentes.n < MAX_PEDIDOS_SENHA_HORA) {
        const token = novoToken();
        await env.DB.prepare(
          "INSERT INTO password_resets (token_hash, user_id, expires_at) VALUES (?, ?, datetime('now', ?))"
        ).bind(await sha256Hex(token), u.id, "+" + MINUTOS_LINK_SENHA + " minutes").run();
        const msg = emailRecuperarSenha(u.name, url.origin + "/redefinir?token=" + token);
        await enviarEmail(env, email, "Criar nova senha - Master Nuvem", msg.html, msg.texto);
      } else {
        console.log("Limite de pedidos de senha atingido para o usuário", u.id);
      }
    }
    return resposta({ ok: true }, 200);
  }

  if (caminho === "/api/senha/redefinir") {
    if (request.method !== "POST") return resposta({ error: "Método não permitido" }, 405);
    if (!origemOk(request, url)) return resposta({ error: "Origem inválida" }, 403);

    const corpo = await lerJson(request);
    if (!corpo) return resposta({ error: "JSON inválido" }, 400);
    const token = String(corpo.token || "");
    const senha = String(corpo.senha || "");
    if (senha.length < 8 || senha.length > 100) {
      return resposta({ error: "A senha precisa ter de 8 a 100 caracteres" }, 400);
    }
    if (!/^[0-9a-f]{64}$/.test(token)) return resposta({ error: "Link inválido ou expirado. Peça um novo." }, 400);

    const h = await sha256Hex(token);
    // Marca como usado antes de trocar a senha: o mesmo link não funciona duas vezes.
    const marcado = await env.DB.prepare(
      "UPDATE password_resets SET used = 1 WHERE token_hash = ? AND used = 0 AND expires_at > datetime('now')"
    ).bind(h).run();
    if (!marcado.meta.changes) return resposta({ error: "Link inválido ou expirado. Peça um novo." }, 400);
    const pedido = await env.DB.prepare("SELECT user_id FROM password_resets WHERE token_hash = ?").bind(h).first();

    const salt = new Uint8Array(16);
    crypto.getRandomValues(salt);
    const hash = await derivarSenha(senha, salt);
    // Senha nova também destrava a conta, se a sentinela tiver trancado.
    await env.DB.prepare("UPDATE users SET password_hash = ?, password_salt = ?, travada_em = NULL WHERE id = ?")
      .bind(hash, paraHex(salt), pedido.user_id).run();
    await registrarEvento(env, request, "senha_redefinida", { user_id: pedido.user_id });
    // Derruba todas as sessões abertas e invalida outros links pendentes.
    await env.DB.prepare("DELETE FROM sessions WHERE user_id = ?").bind(pedido.user_id).run();
    await env.DB.prepare("UPDATE password_resets SET used = 1 WHERE user_id = ?").bind(pedido.user_id).run();
    console.log("Senha redefinida pelo link de e-mail, usuário", pedido.user_id);
    return resposta({ ok: true }, 200);
  }

  if (caminho === "/api/login/2fa") {
    if (request.method !== "POST") return resposta({ error: "Método não permitido" }, 405);
    if (!origemOk(request, url)) return resposta({ error: "Origem inválida" }, 403);

    const pend = await sessaoPendente(request, env);
    if (!pend) return resposta({ error: "Sessão expirada. Entre novamente." }, 401);

    if (pend.tentativas >= MAX_TENTATIVAS_2FA) {
      await env.DB.prepare("DELETE FROM sessions WHERE token_hash = ?").bind(pend.token_hash).run();
      return resposta({ error: "Muitas tentativas. Entre novamente." }, 429);
    }
    // Além das 5 por login, limita os erros por conta: entrar de novo não dá mais chances de adivinhar o código.
    const k2fa = await chaveConta("2fa|" + pend.user_id);
    if (await limiteAtingido(env, k2fa, "2fa", MAX_ERROS_2FA_CONTA)) {
      await env.DB.prepare("DELETE FROM sessions WHERE token_hash = ?").bind(pend.token_hash).run();
      return resposta({ error: "Muitos códigos errados. Espere 1 hora e entre novamente." }, 429);
    }
    await env.DB.prepare("UPDATE sessions SET tentativas = tentativas + 1 WHERE token_hash = ?").bind(pend.token_hash).run();

    const corpo = await lerJson(request);
    if (!corpo) return resposta({ error: "JSON inválido" }, 400);

    const passo = await verificarTotp(pend.totp_secret || "", corpo.codigo, pend.totp_last || 0);
    if (passo === null) {
      await registrarTentativa(env, k2fa, "2fa");
      await registrarEvento(env, request, "2fa_erro", { user_id: pend.user_id });
      return resposta({ error: "Código incorreto" }, 401);
    }
    await registrarEvento(env, request, "login_ok", { user_id: pend.user_id });

    await env.DB.prepare("UPDATE users SET totp_last = ? WHERE id = ?").bind(passo, pend.user_id).run();
    await env.DB.prepare("DELETE FROM sessions WHERE token_hash = ?").bind(pend.token_hash).run();
    const token = await criarSessao(env, pend.user_id, false);
    return resposta({ ok: true }, 200, cookieSessao(token, DIAS_SESSAO * 86400));
  }

  if (caminho === "/api/2fa/setup") {
    if (request.method !== "POST") return resposta({ error: "Método não permitido" }, 405);
    if (!origemOk(request, url)) return resposta({ error: "Origem inválida" }, 403);

    const u = await usuarioLogado(request, env);
    if (!u) return resposta({ error: "Não autenticado" }, 401);
    if (u.totp_enabled) return resposta({ error: "A verificação em duas etapas já está ativa" }, 400);

    const bytes = new Uint8Array(20);
    crypto.getRandomValues(bytes);
    const segredo = base32Encode(bytes);

    await env.DB.prepare(
      "UPDATE users SET totp_secret = ?, totp_enabled = 0, totp_last = 0 WHERE id = ?"
    ).bind(segredo, u.id).run();

    const uri = "otpauth://totp/MasterNuvem:" + encodeURIComponent(u.email) +
      "?secret=" + segredo + "&issuer=MasterNuvem&digits=6&period=30";
    return resposta({ secret: segredo, uri: uri }, 200);
  }

  if (caminho === "/api/2fa/enable") {
    if (request.method !== "POST") return resposta({ error: "Método não permitido" }, 405);
    if (!origemOk(request, url)) return resposta({ error: "Origem inválida" }, 403);

    const u = await usuarioLogado(request, env);
    if (!u) return resposta({ error: "Não autenticado" }, 401);

    const corpo = await lerJson(request);
    if (!corpo) return resposta({ error: "JSON inválido" }, 400);

    const reg = await env.DB.prepare(
      "SELECT totp_secret, totp_last FROM users WHERE id = ?"
    ).bind(u.id).first();
    if (!reg || !reg.totp_secret) return resposta({ error: "Gere o QR code primeiro" }, 400);

    const passo = await verificarTotp(reg.totp_secret, corpo.codigo, reg.totp_last || 0);
    if (passo === null) return resposta({ error: "Código incorreto. Tente o próximo código do aplicativo." }, 400);

    await env.DB.prepare(
      "UPDATE users SET totp_enabled = 1, totp_last = ? WHERE id = ?"
    ).bind(passo, u.id).run();
    return resposta({ ok: true }, 200);
  }

  if (caminho === "/api/2fa/disable") {
    if (request.method !== "POST") return resposta({ error: "Método não permitido" }, 405);
    if (!origemOk(request, url)) return resposta({ error: "Origem inválida" }, 403);

    const u = await usuarioLogado(request, env);
    if (!u) return resposta({ error: "Não autenticado" }, 401);
    if (!u.totp_enabled) return resposta({ error: "A verificação em duas etapas não está ativa" }, 400);

    const corpo = await lerJson(request);
    if (!corpo) return resposta({ error: "JSON inválido" }, 400);

    if (!(await senhaConfere(env, u.id, String(corpo.senha || "")))) {
      return resposta({ error: "Senha incorreta" }, 401);
    }

    const reg = await env.DB.prepare(
      "SELECT totp_secret, totp_last FROM users WHERE id = ?"
    ).bind(u.id).first();
    const passo = await verificarTotp(reg.totp_secret || "", corpo.codigo, reg.totp_last || 0);
    if (passo === null) return resposta({ error: "Código incorreto" }, 401);

    await env.DB.prepare(
      "UPDATE users SET totp_enabled = 0, totp_secret = NULL, totp_last = 0 WHERE id = ?"
    ).bind(u.id).run();
    return resposta({ ok: true }, 200);
  }

  if (caminho === "/api/logout") {
    if (request.method !== "POST") return resposta({ error: "Método não permitido" }, 405);
    if (!origemOk(request, url)) return resposta({ error: "Origem inválida" }, 403);

    const token = lerCookie(request, "sessao");
    if (token) {
      const h = await sha256Hex(token);
      await env.DB.prepare("DELETE FROM sessions WHERE token_hash = ?").bind(h).run();
    }
    return resposta({ ok: true }, 200, cookieSessao("", 0));
  }

  if (caminho === "/api/cupom") {
    if (request.method !== "POST") return resposta({ error: "Método não permitido" }, 405);
    if (!origemOk(request, url)) return resposta({ error: "Origem inválida" }, 403);
    const u = await usuarioLogado(request, env);
    if (!u) return resposta({ error: "Entre na sua conta para usar o cupom", login: true }, 401);
    if (!u.email_confirmado_em) return resposta({ error: MSG_CONFIRMAR, confirmar_email: true }, 403);
    const corpo = await lerJson(request);
    if (!corpo) return resposta({ error: "JSON inválido" }, 400);

    const codigo = String(corpo.codigo || "").trim().toUpperCase().replace(/\s+/g, "");
    const cupom = /^[A-Z0-9_-]{3,30}$/.test(codigo)
      ? await env.DB.prepare(
          "SELECT codigo, quota_mb, horas, preco_centavos, so_user_id FROM cupons WHERE codigo = ? AND ativo = 1 " +
          "AND (valido_ate IS NULL OR valido_ate >= date('now', '-3 hours')) AND (max_usos IS NULL OR usos < max_usos)"
        ).bind(codigo).first()
      : null;
    if (!cupom || (cupom.so_user_id && cupom.so_user_id !== u.id)) return resposta({ error: "Cupom inválido ou esgotado" }, 400);

    // Cupom de preço: leva ao pagamento do plano de quota_mb por preco_centavos (ex.: 1 GB por R$ 1,00).
    if (cupom.preco_centavos !== null && cupom.preco_centavos !== undefined) {
      if (!env.MP_ACCESS_TOKEN) return resposta({ error: "Configuração ausente" }, 500);
      const gbCupom = Math.max(1, Math.round(cupom.quota_mb / 1000));
      await env.DB.prepare("UPDATE cupons SET usos = usos + 1 WHERE codigo = ?").bind(cupom.codigo).run();
      console.log("Cupom de preço", cupom.codigo, "usado pelo usuário", u.id);
      return await criarPagamento(env, url, u, gbCupom, cupom.preco_centavos, corpo.metodo);
    }

    if (await planoAtual(env, u.id)) return resposta({ error: "Você já tem um plano ativo. O cupom é para quem ainda não tem plano." }, 400);

    // Registra o uso primeiro (chave = user_id): a mesma conta não usa dois cupons, nem clicando duas vezes.
    const marcou = await env.DB.prepare("INSERT OR IGNORE INTO cupom_usos (user_id, codigo) VALUES (?, ?)").bind(u.id, cupom.codigo).run();
    if (!marcou.meta.changes) return resposta({ error: "Esta conta já usou um cupom de teste" }, 400);
    await env.DB.prepare("UPDATE cupons SET usos = usos + 1 WHERE codigo = ?").bind(cupom.codigo).run();
    await env.DB.prepare(
      "INSERT INTO subscriptions (user_id, quota_gb, status, paid_until, mp_payment_id) VALUES (?, ?, 'active', datetime('now', ?), ?)"
    ).bind(u.id, cupom.quota_mb / 1000, "+" + cupom.horas + " hours", "cupom:" + cupom.codigo).run();
    console.log("Cupom", cupom.codigo, "usado pelo usuário", u.id);
    return resposta({ ok: true, quota_mb: cupom.quota_mb, horas: cupom.horas }, 200);
  }

  if (caminho === "/api/checkout") {
    if (request.method !== "POST") return resposta({ error: "Método não permitido" }, 405);
    if (!origemOk(request, url)) return resposta({ error: "Origem inválida" }, 403);
    if (!env.MP_ACCESS_TOKEN) {
      console.error("MP_ACCESS_TOKEN não configurado");
      return resposta({ error: "Configuração ausente" }, 500);
    }

    const u = await usuarioLogado(request, env);
    if (!u) return resposta({ error: "Entre na sua conta para contratar", login: true }, 401);
    if (!u.email_confirmado_em) return resposta({ error: MSG_CONFIRMAR, confirmar_email: true }, 403);

    const corpo = await lerJson(request);
    if (!corpo) return resposta({ error: "JSON inválido" }, 400);

    const gb = parseInt(corpo.gb, 10);
    if (!gb || gb < 1 || gb > 5000) {
      return resposta({ error: "Quantidade inválida" }, 400);
    }

    if (corpo.modo === "aumentar") {
      // Só para quem tem plano pago ativo e quer um tamanho maior.
      const plano = await planoAtual(env, u.id);
      if (!plano || String(plano.mp_payment_id || "").indexOf("cupom:") === 0) return resposta({ error: "Para aumentar, é preciso ter um plano pago ativo. Contrate um plano normal." }, 400);
      if (gb <= plano.quota_gb) return resposta({ error: "Escolha um tamanho maior que o seu plano atual (" + plano.quota_gb + " GB)" }, 400);
      const p = precoAumento(plano.quota_gb, gb, plano.paid_until);
      return await criarPagamento(env, url, u, gb, p.centavos, corpo.metodo, plano.paid_until);
    }

    return await criarPagamento(env, url, u, gb, Math.round(calcularPreco(gb) * 100), corpo.metodo);
  }

  // Quanto custa aumentar para gb (só os dias que faltam). A tela mostra antes de pagar.
  if (caminho === "/api/plano/aumento" && request.method === "GET") {
    const u = await usuarioLogado(request, env);
    if (!u) return resposta({ error: "Não autenticado" }, 401);
    const plano = await planoAtual(env, u.id);
    const gb = parseInt(url.searchParams.get("gb"), 10) || 0;
    if (!plano || String(plano.mp_payment_id || "").indexOf("cupom:") === 0 || gb <= plano.quota_gb || gb > 5000) return resposta({ pode: false }, 200);
    const p = precoAumento(plano.quota_gb, gb, plano.paid_until);
    return resposta({ pode: true, valor_centavos: p.centavos, dias: p.dias, ate: plano.paid_until, atual_gb: plano.quota_gb }, 200);
  }

  // A tela do PIX pergunta a cada poucos segundos se o pagamento já caiu.
  // Normalmente quem ativa é o aviso (webhook); se ele atrasar, consulta o pagamento direto no Mercado Pago.
  if (caminho === "/api/pagamento/status" && request.method === "GET") {
    const u = await usuarioLogado(request, env);
    if (!u) return resposta({ error: "Não autenticado" }, 401);
    const id = parseInt(url.searchParams.get("pedido"), 10) || 0;
    let sub = await env.DB.prepare("SELECT id, status, quota_gb, paid_until, mp_payment_id FROM subscriptions WHERE id = ? AND user_id = ?").bind(id, u.id).first();
    if (!sub) return resposta({ error: "Pedido não encontrado" }, 404);
    let situacao = sub.status === "pending" ? "aguardando" : "pago";
    if (sub.status === "pending" && /^\d+$/.test(String(sub.mp_payment_id || ""))) {
      const mp = await fetch("https://api.mercadopago.com/v1/payments/" + sub.mp_payment_id, {
        headers: { "Authorization": "Bearer " + env.MP_ACCESS_TOKEN }
      });
      if (mp.ok) {
        const pg = await mp.json();
        if (pg.status === "approved") await aplicarPagamento(env, pg);
        else if (pg.status === "cancelled" || pg.status === "rejected") situacao = "expirado";
        sub = await env.DB.prepare("SELECT id, status, quota_gb, paid_until FROM subscriptions WHERE id = ?").bind(sub.id).first();
        if (sub.status !== "pending") situacao = "pago";
      }
    }
    if (sub.status === "cancelled") situacao = "cancelado";
    return resposta({ situacao: situacao, quota_gb: sub.quota_gb, paid_until: sub.paid_until }, 200);
  }

  if (caminho === "/api/mp/webhook") {
    if (request.method !== "POST") return resposta({ error: "Método não permitido" }, 405);

    const corpo = (await lerJson(request)) || {};
    const tipo = url.searchParams.get("type") || url.searchParams.get("topic") || corpo.type || corpo.topic || "";
    const dataId = url.searchParams.get("data.id") || url.searchParams.get("id") || (corpo.data && corpo.data.id) || "";
    if (tipo !== "payment" || !/^\d+$/.test(String(dataId))) return resposta({ ok: true }, 200);

    if (!(await assinaturaMpOk(request, env, dataId))) {
      console.error("Webhook MP com assinatura inválida", dataId);
      return resposta({ error: "Assinatura inválida" }, 401);
    }

    const mp = await fetch("https://api.mercadopago.com/v1/payments/" + dataId, {
      headers: { "Authorization": "Bearer " + env.MP_ACCESS_TOKEN }
    });
    if (mp.status === 404) return resposta({ ok: true }, 200);
    if (!mp.ok) {
      console.error("Falha ao consultar pagamento", dataId, mp.status);
      return resposta({ error: "Falha ao consultar pagamento" }, 502);
    }

    const resultado = await aplicarPagamento(env, await mp.json());
    console.log("Webhook MP", dataId, resultado);
    return resposta({ ok: true }, 200);
  }

  if (caminho.startsWith("/api/admin/")) {
    return await tratarAdmin(request, env, url);
  }

  if (caminho === "/api/portal" || caminho.startsWith("/api/portal/")) {
    return await tratarPortalDono(request, env, url);
  }

  if (caminho.startsWith("/api/assistente/")) {
    return await tratarAssistente(request, env, url);
  }

  if (caminho === "/api/bancos" || caminho.startsWith("/api/bancos/")) {
    return await tratarBancos(request, env, url, ferramentasBancos());
  }

  if (caminho.startsWith("/api/p/")) {
    return await tratarPortalCliente(request, env, url);
  }

  if (caminho === "/api/eventos" || caminho.startsWith("/api/eventos/")) {
    return await tratarEventosDono(request, env, url);
  }

  if (caminho.startsWith("/api/e/")) {
    return await tratarEventoPublico(request, env, url);
  }

  if (caminho === "/api/contratos" || caminho.startsWith("/api/contratos/")) {
    return await tratarContratosDono(request, env, url);
  }

  if (caminho.startsWith("/api/c/")) {
    return await tratarContratoPublico(request, env, url);
  }

  if (caminho.startsWith("/api/files")) {
    return await tratarArquivos(request, env, url);
  }
  return resposta({ error: "Rota não encontrada" }, 404);
}

/* ---------- limpeza automática (Cron de hora em hora) ---------- */

function emailAviso(nome, titulo, paragrafos, botao) {
  const ola = "Olá" + (nome ? ", " + String(nome).replace(/[<>&"]/g, "") : "") + "!";
  const texto = ola + "\n\n" + paragrafos.join("\n\n") + "\n\n" + botao.texto + ": " + botao.link + "\n\nMaster Nuvem";
  const html = "<div style=\"font-family:Arial,sans-serif;max-width:480px;margin:auto;color:#0f172a\">" +
    "<h2 style=\"color:#0ea5e9\">Master Nuvem</h2><p>" + ola + "</p><p><strong>" + titulo + "</strong></p>" +
    paragrafos.map(function (p) { return "<p>" + p + "</p>"; }).join("") +
    "<p style=\"margin:28px 0\"><a href=\"" + botao.link + "\" style=\"background:#0ea5e9;color:#fff;padding:12px 22px;border-radius:10px;text-decoration:none;font-weight:bold\">" + botao.texto + "</a></p></div>";
  return { html: html, texto: texto };
}

function dataBr(txt) {
  const d = String(txt).slice(0, 10).split("-");
  return d[2] + "/" + d[1] + "/" + d[0];
}

function espaco(gb) {
  if (gb < 1) return Math.round(gb * 1000) + " MB";
  return gb >= 1000 ? String(+(gb / 1000).toFixed(2)) + " TB" : gb + " GB";
}

async function limpeza(env) {
  const relatorio = { avisos: 0, apagados: 0, orfaos: 0, simulados: 0 };
  // Só apaga arquivos de verdade quando APAGAR_ARQUIVOS = "sim" (variável na Cloudflare). Sem ela, só registra no log.
  const apagarDeVerdade = env.APAGAR_ARQUIVOS === "sim";
  let emails = 0;
  let apagar = 0;

  // 1) Avisos por e-mail. Cada aviso é registrado em "avisos" antes de enviar, para nunca repetir.
  const tipos = [
    {
      tipo: "vence",
      // Teste grátis por cupom dura poucas horas: não manda "vence em breve" logo depois de ativar.
      sql: "s.paid_until > datetime('now') AND s.paid_until <= datetime('now', '+" + DIAS_AVISO_ANTES + " days') " +
        "AND COALESCE(s.mp_payment_id, '') NOT LIKE 'cupom:%'",
      montar: function (s) {
        return emailAviso(s.name, "Seu plano de " + espaco(s.quota_gb) + " vence em " + dataBr(s.paid_until) + ".",
          ["Para continuar enviando arquivos sem interrupção, renove antes do vencimento. Renovando o mesmo tamanho, os dias que faltam são somados ao novo período."],
          { texto: "Renovar meu plano", link: SITE + "/?gb=" + s.quota_gb + "#calculadora" });
      },
      assunto: "Seu plano vence em breve - Master Nuvem"
    },
    {
      tipo: "venceu",
      // Só até começar a janela do "último aviso", para o cliente não receber os dois ao mesmo tempo.
      sql: "s.paid_until <= datetime('now') AND s.paid_until > datetime('now', '-" + (DIAS_GUARDA_APOS_VENCER - DIAS_AVISO_ANTES) + " days')",
      montar: function (s) {
        return emailAviso(s.name, "Seu plano de " + espaco(s.quota_gb) + " venceu em " + dataBr(s.paid_until) + ".",
          ["O envio de novos arquivos foi bloqueado. Seus arquivos continuam guardados e você ainda pode baixá-los por " + DIAS_GUARDA_APOS_VENCER + " dias.",
           "Depois disso eles serão apagados definitivamente, conforme os Termos de uso. Renove para não perder nada."],
          { texto: "Renovar meu plano", link: SITE + "/?gb=" + s.quota_gb + "#calculadora" });
      },
      assunto: "Seu plano venceu - Master Nuvem"
    },
    {
      tipo: "ultimo",
      sql: "s.paid_until <= datetime('now', '-" + (DIAS_GUARDA_APOS_VENCER - DIAS_AVISO_ANTES) + " days') AND s.paid_until > datetime('now', '-" + DIAS_GUARDA_APOS_VENCER + " days') " +
        "AND EXISTS (SELECT 1 FROM files f WHERE f.user_id = s.user_id)",
      montar: function (s) {
        return emailAviso(s.name, "Último aviso: seus arquivos serão apagados em até " + DIAS_AVISO_ANTES + " dias.",
          ["Seu plano venceu em " + dataBr(s.paid_until) + ". Se não for renovado, os arquivos guardados na Master Nuvem serão apagados definitivamente e não poderão ser recuperados.",
           "Renove agora ou entre no painel e baixe o que precisar."],
          { texto: "Renovar ou baixar meus arquivos", link: SITE + "/arquivos" });
      },
      assunto: "Último aviso: seus arquivos serão apagados - Master Nuvem"
    }
  ];

  for (const t of tipos) {
    if (emails >= MAX_EMAILS_POR_RODADA) break;
    const r = await env.DB.prepare(
      "SELECT s.id, s.quota_gb, s.paid_until, u.email, u.name FROM subscriptions s JOIN users u ON u.id = s.user_id " +
      "WHERE s.status = 'active' AND " + t.sql + " AND NOT EXISTS (SELECT 1 FROM avisos a WHERE a.sub_id = s.id AND a.tipo = ?) " +
      "ORDER BY s.paid_until LIMIT ?"
    ).bind(t.tipo, MAX_EMAILS_POR_RODADA - emails).all();
    for (const s of r.results) {
      const marcou = await env.DB.prepare("INSERT OR IGNORE INTO avisos (sub_id, tipo) VALUES (?, ?)").bind(s.id, t.tipo).run();
      if (!marcou.meta.changes) continue;
      const msg = t.montar(s);
      await enviarEmail(env, s.email, t.assunto, msg.html, msg.texto);
      emails++;
      relatorio.avisos++;
    }
  }

  // 2) Arquivos de quem está sem plano há mais de 15 dias. Admin nunca é apagado.
  //    "Fim" = maior paid_until entre os planos já pagos/ativos/cancelados (pedidos pendentes não contam).
  const vencidos = await env.DB.prepare(
    "SELECT f.id, f.user_id, f.object_key FROM files f JOIN users u ON u.id = f.user_id " +
    "WHERE u.role != 'admin' " +
    "AND NOT EXISTS (SELECT 1 FROM subscriptions s WHERE s.user_id = f.user_id AND s.status = 'active' AND s.paid_until > datetime('now')) " +
    "AND (SELECT MAX(s.paid_until) FROM subscriptions s WHERE s.user_id = f.user_id AND s.status IN ('active', 'replaced', 'cancelled')) " +
    "< datetime('now', '-" + DIAS_GUARDA_APOS_VENCER + " days') " +
    "ORDER BY f.id LIMIT ?"
  ).bind(MAX_APAGAR_POR_RODADA).all();
  for (const f of vencidos.results) {
    if (!apagarDeVerdade) {
      console.log("[modo teste] apagaria o arquivo", f.id, "do usuário", f.user_id);
      relatorio.simulados++;
      continue;
    }
    const r = await removerObjeto(env, f.object_key);
    if (!r.ok && r.status !== 404) {
      console.error("Falha ao apagar no B2", f.id, r.status);
      continue;
    }
    await env.DB.prepare("DELETE FROM files WHERE id = ?").bind(f.id).run();
    apagar++;
    relatorio.apagados++;
  }

  // 3) Envios que ficaram pela metade há mais de 1 dia (sobra no B2 que ninguém usa).
  const orfaos = await env.DB.prepare(
    "SELECT id, object_key FROM files WHERE status = 'pending' AND created_at < datetime('now', '-1 day') ORDER BY id LIMIT ?"
  ).bind(Math.max(0, MAX_APAGAR_POR_RODADA - apagar)).all();
  for (const f of orfaos.results) {
    const r = await removerObjeto(env, f.object_key);
    if (!r.ok && r.status !== 404) continue;
    await env.DB.prepare("DELETE FROM files WHERE id = ?").bind(f.id).run();
    relatorio.orfaos++;
  }

  // 4) Faxina do banco: sessões vencidas, links de senha velhos e pedidos de pagamento abandonados.
  await env.DB.prepare("DELETE FROM sessions WHERE expires_at < datetime('now')").run();
  await env.DB.prepare("DELETE FROM portal_sessoes WHERE expires_at < datetime('now')").run();
  await env.DB.prepare("DELETE FROM assistente_limite WHERE created_at < datetime('now', '-1 day')").run();
  await env.DB.prepare("DELETE FROM perguntas_chat WHERE created_at < datetime('now', '-180 days')").run();
  await env.DB.prepare("DELETE FROM seguranca_eventos WHERE created_at < datetime('now', '-90 days')").run();
  await env.DB.prepare("DELETE FROM sentinela_alertas WHERE created_at < datetime('now', '-180 days')").run();
  await env.DB.prepare("DELETE FROM password_resets WHERE expires_at < datetime('now', '-1 day')").run();
  await env.DB.prepare("DELETE FROM subscriptions WHERE status = 'pending' AND created_at < datetime('now', '-2 days')").run();

  console.log("Limpeza:", JSON.stringify(relatorio), apagarDeVerdade ? "" : "(arquivos em modo teste)");
  return relatorio;
}

// Cabeçalhos de proteção em todas as respostas: o site não abre dentro de outro site (contra golpe de clique
// escondido), o navegador não "adivinha" tipo de arquivo, links para fora não levam o endereço completo da página
// e o navegador só usa HTTPS. As respostas da API não ficam guardadas em cache.
function comProtecao(r, api) {
  const h = new Headers(r.headers);
  h.set("X-Frame-Options", "SAMEORIGIN");   // a prévia do layout abre a página do cliente dentro do Meu estúdio
  h.set("X-Content-Type-Options", "nosniff");
  h.set("Referrer-Policy", "strict-origin-when-cross-origin");
  h.set("Strict-Transport-Security", "max-age=31536000; includeSubDomains");
  h.set("Permissions-Policy", "camera=(), microphone=(), geolocation=()");
  if (api && !h.has("Cache-Control")) h.set("Cache-Control", "no-store");
  return new Response(r.body, { status: r.status, statusText: r.statusText, headers: h });
}

/* ---------- Lembrete: recarga do chip do WhatsApp de atendimento ---------- */
// Chip pré-pago sem recarga é bloqueado e depois cancelado pela operadora (e o WhatsApp vai junto).
// A cada DIAS_RECARGA_WHATSAPP dias, contando de INICIO_RECARGA_WHATSAPP, manda e-mail para o contato@
// e cria um alerta no /admin (Sentinela, com 🔴). A chave do alerta impede repetir no mesmo ciclo.
const DIAS_RECARGA_WHATSAPP = 30;   // chip TIM: recarga de R$ 15-20 costuma valer 30 dias
const INICIO_RECARGA_WHATSAPP = "2026-10-27";
async function lembreteWhatsapp(env, agora) {
  const dias = Math.floor((agora - Date.parse(INICIO_RECARGA_WHATSAPP + "T00:00:00Z")) / 86400000);
  const ciclo = Math.floor(dias / DIAS_RECARGA_WHATSAPP);
  if (ciclo < 1) return false;
  const msg = "Lembrete: coloque crédito (R$ 15 ou R$ 20) no chip do WhatsApp (62) 98284-6067 para a operadora não cancelar a linha.";
  const r = await env.DB.prepare("INSERT OR IGNORE INTO sentinela_alertas (chave, nivel, mensagem) VALUES (?, 'aviso', ?)")
    .bind("lembrete-whatsapp-" + ciclo, msg).run();
  if (!r.meta.changes) return false;
  const m = emailAviso("João", "Hora de recarregar o chip do WhatsApp", [msg, "O próximo lembrete chega daqui a " + DIAS_RECARGA_WHATSAPP + " dias."], { texto: "Abrir o painel admin", link: SITE + "/admin" });
  await enviarEmail(env, EMAIL_SUPORTE, "Lembrete: recarregar o chip do WhatsApp", m.html, m.texto);
  return true;
}

export { lembreteWhatsapp };

export default {
  async scheduled(event, env, ctx) {
    // "*/20 * * * *" = sentinela; "0 * * * *" = limpeza (na hora cheia rodam as duas).
    // A lixeira do Meu estúdio (removidos há mais de 30 min) é esvaziada logo depois da sentinela.
    // A cópia de segurança do banco roda uma vez por dia, na limpeza das 06:00 UTC (03:00 em Brasília).
    if (event.cron === "0 * * * *") ctx.waitUntil(limpeza(env).then(function (relatorio) {
      if (new Date(event.scheduledTime).getUTCHours() !== 6) return relatorio;
      return fazerCopia(env).then(function () { return lembreteWhatsapp(env, event.scheduledTime); }).then(function () { return relatorio; });
    }));
    else ctx.waitUntil(sentinela(env).then(function () { return purgarLixeira(env); }).then(function () { return checarLinksBancos(env, ferramentasBancos()); }));
  },

  async fetch(request, env) {
    const url = new URL(request.url);

    if (url.pathname.startsWith("/api/")) {
      try {
        return comProtecao(await tratarApi(request, env, url), true);
      } catch (e) {
        console.error("Erro inesperado:", e.message);
        return comProtecao(resposta({ error: "Erro interno" }, 500), true);
      }
    }

    // Portal do cliente final: /p/<endereço-do-estúdio> abre sempre a mesma página.
    if (/^\/p\/[a-z0-9-]+\/?$/.test(url.pathname)) {
      return comProtecao(await env.ASSETS.fetch(new Request(new URL("/portal-cliente", url), request)), false);
    }

    // Blog (/blog, /blog/<post>) e sitemap.xml: páginas montadas no servidor, com a agenda de publicação automática.
    const blog = tratarBlog(url);
    if (blog) return comProtecao(blog, false);

    // Contrato para assinar: /c/<token> abre sempre a mesma página.
    if (/^\/c\/[0-9a-f]{48}\/?$/.test(url.pathname)) {
      return comProtecao(await env.ASSETS.fetch(new Request(new URL("/contrato", url), request)), false);
    }
    // Galeria de evento: /e/<endereço-do-evento> abre sempre a mesma página.
    if (/^\/e\/[a-z0-9-]+\/?$/.test(url.pathname)) {
      return comProtecao(await env.ASSETS.fetch(new Request(new URL("/evento", url), request)), false);
    }

    return comProtecao(await env.ASSETS.fetch(request), false);
  }
};
