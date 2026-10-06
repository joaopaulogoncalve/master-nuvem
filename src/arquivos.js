const enc = new TextEncoder();
const MAX_ARQUIVO = 4500000000;
const GB = 1000000000;

function resp(obj, status) {
  return new Response(JSON.stringify(obj), {
    status: status,
    headers: { "Content-Type": "application/json" }
  });
}

function paraHex(buf) {
  return Array.from(new Uint8Array(buf)).map(function (b) {
    return b.toString(16).padStart(2, "0");
  }).join("");
}

async function sha256Hex(txt) {
  return paraHex(await crypto.subtle.digest("SHA-256", enc.encode(txt)));
}

async function hmac(chave, msg) {
  const k = await crypto.subtle.importKey("raw", chave, { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  return new Uint8Array(await crypto.subtle.sign("HMAC", k, enc.encode(msg)));
}

function codificar(txt) {
  return encodeURIComponent(txt).replace(/[!'()*]/g, function (c) {
    return "%" + c.charCodeAt(0).toString(16).toUpperCase();
  });
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

async function usuarioLogado(request, env) {
  const token = lerCookie(request, "sessao");
  if (!token) return null;
  const h = await sha256Hex(token);
  return await env.DB.prepare(
    "SELECT u.id, u.email FROM sessions s JOIN users u ON u.id = s.user_id WHERE s.token_hash = ? AND s.pending = 0 AND s.expires_at > datetime('now')"
  ).bind(h).first();
}

async function planoAtivo(env, userId) {
  return await env.DB.prepare(
    "SELECT quota_gb FROM subscriptions WHERE user_id = ? AND status = 'active' AND paid_until > datetime('now') ORDER BY id DESC LIMIT 1"
  ).bind(userId).first();
}

async function urlAssinada(env, metodo, chaveObjeto, expira, extra) {
  const host = String(env.B2_ENDPOINT).trim();
  const bucket = String(env.B2_BUCKET).trim();
  const regiao = host.split(".")[1];
  const amz = new Date().toISOString().replace(/[:-]|\.\d{3}/g, "");
  const dia = amz.slice(0, 8);
  const escopo = dia + "/" + regiao + "/s3/aws4_request";
  const caminho = "/" + bucket + "/" + chaveObjeto.split("/").map(codificar).join("/");

  const params = {
    "X-Amz-Algorithm": "AWS4-HMAC-SHA256",
    "X-Amz-Credential": String(env.B2_KEY_ID).trim() + "/" + escopo,
    "X-Amz-Date": amz,
    "X-Amz-Expires": String(expira),
    "X-Amz-SignedHeaders": "host"
  };
  if (extra) {
    for (const k in extra) params[k] = extra[k];
  }

  const consulta = Object.keys(params).sort().map(function (k) {
    return codificar(k) + "=" + codificar(params[k]);
  }).join("&");

  const canonico = metodo + "\n" + caminho + "\n" + consulta + "\nhost:" + host + "\n\nhost\nUNSIGNED-PAYLOAD";
  const aAssinar = "AWS4-HMAC-SHA256\n" + amz + "\n" + escopo + "\n" + (await sha256Hex(canonico));

  let k = await hmac(enc.encode("AWS4" + String(env.B2_APP_KEY).trim()), dia);
  k = await hmac(k, regiao);
  k = await hmac(k, "s3");
  k = await hmac(k, "aws4_request");
  const assinatura = paraHex(await hmac(k, aAssinar));

  return "https://" + host + caminho + "?" + consulta + "&X-Amz-Signature=" + assinatura;
}

async function removerObjeto(env, chaveObjeto) {
  const url = await urlAssinada(env, "DELETE", chaveObjeto, 120);
  return await fetch(url, { method: "DELETE" });
}

export async function tratarArquivos(request, env, url) {
  const caminho = url.pathname;

  const u = await usuarioLogado(request, env);
  if (!u) return resp({ error: "Não autenticado" }, 401);

  if (caminho === "/api/files" && request.method === "GET") {
    const plano = await planoAtivo(env, u.id);
    const lista = await env.DB.prepare(
      "SELECT id, name, size_bytes, created_at FROM files WHERE user_id = ? AND status = 'ready' ORDER BY id DESC"
    ).bind(u.id).all();
    const uso = await env.DB.prepare(
      "SELECT COALESCE(SUM(size_bytes), 0) AS total FROM files WHERE user_id = ?"
    ).bind(u.id).first();
    return resp({
      plano: !!plano,
      quota_bytes: plano ? plano.quota_gb * GB : 0,
      usado_bytes: uso.total,
      max_arquivo: MAX_ARQUIVO,
      arquivos: lista.results
    }, 200);
  }

  if (caminho === "/api/files/download" && request.method === "GET") {
    const id = parseInt(url.searchParams.get("id"), 10);
    const reg = await env.DB.prepare(
      "SELECT object_key, name FROM files WHERE id = ? AND user_id = ? AND status = 'ready'"
    ).bind(id, u.id).first();
    if (!reg) return resp({ error: "Arquivo não encontrado" }, 404);
    const link = await urlAssinada(env, "GET", reg.object_key, 300, {
      "response-content-disposition": "attachment; filename*=UTF-8''" + codificar(reg.name)
    });
    return resp({ url: link }, 200);
  }

  if (request.method !== "POST") return resp({ error: "Método não permitido" }, 405);
  if (!origemOk(request, url)) return resp({ error: "Origem inválida" }, 403);

  const corpo = await lerJson(request);
  if (!corpo) return resp({ error: "JSON inválido" }, 400);

  if (caminho === "/api/files/upload-url") {
    const nome = String(corpo.name || "").replace(/[\\/\u0000-\u001f]/g, "_").trim().slice(0, 200);
    const tamanho = Number(corpo.size);
    if (!nome || !Number.isFinite(tamanho) || tamanho <= 0) {
      return resp({ error: "Arquivo inválido" }, 400);
    }
    if (tamanho > MAX_ARQUIVO) {
      return resp({ error: "Arquivo grande demais (limite atual: 4,5 GB por arquivo)" }, 413);
    }

    const plano = await planoAtivo(env, u.id);
    if (!plano) return resp({ error: "Você ainda não tem um plano ativo" }, 403);

    await env.DB.prepare(
      "DELETE FROM files WHERE user_id = ? AND status = 'pending' AND created_at < datetime('now', '-1 day')"
    ).bind(u.id).run();

    const uso = await env.DB.prepare(
      "SELECT COALESCE(SUM(size_bytes), 0) AS total FROM files WHERE user_id = ?"
    ).bind(u.id).first();
    if (uso.total + tamanho > plano.quota_gb * GB) {
      return resp({ error: "Espaço insuficiente no seu plano" }, 413);
    }

    const bytes = new Uint8Array(16);
    crypto.getRandomValues(bytes);
    const chave = "u" + u.id + "/" + paraHex(bytes);

    const r = await env.DB.prepare(
      "INSERT INTO files (user_id, object_key, name, size_bytes, status) VALUES (?, ?, ?, ?, 'pending')"
    ).bind(u.id, chave, nome, Math.floor(tamanho)).run();

    const link = await urlAssinada(env, "PUT", chave, 3600);
    return resp({ id: r.meta.last_row_id, url: link }, 200);
  }

  if (caminho === "/api/files/complete") {
    const id = parseInt(corpo.id, 10);
    const reg = await env.DB.prepare(
      "SELECT id, object_key FROM files WHERE id = ? AND user_id = ? AND status = 'pending'"
    ).bind(id, u.id).first();
    if (!reg) return resp({ error: "Envio não encontrado" }, 404);

    const head = await fetch(await urlAssinada(env, "HEAD", reg.object_key, 120), { method: "HEAD" });
    if (!head.ok) return resp({ error: "O envio não foi concluído" }, 400);

    const real = parseInt(head.headers.get("Content-Length") || "0", 10);
    const plano = await planoAtivo(env, u.id);
    const outros = await env.DB.prepare(
      "SELECT COALESCE(SUM(size_bytes), 0) AS total FROM files WHERE user_id = ? AND id != ?"
    ).bind(u.id, reg.id).first();

    if (!plano || real > MAX_ARQUIVO || outros.total + real > plano.quota_gb * GB) {
      await removerObjeto(env, reg.object_key);
      await env.DB.prepare("DELETE FROM files WHERE id = ?").bind(reg.id).run();
      return resp({ error: "Espaço insuficiente no seu plano" }, 413);
    }

    await env.DB.prepare(
      "UPDATE files SET size_bytes = ?, status = 'ready' WHERE id = ?"
    ).bind(real, reg.id).run();
    return resp({ ok: true }, 200);
  }

  if (caminho === "/api/files/delete") {
    const id = parseInt(corpo.id, 10);
    const reg = await env.DB.prepare(
      "SELECT id, object_key FROM files WHERE id = ? AND user_id = ?"
    ).bind(id, u.id).first();
    if (!reg) return resp({ error: "Arquivo não encontrado" }, 404);

    const r = await removerObjeto(env, reg.object_key);
    if (!r.ok && r.status !== 404) {
      console.error("Falha ao apagar no Backblaze:", r.status);
      return resp({ error: "Não foi possível apagar agora" }, 502);
    }
    await env.DB.prepare("DELETE FROM files WHERE id = ?").bind(reg.id).run();
    return resp({ ok: true }, 200);
  }

  return resp({ error: "Rota não encontrada" }, 404);
}
