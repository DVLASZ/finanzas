-- Sincronización parcial: cada vez que un movimiento se guarda o se anula en el servidor queda marcado con
-- la hora del servidor. Así una app que ya tiene todo solo pide lo que cambió desde la última vez.
ALTER TABLE movimientos ADD COLUMN cambio_en TEXT;
UPDATE movimientos SET cambio_en = actualizado_en;
CREATE INDEX idx_mov_cambio ON movimientos (cambio_en);
