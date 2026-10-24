-- Migration number: 0004 	 Avisos de vencimento já enviados (evita mandar o mesmo e-mail duas vezes)
-- tipo: 'vence' (3 dias antes), 'venceu' (no dia), 'ultimo' (3 dias antes de apagar os arquivos)

CREATE TABLE IF NOT EXISTS avisos (
  sub_id INTEGER NOT NULL,
  tipo TEXT NOT NULL,
  enviado_em TEXT NOT NULL DEFAULT (datetime('now')),
  PRIMARY KEY (sub_id, tipo),
  FOREIGN KEY (sub_id) REFERENCES subscriptions(id)
);
