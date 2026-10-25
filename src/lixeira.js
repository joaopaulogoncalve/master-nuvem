// Lixeira do Meu estúdio: álbuns, clientes e eventos removidos há mais de 30 minutos são apagados de verdade
// (fotos no Backblaze + registros). Roda junto com a sentinela, de 20 em 20 minutos.
// Apaga aos poucos (MAX_POR_RODADA arquivos) por causa do limite de chamadas externas por execução.
import { removerObjeto } from "./arquivos.js";

export const MINUTOS_PARA_DESFAZER = 30;
const MAX_POR_RODADA = 25;

export async function purgarLixeira(env) {
  const rel = { arquivos: 0, albuns: 0, clientes: 0, eventos: 0 };
  const prazo = "-" + MINUTOS_PARA_DESFAZER + " minutes";
  let resta = MAX_POR_RODADA;

  async function apagarArquivos(sql, id) {
    if (resta <= 0) return false;
    const r = await env.DB.prepare(sql + " LIMIT ?").bind(id, resta).all();
    for (const f of r.results) {
      const x = await removerObjeto(env, f.object_key);
      if (!x.ok && x.status !== 404) { console.error("Lixeira: falha ao apagar no B2", f.id, x.status); return false; }
      await env.DB.prepare("DELETE FROM favoritos WHERE file_id = ?").bind(f.id).run();
      await env.DB.prepare("DELETE FROM album_downloads WHERE file_id = ?").bind(f.id).run();
      await env.DB.prepare("DELETE FROM pedidos_edicao WHERE file_id = ?").bind(f.id).run();
      await env.DB.prepare("DELETE FROM evento_fotos WHERE original_id = ? OR previa_id = ?").bind(f.id, f.id).run();
      await env.DB.prepare("DELETE FROM files WHERE id = ?").bind(f.id).run();
      resta--;
      rel.arquivos++;
    }
    return true;
  }

  // 1) Álbuns: primeiro as fotos; quando não sobra nenhuma, o álbum.
  const albuns = await env.DB.prepare("SELECT id FROM albuns WHERE removido_em IS NOT NULL AND removido_em < datetime('now', ?) LIMIT 20").bind(prazo).all();
  for (const a of albuns.results) {
    if (!(await apagarArquivos("SELECT id, object_key FROM files WHERE album_id = ?", a.id))) break;
    const n = await env.DB.prepare("SELECT COUNT(*) AS n FROM files WHERE album_id = ?").bind(a.id).first();
    if (n.n) break;
    await env.DB.prepare("DELETE FROM album_downloads WHERE album_id = ?").bind(a.id).run();
    await env.DB.prepare("DELETE FROM pedidos_edicao WHERE album_id = ?").bind(a.id).run();
    await env.DB.prepare("UPDATE cobrancas SET album_id = NULL WHERE album_id = ?").bind(a.id).run();
    await env.DB.prepare("DELETE FROM albuns WHERE id = ?").bind(a.id).run();
    rel.albuns++;
  }

  // 2) Clientes removidos que já não têm nenhum álbum.
  const clientes = await env.DB.prepare(
    "SELECT c.id FROM portal_clientes c WHERE c.removido_em IS NOT NULL AND c.removido_em < datetime('now', ?) " +
    "AND NOT EXISTS (SELECT 1 FROM albuns a WHERE a.cliente_id = c.id) LIMIT 20"
  ).bind(prazo).all();
  for (const c of clientes.results) {
    await env.DB.prepare("DELETE FROM favoritos WHERE cliente_id = ?").bind(c.id).run();
    await env.DB.prepare("DELETE FROM portal_sessoes WHERE cliente_id = ?").bind(c.id).run();
    await env.DB.prepare("DELETE FROM cobrancas WHERE cliente_id = ?").bind(c.id).run();
    await env.DB.prepare("DELETE FROM portal_clientes WHERE id = ?").bind(c.id).run();
    rel.clientes++;
  }

  // 3) Eventos: originais e prévias; quando não sobra nenhum arquivo, fotos, pedidos e o evento.
  const eventos = await env.DB.prepare("SELECT id FROM eventos WHERE removido_em IS NOT NULL AND removido_em < datetime('now', ?) LIMIT 20").bind(prazo).all();
  for (const e of eventos.results) {
    if (!(await apagarArquivos("SELECT id, object_key FROM files WHERE evento_id = ?", e.id))) break;
    const n = await env.DB.prepare("SELECT COUNT(*) AS n FROM files WHERE evento_id = ?").bind(e.id).first();
    if (n.n) break;
    await env.DB.prepare("DELETE FROM evento_fotos WHERE evento_id = ?").bind(e.id).run();
    await env.DB.prepare("DELETE FROM evento_pedidos WHERE evento_id = ?").bind(e.id).run();
    await env.DB.prepare("DELETE FROM eventos WHERE id = ?").bind(e.id).run();
    rel.eventos++;
  }

  if (rel.arquivos || rel.albuns || rel.clientes || rel.eventos) console.log("Lixeira:", JSON.stringify(rel));
  return rel;
}
