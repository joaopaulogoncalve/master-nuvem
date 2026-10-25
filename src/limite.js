// Limite de tentativas (contra quem tenta adivinhar senhas ou abusar das rotas abertas).
// Usa a tabela assistente_limite: só guarda um hash (do IP do dia, ou do e-mail), nunca o dado puro.
// A limpeza de hora em hora apaga os registros com mais de 1 dia.
const enc = new TextEncoder();

async function sha256Hex(txt) {
  return Array.from(new Uint8Array(await crypto.subtle.digest("SHA-256", enc.encode(txt)))).map(function (b) {
    return b.toString(16).padStart(2, "0");
  }).join("");
}

// Chave do IP de quem está chamando (o hash muda todo dia).
export async function chaveIp(request) {
  const ip = request.headers.get("CF-Connecting-IP") || "desconhecido";
  return await sha256Hex(ip + "|" + new Date().toISOString().slice(0, 10));
}

// Chave de uma conta (e-mail, id...), para limitar tentativas contra a mesma conta vindas de IPs diferentes.
export async function chaveConta(texto) {
  return await sha256Hex("conta|" + String(texto).toLowerCase());
}

// true = já passou do limite na última hora.
export async function limiteAtingido(env, chave, tipo, maximo) {
  const n = await env.DB.prepare(
    "SELECT COUNT(*) AS n FROM assistente_limite WHERE chave = ? AND tipo = ? AND created_at > datetime('now', '-1 hour')"
  ).bind(chave, tipo).first();
  return n.n >= maximo;
}

export async function registrarTentativa(env, chave, tipo) {
  await env.DB.prepare("INSERT INTO assistente_limite (chave, tipo) VALUES (?, ?)").bind(chave, tipo).run();
}

// Diário de segurança que a sentinela lê a cada 20 minutos (login certo/errado, código 2FA errado, downloads...).
// Guarda só o hash do IP do dia. Nunca deixa a rota falhar por causa do registro.
export async function registrarEvento(env, request, tipo, quem) {
  try {
    await env.DB.prepare(
      "INSERT INTO seguranca_eventos (tipo, user_id, cliente_id, ip_hash) VALUES (?, ?, ?, ?)"
    ).bind(tipo, (quem && quem.user_id) || null, (quem && quem.cliente_id) || null, request ? await chaveIp(request) : null).run();
  } catch (e) {
    console.error("Falha ao registrar evento de segurança:", e.message);
  }
}

// Confere e já conta a tentativa. Devolve false se passou do limite.
export async function dentroDoLimite(env, chave, tipo, maximo) {
  if (await limiteAtingido(env, chave, tipo, maximo)) return false;
  await registrarTentativa(env, chave, tipo);
  return true;
}
