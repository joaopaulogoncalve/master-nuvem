// Transforma uma cópia de segurança do banco (JSON baixado no /admin → Cópias) em um arquivo SQL.
// Uso:  node scripts/restaurar-copia.mjs banco-dia-26.json  →  gera banco-dia-26.sql
// Depois, com MUITO cuidado (apaga e regrava as tabelas da cópia):
//   1) teste num banco local:  npx wrangler d1 execute master-nuvem-db --local --file banco-dia-26.sql
//   2) só então, se for mesmo preciso, em produção (--remote). Combine antes com o João.
import { readFileSync, writeFileSync } from "node:fs";

const arq = process.argv[2];
if (!arq) { console.error("Informe o arquivo: node scripts/restaurar-copia.mjs banco-dia-26.json"); process.exit(1); }
const copia = JSON.parse(readFileSync(arq, "utf8"));
if (!copia.tabelas) { console.error("Arquivo não parece uma cópia da Master Nuvem."); process.exit(1); }

function valor(v) {
  if (v === null || v === undefined) return "NULL";
  if (typeof v === "number") return String(v);
  return "'" + String(v).replace(/'/g, "''") + "'";
}

const sql = ["PRAGMA foreign_keys = OFF;", "-- Cópia de " + copia.criado_em];
for (const nome of Object.keys(copia.tabelas)) {
  const t = copia.tabelas[nome];
  sql.push("DROP TABLE IF EXISTS \"" + nome + "\";");
  sql.push(t.sql.replace(/^CREATE TABLE IF NOT EXISTS/i, "CREATE TABLE") + ";");
  for (const linha of t.linhas) {
    const cols = Object.keys(linha);
    sql.push("INSERT INTO \"" + nome + "\" (" + cols.map(function (c) { return "\"" + c + "\""; }).join(", ") + ") VALUES (" + cols.map(function (c) { return valor(linha[c]); }).join(", ") + ");");
  }
}
sql.push("PRAGMA foreign_keys = ON;");
const saida = arq.replace(/\.json$/i, "") + ".sql";
writeFileSync(saida, sql.join("\n") + "\n");
console.log("Pronto: " + saida + " (" + Object.keys(copia.tabelas).length + " tabelas). Teste primeiro com --local.");
