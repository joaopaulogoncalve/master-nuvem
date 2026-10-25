-- Aumentar espaço no meio do plano: o pedido guarda até quando vale o plano atual. Quando o pagamento aprova, o plano
-- passa para o tamanho maior SEM mudar a data de vencimento (o cliente paga só os dias que faltam).
ALTER TABLE subscriptions ADD COLUMN aumento_ate TEXT;

INSERT INTO faq (ordem, pergunta, palavras, resposta) VALUES
(65, 'Posso aumentar o espaço só por um tempo?', 'aumentar espaco, mais espaco, so por um tempo, temporario, proporcional, dias que faltam, diminuir depois, upgrade, mais gb',
 'Pode! No [Painel](/painel), clique em Renovar ou aumentar, escolha um tamanho maior e marque "Aumentar agora". Você paga só pelos dias que faltam do seu plano (mínimo de R$ 2,00) e o espaço aumenta na hora, sem mudar o vencimento. Quando vencer, renove no tamanho que quiser, inclusive menor. Sem multa e sem fidelidade.');
