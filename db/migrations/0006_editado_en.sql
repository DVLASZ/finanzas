-- Marca de cuándo se editó un movimiento ya guardado (NULL = nunca se editó).
ALTER TABLE movimientos ADD COLUMN editado_en TEXT;
