// Roda todos os testes automáticos: node tests/rodar.mjs
// Cada teste usa um banco SQLite em memória (node:sqlite) e serviços simulados (Mercado Pago, Backblaze, Resend).
// Nada toca na produção. Precisa do Node 22.5 ou mais novo.
import { readdirSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const pasta = fileURLToPath(new URL(".", import.meta.url));
const raiz = fileURLToPath(new URL("../", import.meta.url));
const arquivos = readdirSync(pasta).filter(function (f) { return /^teste-.*\.mjs$/.test(f); }).sort();
let ruins = 0;
for (const f of arquivos) {
  const r = spawnSync(process.execPath, ["--no-warnings", pasta + f], { cwd: raiz, encoding: "utf8" });
  const saida = (r.stdout || "") + (r.stderr || "");
  const ok = r.status === 0 && /PASSARAM/.test(saida);
  if (!ok) ruins++;
  console.log((ok ? "ok      " : "FALHOU  ") + f);
  if (!ok) console.log(saida.split("\n").filter(function (l) { return /FALHA|Error/.test(l); }).slice(0, 5).join("\n"));
}
console.log("\n" + (arquivos.length - ruins) + " de " + arquivos.length + " grupos de testes passaram.");
process.exit(ruins ? 1 : 0);
