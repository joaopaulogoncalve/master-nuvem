// Assistente da Master Nuvem: a nuvenzinha responde dúvidas com as perguntas e respostas cadastradas no /admin.
// O que ela não souber vira "chamado" (e-mail para o suporte). Basta incluir <script src="/assistente.js" defer></script>.
(function () {
  if (window.__assistenteNuvem) return;
  window.__assistenteNuvem = true;

  var faq = [];
  var bancos = [];
  var prazo = "48 horas";
  var emailSuporte = "contato@masternuvem.com.br";
  var carregado = false;
  var aberto = false;
  var usuario = null;

  var css =
    "#nv-botao{position:fixed;right:16px;bottom:16px;z-index:70;width:68px;height:68px;border-radius:999px;border:1px solid #38bdf866;background:linear-gradient(160deg,#0c1a3d,#07102a);box-shadow:0 0 30px #38bdf855;display:flex;align-items:center;justify-content:center;cursor:pointer;animation:nv-flutuar 4s ease-in-out infinite}" +
    "#nv-botao img{width:52px}" +
    "#nv-botao .nv-dica{position:absolute;right:76px;bottom:18px;white-space:nowrap;background:#fff;color:#0f172a;font:600 13px system-ui,sans-serif;padding:7px 12px;border-radius:12px;box-shadow:0 6px 20px #0005}" +
    "@keyframes nv-flutuar{0%,100%{transform:translateY(0)}50%{transform:translateY(-6px)}}" +
    "#nv-painel{position:fixed;right:16px;bottom:96px;z-index:71;width:min(370px,calc(100vw - 32px));height:min(560px,calc(100vh - 120px));display:none;flex-direction:column;border-radius:22px;overflow:hidden;background:#07102a;border:1px solid #1e40af99;box-shadow:0 20px 60px #000a;font-family:system-ui,-apple-system,Segoe UI,sans-serif;color:#e2e8f0}" +
    "#nv-painel.nv-aberto{display:flex}" +
    "#nv-topo{display:flex;align-items:center;gap:10px;padding:12px 14px;background:linear-gradient(90deg,#0ea5e9,#6366f1);color:#fff}" +
    "#nv-topo img{width:40px;background:#07102a;border-radius:12px;padding:3px}" +
    "#nv-topo b{display:block;font-size:15px}#nv-topo span{font-size:12px;opacity:.9}" +
    "#nv-fechar{margin-left:auto;background:none;border:0;color:#fff;font-size:22px;cursor:pointer;line-height:1}" +
    "#nv-msgs{flex:1;overflow-y:auto;padding:14px;display:flex;flex-direction:column;gap:10px}" +
    ".nv-msg{max-width:88%;padding:10px 13px;border-radius:16px;font-size:14px;line-height:1.45;white-space:pre-line;word-wrap:break-word}" +
    ".nv-bot{align-self:flex-start;background:#0c1a3d;border:1px solid #1e3a8a;border-bottom-left-radius:4px}" +
    ".nv-eu{align-self:flex-end;background:linear-gradient(90deg,#0ea5e9,#6366f1);color:#fff;border-bottom-right-radius:4px}" +
    ".nv-msg a{color:#67e8f9;text-decoration:underline}" +
    ".nv-chips{display:flex;flex-wrap:wrap;gap:6px;align-self:flex-start;max-width:100%}" +
    ".nv-chip{border:1px solid #1e40af;background:#0a1633;color:#bae6fd;font-size:12.5px;font-weight:600;padding:6px 11px;border-radius:999px;cursor:pointer;text-align:left}" +
    ".nv-chip:hover{border-color:#38bdf8;color:#fff}" +
    ".nv-chip.nv-forte{background:linear-gradient(90deg,#0ea5e9,#6366f1);border-color:transparent;color:#fff}" +
    "#nv-form{display:flex;gap:8px;padding:10px;border-top:1px solid #1e3a8a;background:#050c20}" +
    "#nv-texto{flex:1;min-width:0;background:#0a1633;border:1px solid #1e3a8a;color:#fff;border-radius:12px;padding:10px 12px;font-size:14px;outline:none}" +
    "#nv-texto:focus{border-color:#38bdf8}" +
    "#nv-enviar{background:linear-gradient(90deg,#0ea5e9,#6366f1);color:#fff;border:0;border-radius:12px;padding:0 14px;font-weight:700;cursor:pointer}" +
    ".nv-campo{width:100%;box-sizing:border-box;background:#0a1633;border:1px solid #1e3a8a;color:#fff;border-radius:10px;padding:8px 10px;font-size:13.5px;margin-top:6px;outline:none;font-family:inherit}" +
    ".nv-btn{margin-top:8px;background:linear-gradient(90deg,#0ea5e9,#6366f1);color:#fff;border:0;border-radius:10px;padding:9px 14px;font-weight:700;cursor:pointer;font-size:13.5px}" +
    ".nv-erro{color:#fca5a5;font-size:12.5px;margin-top:6px}" +
    "@media (prefers-reduced-motion:reduce){#nv-botao{animation:none}}";

  function el(tag, attrs, texto) {
    var e = document.createElement(tag);
    if (attrs) Object.keys(attrs).forEach(function (k) { e.setAttribute(k, attrs[k]); });
    if (texto !== undefined) e.textContent = texto;
    return e;
  }

  function semAcento(t) {
    return String(t || "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
  }

  // Monta o texto da resposta com links seguros: [texto](/caminho) ou [texto](mailto:...).
  function textoComLinks(destino, texto) {
    var re = /\[([^\]]+)\]\(((?:\/|mailto:)[^)\s]*)\)/g, ultimo = 0, m;
    while ((m = re.exec(texto))) {
      destino.appendChild(document.createTextNode(texto.slice(ultimo, m.index)));
      var a = el("a", { href: m[2] }, m[1]);
      destino.appendChild(a);
      ultimo = re.lastIndex;
    }
    destino.appendChild(document.createTextNode(texto.slice(ultimo)));
  }

  // Procura a resposta mais parecida: palavras-chave valem mais; palavras da pergunta ajudam.
  var IGNORAR = { como: 1, para: 1, voce: 1, voces: 1, minha: 1, meus: 1, minhas: 1, posso: 1, quero: 1, sobre: 1, esta: 1, isso: 1, qual: 1, quais: 1, onde: 1, porque: 1, quando: 1, tenho: 1, nuvem: 1, master: 1 };
  function buscar(texto) {
    var t = " " + semAcento(texto).replace(/[^a-z0-9,\s]/g, " ").replace(/\s+/g, " ") + " ";
    var palavrasT = t.split(" ").filter(function (p) { return p.length > 3 && !IGNORAR[p]; });
    var lista = faq.map(function (f) {
      var pontos = 0;
      f.palavras.split(",").forEach(function (k) {
        k = k.trim();
        if (k.length > 1 && t.indexOf(" " + k) > -1) pontos += k.indexOf(" ") > -1 ? 3 : 2;
      });
      var doTitulo = semAcento(f.pergunta).replace(/[^a-z0-9\s]/g, " ").split(/\s+/);
      palavrasT.forEach(function (p) { if (doTitulo.indexOf(p) > -1) pontos += 1; });
      return { f: f, pontos: pontos };
    }).filter(function (x) { return x.pontos >= 2; });
    lista.sort(function (a, b) { return b.pontos - a.pontos; });
    return lista;
  }

  function registrar(texto, faqId) {
    fetch("/api/assistente/pergunta", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ texto: texto, faq_id: faqId || null })
    }).catch(function () {});
  }

  /* ---------- tela ---------- */

  var estilo = el("style");
  estilo.textContent = css;
  document.head.appendChild(estilo);

  var botao = el("button", { id: "nv-botao", type: "button", "aria-label": "Abrir o assistente da Master Nuvem" });
  botao.appendChild(el("img", { src: "/marca/mascote.svg", alt: "" }));
  var dica = el("span", { class: "nv-dica" }, "Dúvidas? Fala comigo!");
  botao.appendChild(dica);
  setTimeout(function () { dica.style.display = "none"; }, 7000);

  var painel = el("section", { id: "nv-painel", role: "dialog", "aria-label": "Assistente da Master Nuvem" });
  var topo = el("div", { id: "nv-topo" });
  topo.appendChild(el("img", { src: "/marca/mascote.svg", alt: "" }));
  var tit = el("div");
  tit.appendChild(el("b", null, "Nuvem"));
  tit.appendChild(el("span", null, "Assistente da Master Nuvem"));
  topo.appendChild(tit);
  var fechar = el("button", { id: "nv-fechar", type: "button", "aria-label": "Fechar" }, "×");
  topo.appendChild(fechar);
  var msgs = el("div", { id: "nv-msgs", "aria-live": "polite" });
  var form = el("form", { id: "nv-form" });
  var entrada = el("input", { id: "nv-texto", type: "text", maxlength: "300", placeholder: "Digite sua dúvida...", autocomplete: "off" });
  form.appendChild(entrada);
  form.appendChild(el("button", { id: "nv-enviar", type: "submit" }, "Enviar"));
  painel.appendChild(topo);
  painel.appendChild(msgs);
  painel.appendChild(form);

  function rolar() { msgs.scrollTop = msgs.scrollHeight; }

  function falaBot(texto) {
    var m = el("div", { class: "nv-msg nv-bot" });
    textoComLinks(m, texto);
    msgs.appendChild(m);
    rolar();
    return m;
  }

  function falaEu(texto) {
    msgs.appendChild(el("div", { class: "nv-msg nv-eu" }, texto));
    rolar();
  }

  function chips(opcoes) {
    var c = el("div", { class: "nv-chips" });
    opcoes.forEach(function (o) {
      var b = el("button", { type: "button", class: "nv-chip" + (o.forte ? " nv-forte" : "") }, o.texto);
      b.addEventListener("click", function () { c.remove(); o.acao(); });
      c.appendChild(b);
    });
    msgs.appendChild(c);
    rolar();
  }

  function sugestoesIniciais() {
    chips(faq.slice(0, 6).map(function (f) {
      return { texto: f.pergunta, acao: function () { responder(f, f.pergunta, true); } };
    }).concat([{ texto: "Falar com uma pessoa", acao: function () { abrirChamado(""); } }]));
  }

  function responder(f, textoPergunta, clicou) {
    falaEu(textoPergunta);
    registrar(textoPergunta, f.id);
    setTimeout(function () {
      falaBot(f.resposta);
      var opcoes = [
        { texto: "👍 Resolveu", acao: function () { falaBot("Que bom! Se precisar de mais alguma coisa, é só perguntar. ☁️"); } },
        { texto: "👎 Não resolveu", acao: function () { naoResolveu(textoPergunta); } }
      ];
      // Respostas que mandam abrir chamado já mostram o botão.
      if (/abr(ir|a) (um )?chamado/i.test(f.resposta)) opcoes.unshift({ texto: "Abrir chamado", forte: true, acao: function () { abrirChamado(clicou ? "" : textoPergunta); } });
      chips(opcoes);
    }, clicou ? 250 : 450);
  }

  function naoResolveu(textoPergunta) {
    falaBot("Poxa, desculpa! Quer que uma pessoa da equipe responda? Abrindo um chamado, a gente responde por e-mail em até " + prazo + ".");
    chips([
      { texto: "Abrir chamado", forte: true, acao: function () { abrirChamado(textoPergunta); } },
      { texto: "Ver outras dúvidas", acao: sugestoesIniciais }
    ]);
  }

  /* ---------- bancos: links oficiais para chave PIX e link de pagamento ---------- */

  var ASSUNTO_BANCO = /\b(pix|chave|link de pagamento|link pagamento|maquininha|maquina|cartao|receber|recebo|cobrar|banco|conta digital)\b/;
  function acharBanco(texto) {
    var t = " " + semAcento(texto).replace(/[^a-z0-9\s]/g, " ").replace(/\s+/g, " ") + " ";
    if (!ASSUNTO_BANCO.test(t)) return null;
    var melhor = null, tam = 0;
    bancos.forEach(function (b) {
      (b.palavras + "," + b.nome).split(",").forEach(function (p) {
        p = " " + semAcento(p).trim() + " ";
        if (p.length > 3 && t.indexOf(p) > -1 && p.length > tam) { melhor = b; tam = p.length; }
      });
    });
    return melhor || "assunto";
  }

  function linkExterno(destino, texto, href) {
    var a = el("a", { href: href, target: "_blank", rel: "noopener noreferrer" }, texto + " ↗");
    destino.appendChild(a);
    destino.appendChild(document.createTextNode("\n"));
  }

  function responderBanco(b) {
    var m = falaBot("Achei! No " + b.nome + ":\n");
    if (b.link_pix) linkExterno(m, "Como cadastrar a chave PIX", b.link_pix);
    if (b.link_pagamento) linkExterno(m, "Como criar link de pagamento", b.link_pagamento);
    m.appendChild(document.createTextNode(b.tem_api ?
      "\nConfirmação do pagamento: por enquanto você confere no app e clica em \"Marcar como pago\" (o " + b.nome + " permite confirmação automática no futuro)." :
      "\nConfirmação do pagamento: é manual. O dinheiro cai direto na sua conta; confira no app e clique em \"Marcar como pago\" no Meu estúdio."));
    m.appendChild(document.createTextNode("\nDepois cole a chave e o link em "));
    m.appendChild(el("a", { href: "/meu-portal?aba=receber" }, "Como recebo"));
    m.appendChild(document.createTextNode("."));
    rolar();
    chips([
      { texto: "👍 Resolveu", acao: function () { falaBot("Que bom! Qualquer coisa, é só chamar. ☁️"); } },
      { texto: "Outro banco", acao: escolherBanco }
    ]);
  }

  function escolherBanco() {
    falaBot("Qual é o seu banco ou maquininha?");
    chips(bancos.map(function (b) {
      return { texto: b.nome, acao: function () { falaEu(b.nome); setTimeout(function () { responderBanco(b); }, 300); } };
    }).concat([{ texto: "Não está na lista", forte: true, acao: pedirBanco }]));
  }

  // Banco que a Nuvenzinha não conhece: vira pedido; o João aprova o link oficial e a pessoa recebe por e-mail.
  function pedirBanco() {
    var caixa = el("div", { class: "nv-msg nv-bot" });
    caixa.appendChild(document.createTextNode("Ainda não conheço esse 😅 Me diga qual é que eu procuro o link oficial e te mando por e-mail em até " + prazo + ":"));
    var banco = el("input", { class: "nv-campo", maxlength: "60", placeholder: "Nome do banco ou maquininha" });
    var nome = el("input", { class: "nv-campo", maxlength: "80", placeholder: "Seu nome", autocomplete: "name" });
    var email = el("input", { class: "nv-campo", type: "email", maxlength: "120", placeholder: "Seu e-mail", autocomplete: "email" });
    if (usuario) { nome.value = usuario.nome || ""; email.value = usuario.email || ""; }
    var erro = el("div", { class: "nv-erro" });
    var enviar = el("button", { class: "nv-btn", type: "button" }, "Pedir os links");
    [banco, nome, email, erro, enviar].forEach(function (x) { caixa.appendChild(x); });
    msgs.appendChild(caixa);
    rolar();
    banco.focus();
    enviar.addEventListener("click", function () {
      erro.textContent = "";
      enviar.disabled = true;
      fetch("/api/bancos/pedido", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ banco: banco.value, nome: nome.value, email: email.value })
      }).then(function (r) { return r.json().then(function (d) { return { ok: r.ok, d: d }; }); }).then(function (r) {
        enviar.disabled = false;
        if (!r.ok) { erro.textContent = r.d.error || "Não foi possível enviar."; return; }
        caixa.remove();
        falaBot("Pedido nº " + r.d.protocolo + " anotado ✅\nAssim que a equipe conferir o link oficial do " + banco.value.trim() + ", eu te mando no e-mail " + email.value.trim() + " (em até " + r.d.prazo + ").");
      }).catch(function () {
        enviar.disabled = false;
        erro.textContent = "Erro de conexão. Tente de novo.";
      });
    });
  }

  function perguntar(texto) {
    var banco = acharBanco(texto);
    if (banco && banco !== "assunto") {
      falaEu(texto);
      registrar(texto, null);
      setTimeout(function () { responderBanco(banco); }, 450);
      return;
    }
    var achou = buscar(texto);
    // Fala de banco/PIX sem dizer qual e sem resposta pronta: pergunta qual é o banco.
    if (banco === "assunto" && /\b(banco|maquininha|maquina|conta no|conta na)\b/.test(semAcento(texto))) {
      falaEu(texto);
      registrar(texto, null);
      setTimeout(escolherBanco, 450);
      return;
    }
    if (achou.length) {
      responder(achou[0].f, texto, false);
      if (achou.length > 1) {
        setTimeout(function () {
          chips(achou.slice(1, 3).map(function (x) {
            return { texto: "Talvez: " + x.f.pergunta, acao: function () { responder(x.f, x.f.pergunta, true); } };
          }));
        }, 600);
      }
      return;
    }
    falaEu(texto);
    registrar(texto, null);
    setTimeout(function () {
      falaBot("Hmm, essa eu ainda não sei responder 😅 Mas anotei a sua pergunta para aprender!\nQuer que uma pessoa da equipe te responda? A gente responde por e-mail em até " + prazo + ".");
      chips([
        { texto: "Abrir chamado", forte: true, acao: function () { abrirChamado(texto); } },
        { texto: "Ver dúvidas comuns", acao: sugestoesIniciais }
      ]);
    }, 450);
  }

  function abrirChamado(textoInicial) {
    var caixa = el("div", { class: "nv-msg nv-bot" });
    caixa.appendChild(document.createTextNode("Preencha e eu mando para a equipe:"));
    var nome = el("input", { class: "nv-campo", maxlength: "80", placeholder: "Seu nome", autocomplete: "name" });
    var email = el("input", { class: "nv-campo", type: "email", maxlength: "120", placeholder: "Seu e-mail", autocomplete: "email" });
    var msg = el("textarea", { class: "nv-campo", rows: "3", maxlength: "2000", placeholder: "Conte a sua dúvida ou problema" });
    msg.value = textoInicial || "";
    if (usuario) { nome.value = usuario.nome || ""; email.value = usuario.email || ""; }
    var erro = el("div", { class: "nv-erro" });
    var enviar = el("button", { class: "nv-btn", type: "button" }, "Enviar chamado");
    [nome, email, msg, erro, enviar].forEach(function (x) { caixa.appendChild(x); });
    msgs.appendChild(caixa);
    rolar();
    (usuario ? msg : nome).focus();
    enviar.addEventListener("click", function () {
      erro.textContent = "";
      enviar.disabled = true;
      fetch("/api/assistente/chamado", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ nome: nome.value, email: email.value, mensagem: msg.value, pagina: window.location.pathname })
      }).then(function (r) { return r.json().then(function (d) { return { ok: r.ok, d: d }; }); }).then(function (r) {
        enviar.disabled = false;
        if (!r.ok) { erro.textContent = r.d.error || "Não foi possível enviar."; return; }
        caixa.remove();
        falaBot("Pronto! Chamado nº " + r.d.protocolo + " aberto ✅\nVamos responder no e-mail " + email.value.trim() + " em até " + r.d.prazo + ". Mandei uma confirmação para você (olhe também o Spam).");
      }).catch(function () {
        enviar.disabled = false;
        erro.textContent = "Erro de conexão. Tente de novo ou escreva para " + emailSuporte + ".";
      });
    });
  }

  function carregar() {
    if (carregado) return Promise.resolve();
    carregado = true;
    fetch("/api/me").then(function (r) { return r.ok ? r.json() : null; }).then(function (u) { usuario = u; }).catch(function () {});
    var pBancos = fetch("/api/bancos").then(function (r) { return r.json(); }).then(function (d) { bancos = d.bancos || []; }).catch(function () {});
    return Promise.all([pBancos, fetch("/api/assistente/faq").then(function (r) { return r.json(); }).then(function (d) {
      faq = d.faq || [];
      prazo = d.prazo || prazo;
      emailSuporte = d.email || emailSuporte;
    }).catch(function () { faq = []; })]);
  }

  function abrir() {
    aberto = true;
    painel.classList.add("nv-aberto");
    dica.style.display = "none";
    var caixaBoasVindas = document.getElementById("boasVindas");
    if (caixaBoasVindas) caixaBoasVindas.classList.remove("aberto");
    carregar().then(function () {
      if (!msgs.childNodes.length) {
        falaBot("Oi! Eu sou a Nuvem ☁️\nPosso te ajudar com planos, pagamentos, arquivos e o Portal do Cliente. Digite sua dúvida ou toque numa opção:");
        sugestoesIniciais();
      }
      entrada.focus();
    });
  }

  function fecharPainel() {
    aberto = false;
    painel.classList.remove("nv-aberto");
  }

  botao.addEventListener("click", function () { aberto ? fecharPainel() : abrir(); });
  fechar.addEventListener("click", fecharPainel);
  document.addEventListener("keydown", function (e) { if (e.key === "Escape" && aberto) fecharPainel(); });
  form.addEventListener("submit", function (e) {
    e.preventDefault();
    var t = entrada.value.trim();
    if (!t) return;
    entrada.value = "";
    carregar().then(function () { perguntar(t); });
  });

  function montar() {
    document.body.appendChild(painel);
    document.body.appendChild(botao);
  }
  if (document.body) montar(); else document.addEventListener("DOMContentLoaded", montar);
})();
