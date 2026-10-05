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

function resposta(obj, status) {
  return new Response(JSON.stringify(obj), {
    status: status,
    headers: { "Content-Type": "application/json" }
  });
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    if (url.pathname !== "/api/checkout") {
      return env.ASSETS.fetch(request);
    }

    if (request.method !== "POST") {
      return resposta({ error: "Método não permitido" }, 405);
    }

    if (!env.MP_ACCESS_TOKEN) {
      console.error("MP_ACCESS_TOKEN não configurado");
      return resposta({ error: "Configuração ausente" }, 500);
    }

    let corpo;
    try {
      corpo = await request.json();
    } catch (e) {
      return resposta({ error: "JSON inválido" }, 400);
    }

    const gb = parseInt(corpo.gb, 10);
    if (!gb || gb < 1 || gb > 2000) {
      return resposta({ error: "Quantidade inválida" }, 400);
    }

    const nome = gb >= 1000 ? (gb / 1000).toFixed(1) + "TB" : gb + "GB";

    try {
      const mp = await fetch("https://api.mercadopago.com/checkout/preferences", {
        method: "POST",
        headers: {
          "Authorization": "Bearer " + env.MP_ACCESS_TOKEN,
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          items: [{
            title: "Master Nuvem - " + nome + " Armazenamento",
            quantity: 1,
            currency_id: "BRL",
            unit_price: calcularPreco(gb)
          }],
          back_urls: {
            success: url.origin + "/?status=ok",
            failure: url.origin + "/?status=erro",
            pending: url.origin + "/?status=pendente"
          },
          auto_return: "approved"
        })
      });

      const dados = await mp.json();
      if (!dados.init_point) {
        console.error("Mercado Pago recusou:", JSON.stringify(dados));
        return resposta({ error: "Falha ao criar pagamento" }, 502);
      }
      return resposta({ init_point: dados.init_point }, 200);
    } catch (e) {
      console.error("Erro ao chamar Mercado Pago:", e.message);
      return resposta({ error: "Falha ao criar pagamento" }, 502);
    }
  }
};
