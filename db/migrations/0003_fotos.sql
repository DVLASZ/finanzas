-- Fotos de recibos. Una por movimiento, reducida en la app antes de subirla (unos 100 KB).
-- No viaja en la sincronización normal ni en el respaldo: se pide aparte, solo cuando se abre el movimiento.
CREATE TABLE fotos (
  movimiento_id TEXT PRIMARY KEY,
  datos         TEXT NOT NULL,           -- JPEG en base64
  subida_en     TEXT NOT NULL DEFAULT (datetime('now','-5 hours'))
);
