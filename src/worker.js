const enc = new TextEncoder();
const DIAS_SESSAO = 30;
const EMAIL_OK = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const B32 = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";
const MAX_TENTATIVAS_2FA = 5;

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
    "SELECT u.id, u.email, u.name, u.role, u.totp_enabled FROM sessions s JOIN users u ON u.id = s.user_id WHERE s.token_hash = ? AND s.pending = 0 AND s.expires_at > datetime('now')"
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

async function tratarApi(request, env, url) {
  const caminho = url.pathname;

  if (caminho === "/api/me") {
    const u = await usuarioLogado(request, env);
    if (!u) return resposta({ error: "Não autenticado" }, 401);
    return resposta({ email: u.email, nome: u.name, role: u.role, totp: !!u.totp_enabled }, 200);
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

    const salt = new Uint8Array(16);
    crypto.getRandomValues(salt);
    const hash = await derivarSenha(senha, salt);

    let userId;
    try {
      const r = await env.DB.prepare(
        "INSERT INTO users (email, name, password_hash, password_salt) VALUES (?, ?, ?, ?)"
      ).bind(email, nome, hash, paraHex(salt)).run();
      userId = r.meta.last_row_id;
    } catch (e) {
      if (String(e.message).includes("UNIQUE")) {
        return resposta({ error: "Este e-mail já está cadastrado" }, 409);
      }
      console.error("Erro ao cadastrar:", e.message);
      return resposta({ error: "Erro ao cadastrar" }, 500);
    }

    const token = await criarSessao(env, userId, false);
    return resposta({ ok: true }, 200, cookieSessao(token, DIAS_SESSAO * 86400));
  }

  if (caminho === "/api/login") {
    if (request.method !== "POST") return resposta({ error: "Método não permitido" }, 405);
    if (!origemOk(request, url)) return resposta({ error: "Origem inválida" }, 403);

    const corpo = await lerJson(request);
    if (!corpo) return resposta({ error: "JSON inválido" }, 400);

    const email = String(corpo.email || "").trim().toLowerCase();
    const senha = String(corpo.senha || "");

    const u = await env.DB.prepare(
      "SELECT id, password_hash, password_salt, totp_enabled FROM users WHERE email = ?"
    ).bind(email).first();

    if (!u) {
      await derivarSenha(senha, new Uint8Array(16));
      return resposta({ error: "E-mail ou senha incorretos" }, 401);
    }

    const hash = await derivarSenha(senha, deHex(u.password_salt));
    if (!iguais(hash, u.password_hash)) {
      return resposta({ error: "E-mail ou senha incorretos" }, 401);
    }

    if (u.totp_enabled) {
      const pend = await criarSessao(env, u.id, true);
      return resposta({ need2fa: true }, 200, cookieSessao(pend, 600));
    }

    const token = await criarSessao(env, u.id, false);
    return resposta({ ok: true }, 200, cookieSessao(token, DIAS_SESSAO * 86400));
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
    await env.DB.prepare("UPDATE sessions SET tentativas = tentativas + 1 WHERE token_hash = ?").bind(pend.token_hash).run();

    const corpo = await lerJson(request);
    if (!corpo) return resposta({ error: "JSON inválido" }, 400);

    const passo = await verificarTotp(pend.totp_secret || "", corpo.codigo, pend.totp_last || 0);
    if (passo === null) return resposta({ error: "Código incorreto" }, 401);

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

  if (caminho === "/api/checkout") {
    if (request.method !== "POST") return resposta({ error: "Método não permitido" }, 405);
    if (!env.MP_ACCESS_TOKEN) {
      console.error("MP_ACCESS_TOKEN não configurado");
      return resposta({ error: "Configuração ausente" }, 500);
    }

    const corpo = await lerJson(request);
    if (!corpo) return resposta({ error: "JSON inválido" }, 400);

    const gb = parseInt(corpo.gb, 10);
    if (!gb || gb < 1 || gb > 5000) {
      return resposta({ error: "Quantidade inválida" }, 400);
    }

    const nome = gb >= 1000 ? (gb / 1000).toFixed(2) + "TB" : gb + "GB";

    try {
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
            unit_price: calcularPreco(gb)
          }],
          back_urls: {
            success: url.origin + "/?status=ok",
            failure: url.origin + "/?status=erro",
            pending: url.origin + "/?status=pendente"
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

  return resposta({ error: "Rota não encontrada" }, 404);
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    if (url.pathname.startsWith("/api/")) {
      try {
        return await tratarApi(request, env, url);
      } catch (e) {
        console.error("Erro inesperado:", e.message);
        return resposta({ error: "Erro interno" }, 500);
      }
    }

    return env.ASSETS.fetch(request);
  }
};
