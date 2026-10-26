-- Lixeira: remover álbum, cliente ou evento some na hora (o cliente/comprador perde o acesso), mas o fotógrafo tem
-- 30 minutos para desfazer. Depois disso o robô (Cron de 20 em 20 minutos) apaga as fotos do Backblaze e os registros.
ALTER TABLE albuns ADD COLUMN removido_em TEXT;
ALTER TABLE eventos ADD COLUMN removido_em TEXT;
ALTER TABLE portal_clientes ADD COLUMN removido_em TEXT;
