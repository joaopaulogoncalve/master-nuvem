const enc = new TextEncoder();
const DIAS_SESSAO = 30;
const EMAIL_OK = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

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

async function criarSessao(env, userId) {
  const token = novoToken();
  const h = await sha256Hex(token);
  await env.DB.prepare(
    "INSERT INTO sessions (token_hash, user_id, expires_at) VALUES (?, ?, datetime('now', '+" + DIAS_SESSAO + " days'))"
  ).bind(h, userId).run();
  return token;
}

async function usuarioLogado(request, env) {
  const token = lerCookie(request, "sessao");
  if (!token) return null;
  const h = await sha256Hex(token);
  return await env.DB.prepare(
    "SELECT u.id, u.email, u.name, u.role FROM sessions s JOIN users u ON u.id = s.user_id WHERE s.token_hash = ? AND s.expires_at > datetime('now')"
  ).bind(h).first();
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
    return resposta({ email: u.email, nome: u.name, role: u.role }, 200);
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

    const token = await criarSessao(env, userId);
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
      "SELECT id, password_hash, password_salt FROM users WHERE email = ?"
    ).bind(email).first();

    if (!u) {
      await derivarSenha(senha, new Uint8Array(16));
      return resposta({ error: "E-mail ou senha incorretos" }, 401);
    }

    const hash = await derivarSenha(senha, deHex(u.password_salt));
    if (!iguais(hash, u.password_hash)) {
      return resposta({ error: "E-mail ou senha incorretos" }, 401);
    }

    const token = await criarSessao(env, u.id);
    return resposta({ ok: true }, 200, cookieSessao(token, DIAS_SESSAO * 86400));
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
