-- Migration number: 0009 	 Cupom de preço (ex.: 1 GB por R$ 1,00 para testar o PIX) e valor guardado no pedido
-- Cupom com preco_centavos: em vez de liberar teste grátis, leva ao pagamento do plano de quota_mb por esse preço.
-- so_user_id: cupom que só uma conta pode usar (NULL = qualquer conta).

ALTER TABLE cupons ADD COLUMN preco_centavos INTEGER;
ALTER TABLE cupons ADD COLUMN so_user_id INTEGER;

-- Valor cobrado no pedido. O webhook confere o pagamento contra ele (antes era sempre o preço da calculadora).
ALTER TABLE subscriptions ADD COLUMN valor_centavos INTEGER;
