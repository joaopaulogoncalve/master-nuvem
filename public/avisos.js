// Avisos e perguntas dentro da própria página, no lugar das janelinhas do navegador (alert, confirm, prompt).
// O Firefox e o Chrome bloqueiam essas janelas depois de algumas seguidas, e no celular elas ficam feias.
(function () {
  function caixaBase(titulo, texto) {
    var fundo = document.createElement("div");
    fundo.style.cssText = "position:fixed;inset:0;background:rgba(2,6,23,.8);display:flex;align-items:center;justify-content:center;padding:16px;z-index:2147483600";
    var caixa = document.createElement("div");
    caixa.setAttribute("role", "dialog");
    caixa.style.cssText = "background:linear-gradient(160deg,#0c1a3d,#07102a);border:1px solid #1e40af88;border-radius:24px;padding:24px;max-width:440px;width:100%;color:#fff;font-family:inherit;box-shadow:0 0 50px #38bdf822";
    if (titulo) {
      var t = document.createElement("p");
      t.style.cssText = "font-size:1.1rem;font-weight:700;margin:0 0 10px";
      t.textContent = titulo;
      caixa.appendChild(t);
    }
    if (texto) {
      var p = document.createElement("p");
      p.style.cssText = "font-size:.9rem;color:#cbd5e1;white-space:pre-line;margin:0 0 16px;line-height:1.5;word-break:break-word";
      p.textContent = texto;
      caixa.appendChild(p);
    }
    fundo.appendChild(caixa);
    document.body.appendChild(fundo);
    return { fundo: fundo, caixa: caixa };
  }

  function botao(texto, cor) {
    var b = document.createElement("button");
    b.type = "button";
    b.textContent = texto;
    b.style.cssText = "padding:10px 18px;border-radius:12px;font-weight:700;cursor:pointer;font-size:.9rem;" +
      (cor ? "background:" + cor + ";color:#fff;border:0" : "background:transparent;color:#fff;border:1px solid #475569");
    return b;
  }

  function linhaBotoes(caixa) {
    var d = document.createElement("div");
    d.style.cssText = "display:flex;gap:10px;justify-content:flex-end;flex-wrap:wrap";
    caixa.appendChild(d);
    return d;
  }

  // avisar("texto") ou avisar("texto", "Título"): só um botão OK.
  window.avisar = function (texto, titulo) {
    return new Promise(function (ok) {
      var c = caixaBase(titulo || "Aviso", String(texto || ""));
      var b = botao("OK", "#0284c7");
      linhaBotoes(c.caixa).appendChild(b);
      function fim() { c.fundo.remove(); document.removeEventListener("keydown", tecla); ok(); }
      function tecla(e) { if (e.key === "Enter" || e.key === "Escape") { e.preventDefault(); fim(); } }
      b.addEventListener("click", fim);
      c.fundo.addEventListener("click", function (e) { if (e.target === c.fundo) fim(); });
      document.addEventListener("keydown", tecla);
      b.focus();
    });
  };

  // await confirmar("Título", "texto", "Sim, apagar") → true/false. perigo=false deixa o botão azul.
  window.confirmar = function (titulo, texto, botaoSim, perigo) {
    return new Promise(function (ok) {
      var c = caixaBase(titulo, texto);
      var linha = linhaBotoes(c.caixa);
      var nao = botao("Não"), sim = botao(botaoSim || "Sim", perigo === false ? "#0284c7" : "#dc2626");
      linha.appendChild(nao); linha.appendChild(sim);
      function fim(r) { c.fundo.remove(); document.removeEventListener("keydown", tecla); ok(r); }
      function tecla(e) { if (e.key === "Escape") fim(false); }
      nao.addEventListener("click", function () { fim(false); });
      sim.addEventListener("click", function () { fim(true); });
      c.fundo.addEventListener("click", function (e) { if (e.target === c.fundo) fim(false); });
      document.addEventListener("keydown", tecla);
      sim.focus();
    });
  };

  // await pedirTexto("Título", "texto", "valor inicial") → o texto digitado, ou null se cancelar.
  window.pedirTexto = function (titulo, texto, valor) {
    return new Promise(function (ok) {
      var c = caixaBase(titulo, texto);
      var campo = document.createElement("input");
      campo.value = valor || "";
      campo.style.cssText = "width:100%;box-sizing:border-box;padding:10px 12px;border-radius:12px;border:1px solid #334155;background:#020617;color:#fff;margin-bottom:16px;font-size:1rem";
      c.caixa.appendChild(campo);
      var linha = linhaBotoes(c.caixa);
      var nao = botao("Cancelar"), sim = botao("OK", "#0284c7");
      linha.appendChild(nao); linha.appendChild(sim);
      function fim(r) { c.fundo.remove(); ok(r); }
      nao.addEventListener("click", function () { fim(null); });
      sim.addEventListener("click", function () { fim(campo.value); });
      campo.addEventListener("keydown", function (e) { if (e.key === "Enter") fim(campo.value); if (e.key === "Escape") fim(null); });
      campo.focus();
      campo.select();
    });
  };

  // Tela de "Pronto!" com dados para copiar e um botão de WhatsApp. linhas = [["Link", "https://..."], ...]
  window.avisoCopiar = function (titulo, texto, linhas, mensagemWhats) {
    return new Promise(function (ok) {
      var c = caixaBase(titulo, texto);
      linhas.forEach(function (l) {
        var d = document.createElement("div");
        d.style.cssText = "display:flex;gap:8px;align-items:center;background:#02061799;border-radius:12px;padding:8px 10px;margin-bottom:8px";
        var s = document.createElement("div");
        s.style.cssText = "flex:1;min-width:0;font-size:.85rem";
        s.innerHTML = "<span style='color:#94a3b8;font-size:.75rem;display:block'></span><span style='word-break:break-all'></span>";
        s.children[0].textContent = l[0];
        s.children[1].textContent = l[1];
        var b = botao("Copiar");
        b.style.padding = "6px 10px";
        b.addEventListener("click", function () {
          (navigator.clipboard ? navigator.clipboard.writeText(l[1]) : Promise.reject()).then(function () { b.textContent = "Copiado ✓"; }, function () { b.textContent = "Selecione e copie"; });
        });
        d.appendChild(s); d.appendChild(b);
        c.caixa.appendChild(d);
      });
      var linha = linhaBotoes(c.caixa);
      linha.style.marginTop = "12px";
      if (mensagemWhats) {
        var w = document.createElement("a");
        w.href = "https://wa.me/?text=" + encodeURIComponent(mensagemWhats);
        w.target = "_blank";
        w.rel = "noopener";
        w.textContent = "Enviar no WhatsApp";
        w.style.cssText = "padding:10px 18px;border-radius:12px;font-weight:700;background:#16a34a;color:#fff;text-decoration:none;font-size:.9rem";
        linha.appendChild(w);
      }
      var fechar = botao("OK", "#0284c7");
      linha.appendChild(fechar);
      fechar.addEventListener("click", function () { c.fundo.remove(); ok(); });
    });
  };
})();
