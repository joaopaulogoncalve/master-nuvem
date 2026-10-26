// Cópia de segurança do banco D1: todas as tabelas viram um JSON guardado no Backblaze (bucket privado).
// Roda todo dia pelo Cron da limpeza (06:00 UTC = 03:00 em Brasília) e pelo botão "Fazer cópia agora" no /admin.
// Nome por dia do mês (backups/banco-dia-DD.json): fica um rodízio de 31 dias sem precisar apagar nada.
// Para restaurar: scripts/restaurar-copia.mjs (gera o SQL a partir do JSON).
import { enviarObjeto } from "./arquivos.js";

// Tabelas que não vale guardar: sessões (todo mundo entra de novo), contadores de limite e links de senha (expiram).
const FORA = ["sessions", "portal_sessoes", "assistente_limite", "password_resets", "sqlite_sequence", "_cf_KV", "d1_migrations"];
export const PASTA_COPIAS = "backups/";

export async function fazerCopia(env) {
  const dia = new Date().toISOString().slice(8, 10);
  const chave = PASTA_COPIAS + "banco-dia-" + dia + ".json";
  try {
    const t = await env.DB.prepare("SELECT name, sql FROM sqlite_master WHERE type = 'table' AND name NOT LIKE '_cf_%' ORDER BY name").all();
    const copia = { versao: 1, criado_em: new Date().toISOString(), tabelas: {} };
    let linhas = 0, tabelas = 0;
    for (const tab of t.results) {
      if (FORA.indexOf(tab.name) > -1) continue;
      const r = await env.DB.prepare("SELECT * FROM \"" + tab.name.replace(/"/g, "") + "\"").all();
      copia.tabelas[tab.name] = { sql: tab.sql, linhas: r.results };
      linhas += r.results.length;
      tabelas++;
    }
    const corpo = JSON.stringify(copia);
    const r = await enviarObjeto(env, chave, corpo, "application/json");
    if (!r.ok) throw new Error("Backblaze respondeu " + r.status);
    await env.DB.prepare("INSERT INTO copias (chave, bytes, tabelas, linhas) VALUES (?, ?, ?, ?)").bind(chave, corpo.length, tabelas, linhas).run();
    await env.DB.prepare("DELETE FROM copias WHERE created_at < datetime('now', '-90 days')").run();
    return { ok: true, chave: chave, bytes: corpo.length, tabelas: tabelas, linhas: linhas };
  } catch (e) {
    console.error("Cópia de segurança falhou:", e.message);
    await env.DB.prepare("INSERT INTO copias (chave, bytes, tabelas, linhas, ok, erro) VALUES (?, 0, 0, 0, 0, ?)").bind(chave, String(e.message).slice(0, 300)).run();
    return { ok: false, erro: e.message };
  }
}
