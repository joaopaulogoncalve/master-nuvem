-- Limite de QUANTAS fotos o cliente pode baixar no álbum (além do limite de vezes por foto, que já existia).
-- Se o fotógrafo quiser, o cliente compra fotos a mais: preço por foto + desconto por quantidade.
-- O pagamento vai direto para o fotógrafo (cobrança da central); quando ele marca como pago, o limite aumenta.
ALTER TABLE albuns ADD COLUMN max_fotos INTEGER;                         -- fotos diferentes que pode baixar; NULL = todas
ALTER TABLE albuns ADD COLUMN fotos_extras INTEGER NOT NULL DEFAULT 0;   -- fotos a mais já pagas (somam ao limite)
ALTER TABLE albuns ADD COLUMN preco_extra_centavos INTEGER;              -- preço de cada foto a mais; NULL = não vende
ALTER TABLE albuns ADD COLUMN faixas_extra TEXT;                         -- desconto: [{"a_partir":10,"preco_centavos":1500}]
ALTER TABLE cobrancas ADD COLUMN fotos_extra INTEGER;                    -- cobrança de fotos a mais: quantas libera ao ser paga

INSERT INTO faq (ordem, pergunta, palavras, resposta) VALUES
(66, 'Posso limitar quantas fotos o cliente baixa e cobrar as fotos a mais?', 'limite de fotos, quantas fotos baixar, fotos extras, foto a mais, cobrar foto extra, pacote de fotos, desconto por quantidade, vender mais fotos',
 'Pode! No álbum, em Regras, marque "Baixar os originais" e escreva até quantas fotos o cliente pode baixar (ex.: 30). Se quiser, coloque o preço de cada foto a mais e um desconto por quantidade (ex.: a partir de 10 fotos, R$ 15 cada). Quando o cliente chegar no limite, ele escolhe quantas fotos a mais quer e recebe a cobrança com o seu PIX ou link. O dinheiro vai direto para você; quando você marcar como pago, as fotos a mais são liberadas na hora.');
