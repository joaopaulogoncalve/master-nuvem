var TEXTO_BOTAO = "Contratar Agora via PIX/Cartão";

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

async function processarPagamento() {
  var btn = document.getElementById("checkoutBtn");
  var slider = document.getElementById("gbSlider");
  var gb = parseInt(slider.value, 10);

  btn.textContent = "Conectando ao Mercado Pago...";
  btn.disabled = true;

  try {
    var resp = await fetch("/api/checkout", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ gb: gb })
    });
    var data = await resp.json();
    if (data.init_point) {
      window.location.href = data.init_point;
      return;
    }
    throw new Error(data.error || "Resposta sem link de pagamento");
  } catch (erro) {
    console.error("Erro no Checkout:", erro);
    alert("Não foi possível iniciar o pagamento. Tente novamente em instantes.");
    btn.textContent = TEXTO_BOTAO;
    btn.disabled = false;
  }
}

function iniciar() {
  var slider = document.getElementById("gbSlider");
  var btn = document.getElementById("checkoutBtn");

  if (slider) {
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
    btn.addEventListener("click", processarPagamento);
  }
  atualizar();
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", iniciar);
} else {
  iniciar();
}
