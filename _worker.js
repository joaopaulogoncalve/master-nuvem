export default {
    async fetch(request, env) {
        if (request.method === "OPTIONS") {
            return new Response(null, {
                headers: {
                    "Access-Control-Allow-Origin": "*",
                    "Access-Control-Allow-Methods": "POST, OPTIONS",
                    "Access-Control-Allow-Headers": "Content-Type",
                },
            });
        }

        if (request.method === "POST") {
            try {
                const data = await request.json();
                const ACCESS_TOKEN = "APP_USR-3978220072394763-100215-7316e2a9a858f0d112930fb0c10a892a-3734837516";

                const response = await fetch("https://api.mercadopago.com/checkout/preferences", {
                    method: "POST",
                    headers: {
                        "Authorization": "Bearer " + ACCESS_TOKEN,
                        "Content-Type": "application/json"
                    },
                    body: JSON.stringify({
                        items: [
                            {
                                title: data.planoNome,
                                quantity: 1,
                                currency_id: "BRL",
                                unit_price: data.valorNumerico
                            }
                        ],
                        back_urls: {
                            success: request.headers.get("origin") || "https://master-nuvem.paulojoao151.workers.dev",
                            failure: request.headers.get("origin") || "https://master-nuvem.paulojoao151.workers.dev",
                            pending: request.headers.get("origin") || "https://master-nuvem.paulojoao151.workers.dev"
                        },
                        auto_return: "approved"
                    })
                });

                const preference = await response.json();

                return new Response(JSON.stringify(preference), {
                    headers: {
                        "Content-Type": "application/json",
                        "Access-Control-Allow-Origin": "*"
                    }
                });
            } catch (error) {
                return new Response(JSON.stringify({ error: error.message }), {
                    status: 500,
                    headers: {
                        "Content-Type": "application/json",
                        "Access-Control-Allow-Origin": "*"
                    }
                });
            }
        }

        return new Response("Método não permitido", { status: 405 });
    }
};
