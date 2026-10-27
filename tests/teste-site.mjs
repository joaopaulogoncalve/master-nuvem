// Teste do quadradinho "Site no ar": leitura dos monitores do UptimeRobot (simulado).
const { lerUptimeRobot } = await import(new URL("../src/worker.js", import.meta.url).href);
let falhas = 0;
function confere(nome, ok, info) { console.log((ok ? "OK   " : "FALHA") + " " + nome + (ok ? "" : "  -> " + JSON.stringify(info))); if (!ok) falhas++; }

let r = await lerUptimeRobot({});
confere("sem chave: avisa que falta ligar", r.configurado === false, r);

let enviado = null;
globalThis.fetch = async (url, op) => {
  enviado = { url: String(url), corpo: new URLSearchParams(op.body) };
  return new Response(JSON.stringify({ stat: "ok", monitors: [
    { friendly_name: "Site", url: "https://masternuvem.com.br", status: 2, custom_uptime_ratio: "99.950", logs: [
      { type: 2, datetime: 1793000000, duration: 100 },
      { type: 1, datetime: 1792990000, duration: 420, reason: { detail: "Connection Timeout" } }] },
    { friendly_name: "Saúde", url: "https://masternuvem.com.br/api/saude", status: 9, custom_uptime_ratio: "98.1", logs: [] },
    { friendly_name: "Novo", url: "https://x", status: 1 }
  ] }));
};
r = await lerUptimeRobot({ UPTIMEROBOT_API_KEY: "ur-teste" });
confere("pede 30 dias e as quedas", enviado.url.endsWith("/v2/getMonitors") && enviado.corpo.get("custom_uptime_ratios") === "30" && enviado.corpo.get("logs") === "1", enviado.url);
confere("3 monitores", r.monitores.length === 3, r);
confere("status traduzidos", r.monitores.map(m => m.status).join() === "no_ar,fora,preparando", r.monitores);
confere("porcentagem de 30 dias", r.monitores[0].uptime_30 === 99.95 && r.monitores[2].uptime_30 === null, r.monitores);
confere("só as quedas, com duração e motivo", r.monitores[0].quedas.length === 1 && r.monitores[0].quedas[0].duracao_s === 420 && r.monitores[0].quedas[0].motivo === "Connection Timeout", r.monitores[0].quedas);
confere("a chave não volta para a tela", !JSON.stringify(r).includes("ur-teste"), r);

globalThis.fetch = async () => new Response(JSON.stringify({ stat: "fail", error: { message: "api_key not found." } }));
r = await lerUptimeRobot({ UPTIMEROBOT_API_KEY: "errada" });
confere("chave errada: mostra o erro", r.erro === "api_key not found.", r);
globalThis.fetch = async () => { throw new Error("rede"); };
r = await lerUptimeRobot({ UPTIMEROBOT_API_KEY: "x" });
confere("UptimeRobot fora: não quebra", /Não foi possível/.test(r.erro), r);

console.log(falhas ? "\n" + falhas + " FALHA(S)" : "\nTODOS OS TESTES PASSARAM");
process.exit(falhas ? 1 : 0);
