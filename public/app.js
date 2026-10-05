
var TEXTO_BOTAO = "Contratar Agora via PIX/Cartão";

function calcularPreco(gb) {
  var valor;
  if (gb <= 10) {
    valor = 10.50;
  } else if (gb <= 100) {
    valor = 10.50 + (gb - 10) * 0.42;
  } else if (gb <= 500) {
    valor = 48.30 + (gb - 100) * 0.26;
  } else {
    valor = 152.30 + (gb - 500) * 0.16;
  }
  return Math.round(valor * 100) / 100;
}

function formatarEspaco(gb) {
  return gb >= 1000 ? (gb / 1000).toFixed(1) + " TB" : gb + " GB";
}

function atualizar() {
  var slider = document.getElementById("gbSlider");
  var gbDisplay = document.getElementById("gbDisplay");
  var priceDisplay = document.getElementById("priceDisplay");
  if (!slider || !gbDisplay || !priceDisplay) return;

  var gb = parseInt(slider.value, 10);
  gbDisplay.textContent = formatarEspaco(gb);
  priceDisplay.textContent = calcularPreco(gb).toFixed(2).replace(".", ",");
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
