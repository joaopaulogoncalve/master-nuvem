function calcularPreco(gb) {
  var valor;
  if (gb <= 1000) {
    valor = 5 + gb * 0.054;
  } else {
    valor = 59 + (gb - 1000) * 0.06;
  }
  if (valor < 9.90) valor = 9.90;
  return Math.round(valor * 100) / 100;
}

function formatarEspaco(gb) {
  if (gb < 1) return Math.round(gb * 1000) + " MB";
  if (gb >= 1000) return String(+(gb / 1000).toFixed(2)) + " TB";
  return gb + " GB";
}

function atualizar() {
  var slider = document.getElementById("gbSlider");
  var gbDisplay = document.getElementById("gbDisplay");
  var priceDisplay = document.getElementById("priceDisplay");
  if (!slider || !gbDisplay || !priceDisplay) return;

  var gb = parseInt(slider.value, 10);
  var min = parseInt(slider.min, 10);
  var max = parseInt(slider.max, 10);
  slider.style.setProperty("--p", ((gb - min) / (max - min) * 100) + "%");

  gbDisplay.textContent = formatarEspaco(gb);
  priceDisplay.textContent = calcularPreco(gb).toFixed(2).replace(".", ",");

  document.querySelectorAll("[data-gb]").forEach(function (chip) {
    var ativo = parseInt(chip.getAttribute("data-gb"), 10) === gb;
    chip.classList.toggle("chip-on", ativo);
  });
}

// metodo "pix" = QR code na própria Master Nuvem (tela do painel); "cartao" = Checkout do Mercado Pago.
async function processarPagamento(metodo) {
  var btn = document.getElementById(metodo === "cartao" ? "cartaoBtn" : "checkoutBtn");
  var slider = document.getElementById("gbSlider");
  var gb = parseInt(slider.value, 10);

  // Página inicial: o pagamento acontece no painel (lá tem a tela do PIX), passando pelo login se precisar.
  if (!window.mostrarPix) {
    window.location.href = "/painel?gb=" + gb + "&contratar=1";
    return;
  }

  var textoAntes = btn.textContent;
  btn.textContent = metodo === "cartao" ? "Conectando ao Mercado Pago..." : "Gerando o PIX...";
  btn.disabled = true;

  try {
    var resp = await fetch("/api/checkout", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ gb: gb, metodo: metodo, modo: window.modoPagamento || "" })
    });
    var data = await resp.json();
    if (resp.status === 401 && data.login) {
      window.location.href = "/entrar?volta=" + encodeURIComponent("/painel?gb=" + gb + "&contratar=1");
      return;
    }
    if (data.pix) {
      window.mostrarPix(data.pix);
    } else if (data.init_point) {
      window.location.href = data.init_point;
      return;
    } else {
      throw new Error(data.error || "Resposta sem pagamento");
    }
  } catch (erro) {
    console.error("Erro no pagamento:", erro);
    avisar(erro.message && erro.message.indexOf("PIX") > -1 ? erro.message : "Não foi possível iniciar o pagamento. Tente novamente em instantes.");
  }
  btn.textContent = textoAntes;
  btn.disabled = false;
}

function iniciar() {
  document.querySelectorAll("[data-preco]").forEach(function (el) {
    el.textContent = calcularPreco(parseInt(el.getAttribute("data-preco"), 10)).toFixed(2).replace(".", ",");
  });
  var slider = document.getElementById("gbSlider");
  var btn = document.getElementById("checkoutBtn");

  if (slider) {
    var gbUrl = parseInt(new URLSearchParams(window.location.search).get("gb"), 10);
    if (gbUrl >= parseInt(slider.min, 10) && gbUrl <= parseInt(slider.max, 10)) slider.value = gbUrl;
    slider.addEventListener("input", atualizar);
    slider.addEventListener("change", atualizar);
  }
  document.querySelectorAll("[data-gb]").forEach(function (chip) {
    chip.addEventListener("click", function () {
      slider.value = chip.getAttribute("data-gb");
      atualizar();
    });
  });
  if (btn) {
    btn.addEventListener("click", function () { processarPagamento("pix"); });
  }
  var cartao = document.getElementById("cartaoBtn");
  if (cartao) {
    cartao.addEventListener("click", function () { processarPagamento("cartao"); });
  }
  atualizar();

  // Quem já está logado vê "Meu painel" no lugar de "Entrar".
  var linkConta = document.getElementById("linkConta");
  if (linkConta) {
    fetch("/api/me").then(function (r) {
      if (r.ok) {
        linkConta.textContent = "Meu painel";
        linkConta.href = "/painel";
      }
    }).catch(function () {});
  }
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", iniciar);
} else {
  iniciar();
}
