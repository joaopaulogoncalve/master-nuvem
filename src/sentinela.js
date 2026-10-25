// Sentinela: vigia que roda sozinho a cada 20 minutos (Cron "*/20 * * * *").
// Lê o diário de segurança (seguranca_eventos) e procura sinais de invasão. Quando encontra:
//  - TRANCA a conta (travada_em): derruba as sessões abertas e a pessoa só volta criando uma senha nova pelo e-mail;
//  - ou só AVISA (e-mail para o suporte e para o dono da conta).
// Todo alerta fica em sentinela_alertas (aparece no /admin). A "chave" do alerta impede repetir o mesmo aviso.

const SUPORTE = "contato@masternuvem.com.br";
const REMETENTE = "Master Nuvem <nao-responda@masternuvem.com.br>";
const SITE = "https://masternuvem.com.br";
const MAX_EMAILS = 10;

// Regras (contagens na última hora, exceto quando diz outra coisa).
export const REGRAS = {
  ERROS_2FA_TRANCA: 6,         // senha certa + código 2FA errado várias vezes = alguém tem a senha
  IPS_LOGIN_TRANCA: 5,         // a mesma conta entrou de 5+ conexões diferentes em 1 hora
  ERROS_LOGIN_AVISO: 10,       // muitas senhas erradas contra a mesma conta
  ERROS_LOGIN_GERAL: 60,       // muitas senhas erradas no site todo em 20 minutos (ataque em massa)
  DOWNLOADS_AVISO: 300,        // muitos downloads em 20 minutos pela mesma conta (possível cópia de tudo)
  ERROS_PORTAL_AVISO: 10       // muitas senhas erradas contra o mesmo cliente de um fotógrafo
};

async function enviar(env, para, assunto, texto) {
  if (!env.RESEND_API_KEY) {
    console.error("Sentinela: RESEND_API_KEY ausente; e-mail não enviado:", assunto);
    return false;
  }
  const html = "<div style=\"font-family:Arial,sans-serif;max-width:520px;margin:auto;color:#0f172a\">" +
    "<h2 style=\"color:#0ea5e9\">🛡️ Sentinela Master Nuvem</h2>" +
    texto.split("\n\n").map(function (p) {
      return "<p>" + p.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/\n/g, "<br>") + "</p>";
    }).join("") + "</div>";
  try {
    const r = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { "Authorization": "Bearer " + env.RESEND_API_KEY, "Content-Type": "application/json" },
      body: JSON.stringify({ from: REMETENTE, to: [para], subject: assunto, html: html, text: texto })
    });
    return r.ok;
  } catch (e) {
    console.error("Sentinela: falha ao enviar e-mail:", e.message);
    return false;
  }
}

function hoje() {
  return new Date().toISOString().slice(0, 10);
}

function horaAtual() {
  return new Date().toISOString().slice(0, 13);
}

export async function sentinela(env) {
  const rel = { trancou: 0, avisos: 0, emails: 0 };
  const fila = [];   // e-mails a enviar no fim (limitados por rodada)

  // Grava o alerta; devolve false se esse mesmo alerta já existia (não repete).
  async function alerta(chave, nivel, mensagem, quem) {
    const r = await env.DB.prepare(
      "INSERT OR IGNORE INTO sentinela_alertas (chave, nivel, user_id, cliente_id, mensagem) VALUES (?, ?, ?, ?, ?)"
    ).bind(chave, nivel, (quem && quem.user_id) || null, (quem && quem.cliente_id) || null, mensagem).run();
    if (!r.meta.changes) return false;
    if (nivel === "trancou") rel.trancou++; else rel.avisos++;
    console.log("Sentinela:", nivel, mensagem);
    return true;
  }

  async function trancarConta(userId, motivo) {
    const u = await env.DB.prepare("SELECT id, email, name, role, travada_em FROM users WHERE id = ?").bind(userId).first();
    if (!u || u.travada_em) return;
    if (!(await alerta("trancou:" + u.id + ":" + horaAtual(), "trancou", "Conta " + u.email + " trancada: " + motivo, { user_id: u.id }))) return;
    await env.DB.prepare("UPDATE users SET travada_em = datetime('now') WHERE id = ?").bind(u.id).run();
    await env.DB.prepare("DELETE FROM sessions WHERE user_id = ?").bind(u.id).run();
    fila.push({
      para: u.email,
      assunto: "Protegemos a sua conta - Master Nuvem",
      texto: "Olá" + (u.name ? ", " + u.name : "") + "!\n\n" +
        "Nossa sentinela de segurança percebeu uma atividade suspeita na sua conta (" + motivo + ") e, para proteger os seus arquivos, " +
        "trancou o acesso e desconectou todos os aparelhos.\n\n" +
        "Seus arquivos estão seguros. Para voltar a entrar, abra " + SITE + "/entrar, clique em \"Esqueci minha senha\" e crie uma senha nova.\n\n" +
        "Se foi você mesmo, é só criar a senha nova. Se não foi, a senha nova bloqueia quem estava tentando entrar.\n\n" +
        "Dúvidas: responda para " + SUPORTE + ".\n\nMaster Nuvem"
    });
    fila.push({
      para: SUPORTE,
      assunto: "🛡️ Sentinela trancou a conta " + u.email,
      texto: "A sentinela trancou a conta " + u.email + " (id " + u.id + (u.role === "admin" ? ", ADMINISTRADOR" : "") + ").\n\nMotivo: " + motivo +
        "\n\nA pessoa já recebeu um e-mail para criar uma senha nova. Para destravar na mão: " + SITE + "/admin → Sentinela."
    });
  }

  async function trancarClientePortal(clienteId, motivo) {
    const c = await env.DB.prepare(
      "SELECT c.id, c.email, c.travada_em, p.nome AS portal, u.email AS dono_email FROM portal_clientes c JOIN portais p ON p.id = c.portal_id JOIN users u ON u.id = p.user_id WHERE c.id = ?"
    ).bind(clienteId).first();
    if (!c || c.travada_em) return;
    if (!(await alerta("trancou-cli:" + c.id + ":" + horaAtual(), "trancou", "Cliente " + c.email + " do portal " + c.portal + " trancado: " + motivo, { cliente_id: c.id }))) return;
    await env.DB.prepare("UPDATE portal_clientes SET travada_em = datetime('now') WHERE id = ?").bind(c.id).run();
    await env.DB.prepare("DELETE FROM portal_sessoes WHERE cliente_id = ?").bind(c.id).run();
    fila.push({
      para: c.dono_email,
      assunto: "Protegemos o acesso de um cliente seu - Master Nuvem",
      texto: "Nossa sentinela de segurança percebeu uma atividade suspeita no acesso do seu cliente " + c.email + " (" + motivo + ") e trancou o acesso dele ao portal.\n\n" +
        "Para liberar, entre em " + SITE + "/meu-portal → Clientes → \"Nova senha\" e combine a senha nova com o seu cliente.\n\nMaster Nuvem"
    });
  }

  // Só contam eventos depois da última senha nova / destravamento: quem acabou de criar senha nova
  // não é trancado de novo pelos mesmos erros antigos.
  const depoisDoReset = "AND e.created_at > COALESCE((SELECT MAX(r.created_at) FROM seguranca_eventos r WHERE r.user_id = e.user_id AND r.tipo IN ('senha_redefinida', 'destravada')), '0') ";
  const depoisDoResetCli = "AND e.created_at > COALESCE((SELECT MAX(r.created_at) FROM seguranca_eventos r WHERE r.cliente_id = e.cliente_id AND r.tipo = 'destravada'), '0') ";

  // 1) Senha certa e código 2FA errado várias vezes: alguém tem a senha. TRANCA.
  const r2fa = await env.DB.prepare(
    "SELECT e.user_id, COUNT(*) AS n FROM seguranca_eventos e WHERE e.tipo = '2fa_erro' AND e.user_id IS NOT NULL AND e.created_at > datetime('now', '-1 hour') " +
    depoisDoReset + "GROUP BY e.user_id HAVING n >= ?"
  ).bind(REGRAS.ERROS_2FA_TRANCA).all();
  for (const x of r2fa.results) {
    await trancarConta(x.user_id, x.n + " códigos de verificação errados em 1 hora, com a senha certa");
  }

  // 2) A mesma conta entrou de muitas conexões diferentes em 1 hora (senha vazada/compartilhada). TRANCA.
  const rIps = await env.DB.prepare(
    "SELECT e.user_id, COUNT(DISTINCT e.ip_hash) AS n FROM seguranca_eventos e WHERE e.tipo = 'login_ok' AND e.user_id IS NOT NULL AND e.created_at > datetime('now', '-1 hour') " +
    depoisDoReset + "GROUP BY e.user_id HAVING n >= ?"
  ).bind(REGRAS.IPS_LOGIN_TRANCA).all();
  for (const x of rIps.results) {
    await trancarConta(x.user_id, "entrou de " + x.n + " conexões diferentes em 1 hora");
  }
  const rIpsCli = await env.DB.prepare(
    "SELECT e.cliente_id, COUNT(DISTINCT e.ip_hash) AS n FROM seguranca_eventos e WHERE e.tipo = 'portal_login_ok' AND e.cliente_id IS NOT NULL AND e.created_at > datetime('now', '-1 hour') " +
    depoisDoResetCli + "GROUP BY e.cliente_id HAVING n >= ?"
  ).bind(REGRAS.IPS_LOGIN_TRANCA).all();
  for (const x of rIpsCli.results) {
    await trancarClientePortal(x.cliente_id, "entrou de " + x.n + " conexões diferentes em 1 hora");
  }

  // 3) Muitas senhas erradas contra a mesma conta: o limite de tentativas já segura; AVISA o dono e o suporte.
  const rErros = await env.DB.prepare(
    "SELECT e.user_id, COUNT(*) AS n, u.email, u.name FROM seguranca_eventos e JOIN users u ON u.id = e.user_id " +
    "WHERE e.tipo = 'login_erro' AND e.created_at > datetime('now', '-1 hour') GROUP BY e.user_id HAVING n >= ?"
  ).bind(REGRAS.ERROS_LOGIN_AVISO).all();
  for (const x of rErros.results) {
    if (await alerta("erros-login:" + x.user_id + ":" + hoje(), "aviso", x.n + " senhas erradas em 1 hora na conta " + x.email, { user_id: x.user_id })) {
      fila.push({
        para: x.email,
        assunto: "Tentaram entrar na sua conta - Master Nuvem",
        texto: "Olá" + (x.name ? ", " + x.name : "") + "!\n\nNossa sentinela viu " + x.n + " tentativas de entrar na sua conta com a senha errada na última hora. " +
          "Por segurança, novas tentativas ficam bloqueadas por 1 hora.\n\nSe não foi você, recomendamos criar uma senha nova (" + SITE + "/entrar → \"Esqueci minha senha\") " +
          "e ligar a verificação em duas etapas no painel.\n\nMaster Nuvem"
      });
    }
  }

  // 4) Ataque em massa: muitas senhas erradas no site todo em 20 minutos. AVISA o suporte.
  const geral = await env.DB.prepare(
    "SELECT COUNT(*) AS n, COUNT(DISTINCT ip_hash) AS ips FROM seguranca_eventos WHERE tipo IN ('login_erro', 'portal_login_erro') AND created_at > datetime('now', '-20 minutes')"
  ).first();
  if (geral.n >= REGRAS.ERROS_LOGIN_GERAL && await alerta("massa:" + horaAtual(), "aviso", geral.n + " senhas erradas em 20 minutos no site, de " + geral.ips + " conexão(ões)", null)) {
    fila.push({
      para: SUPORTE,
      assunto: "🛡️ Sentinela: muitas tentativas de login no site",
      texto: "Nos últimos 20 minutos houve " + geral.n + " tentativas de login com senha errada, vindas de " + geral.ips + " conexão(ões).\n\n" +
        "O limite de tentativas já está bloqueando. Se continuar, vale ligar o Bot Fight Mode / Turnstile na Cloudflare."
    });
  }

  // 5) Muitos downloads em 20 minutos pela mesma conta ou cliente: possível cópia de tudo. AVISA o suporte.
  const rDown = await env.DB.prepare(
    "SELECT e.user_id, e.cliente_id, COUNT(*) AS n, COALESCE(u.email, c.email) AS email FROM seguranca_eventos e " +
    "LEFT JOIN users u ON u.id = e.user_id LEFT JOIN portal_clientes c ON c.id = e.cliente_id " +
    "WHERE e.tipo = 'download' AND e.created_at > datetime('now', '-20 minutes') GROUP BY e.user_id, e.cliente_id HAVING n >= ?"
  ).bind(REGRAS.DOWNLOADS_AVISO).all();
  for (const x of rDown.results) {
    const chave = "downloads:" + (x.user_id ? "u" + x.user_id : "c" + x.cliente_id) + ":" + horaAtual();
    if (await alerta(chave, "aviso", x.n + " downloads em 20 minutos por " + (x.cliente_id ? "cliente de portal " : "") + x.email, { user_id: x.user_id, cliente_id: x.cliente_id })) {
      fila.push({
        para: SUPORTE,
        assunto: "🛡️ Sentinela: muitos downloads de " + x.email,
        texto: x.n + " links de download em 20 minutos por " + x.email + ". Pode ser normal (baixando um álbum inteiro) ou alguém copiando tudo.\n\n" +
          "Se achar estranho, tranque a conta no " + SITE + "/admin → Sentinela."
      });
    }
  }

  // 6) Muitas senhas erradas contra o mesmo cliente de um fotógrafo. AVISA (o limite de tentativas já segura).
  const rCli = await env.DB.prepare(
    "SELECT e.cliente_id, COUNT(*) AS n, c.email FROM seguranca_eventos e JOIN portal_clientes c ON c.id = e.cliente_id " +
    "WHERE e.tipo = 'portal_login_erro' AND e.created_at > datetime('now', '-1 hour') GROUP BY e.cliente_id HAVING n >= ?"
  ).bind(REGRAS.ERROS_PORTAL_AVISO).all();
  for (const x of rCli.results) {
    await alerta("erros-portal:" + x.cliente_id + ":" + hoje(), "aviso", x.n + " senhas erradas em 1 hora no acesso do cliente " + x.email, { cliente_id: x.cliente_id });
  }

  // 7) Conta de administrador nova (ninguém deveria virar admin sem o João saber). AVISA.
  const admins = await env.DB.prepare(
    "SELECT id, email FROM users WHERE role = 'admin' AND created_at > datetime('now', '-1 day')"
  ).all();
  for (const a of admins.results) {
    if (await alerta("admin-novo:" + a.id, "aviso", "Conta de administrador nova: " + a.email, { user_id: a.id })) {
      fila.push({ para: SUPORTE, assunto: "🛡️ Sentinela: nova conta de administrador", texto: "Foi criada uma conta de administrador: " + a.email + " (id " + a.id + "). Se não foi você, verifique já." });
    }
  }

  // 8) Entrada na conta de administrador: AVISA uma vez por conexão por dia (para o João saber se não foi ele).
  const rAdm = await env.DB.prepare(
    "SELECT e.ip_hash, MAX(e.created_at) AS quando, u.email FROM seguranca_eventos e JOIN users u ON u.id = e.user_id " +
    "WHERE e.tipo = 'login_ok' AND u.role = 'admin' AND e.created_at > datetime('now', '-1 hour') GROUP BY e.ip_hash, u.email"
  ).all();
  for (const x of rAdm.results) {
    if (await alerta("admin-entrou:" + String(x.ip_hash).slice(0, 16) + ":" + hoje(), "aviso", "Entraram na conta de administrador " + x.email + " (" + x.quando + " UTC)", null)) {
      fila.push({
        para: SUPORTE,
        assunto: "🛡️ Sentinela: entraram na conta de administrador",
        texto: "Alguém entrou na conta de administrador " + x.email + " às " + x.quando + " (horário UTC; no Brasil são 3 horas a menos).\n\n" +
          "Se foi você, ignore. Se não foi, troque a senha agora (" + SITE + "/entrar → \"Esqueci minha senha\")."
      });
    }
  }

  // 9) Garantia: conta trancada não pode ter sessão aberta.
  await env.DB.prepare("DELETE FROM sessions WHERE user_id IN (SELECT id FROM users WHERE travada_em IS NOT NULL)").run();
  await env.DB.prepare("DELETE FROM portal_sessoes WHERE cliente_id IN (SELECT id FROM portal_clientes WHERE travada_em IS NOT NULL)").run();

  for (const m of fila.slice(0, MAX_EMAILS)) {
    if (await enviar(env, m.para, m.assunto, m.texto)) rel.emails++;
  }
  if (rel.trancou || rel.avisos) console.log("Sentinela:", JSON.stringify(rel));
  return rel;
}
