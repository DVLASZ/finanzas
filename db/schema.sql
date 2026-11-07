-- Esquema de la base de datos (SQLite / Cloudflare D1)
--
-- Idea central: todo movimiento mueve plata entre "cuentas" y sus asientos suman 0
-- (por moneda). Una cuenta puede ser tu dinero (efectivo, nequi...), una persona,
-- una categoría de gasto, una fuente de ingreso o una cuenta de sistema.
--
--   gasto          dinero -X            categoria +X
--   ingreso        fuente -X            dinero +X
--   transferencia  dinero -X            dinero +X
--   prestamo       dinero -X            persona +X   (persona + => te debe)
--   deuda          persona -X           dinero +X    (persona - => le debes)
--   compartido     dinero -X            categoria +tu parte, persona +su parte ...
--   apertura       sys:apertura -X      dinero +X    (saldo inicial, NO es ingreso)
--   ajuste         dinero -/+X          cat:descuadre +/-X (arqueo)
--   cambio_moneda  dinero COP -X, sys:cambio-cop +X, sys:cambio-usd -Y, dinero USD +Y
--
-- Montos: enteros en la unidad mínima de la moneda (COP = pesos, USD = centavos).
-- Fechas: hora local de Colombia (UTC-5, sin horario de verano) 'YYYY-MM-DD HH:MM:SS'.

CREATE TABLE cuentas (
  id            TEXT PRIMARY KEY,                -- p.ej. 'efectivo', 'cat:mecato', 'per:juan-manuel'
  nombre        TEXT NOT NULL,                   -- como lo escribes: 'Juan Manuel'
  clave         TEXT NOT NULL,                   -- minúsculas sin tildes, para buscar
  tipo          TEXT NOT NULL CHECK (tipo IN ('dinero','persona','categoria','fuente','sistema')),
  moneda        TEXT NOT NULL DEFAULT 'COP',
  grupo         TEXT,                            -- personas: 'amigos' | 'familia' | 'otros'
  fijo          INTEGER NOT NULL DEFAULT 0,      -- categorías fijas (Viaje semanal)
  en_disponible INTEGER NOT NULL DEFAULT 1,      -- 0 = no cuenta como plata disponible (monedas)
  activa        INTEGER NOT NULL DEFAULT 1,
  creada_en     TEXT NOT NULL DEFAULT (datetime('now','-5 hours')),
  UNIQUE (tipo, clave)
);

CREATE TABLE compromisos (            -- deudas que debes y préstamos que te deben
  id           TEXT PRIMARY KEY,
  persona_id   TEXT NOT NULL REFERENCES cuentas(id),
  direccion    TEXT NOT NULL CHECK (direccion IN ('debo','me_deben')),
  monto        INTEGER NOT NULL,                 -- monto original, en la moneda indicada
  moneda       TEXT NOT NULL DEFAULT 'COP',
  motivo       TEXT,
  fecha_limite TEXT,                             -- 'YYYY-MM-DD' o NULL
  estado       TEXT NOT NULL DEFAULT 'activa' CHECK (estado IN ('activa','saldada','anulada')),
  creado_en    TEXT NOT NULL DEFAULT (datetime('now','-5 hours'))
);

CREATE TABLE movimientos (
  id               TEXT PRIMARY KEY,             -- uuid (o 'xl:...' si viene del Excel)
  ocurrido_en      TEXT NOT NULL,
  sin_hora         INTEGER NOT NULL DEFAULT 0,   -- 1 = solo se conoce el día (importados)
  tipo             TEXT NOT NULL CHECK (tipo IN
                     ('gasto','ingreso','transferencia','prestamo','deuda','pago',
                      'compartido','apertura','ajuste','cambio_moneda')),
  descripcion      TEXT,
  etiqueta         TEXT,                         -- evento: 'cumple-daniel'
  lugar_desde      TEXT,                         -- transporte: de dónde saliste
  lugar_hasta      TEXT,                         -- transporte: a dónde llegaste
  nota             TEXT,
  origen           TEXT NOT NULL DEFAULT 'bot' CHECK (origen IN ('bot','app','excel')),
  mensaje_original TEXT,                         -- lo que escribiste, tal cual
  propuesta        TEXT,                         -- la tarjeta confirmada (JSON), para poder editar
  compromiso_id    TEXT REFERENCES compromisos(id),
  estado           TEXT NOT NULL DEFAULT 'ok' CHECK (estado IN ('ok','anulado')),
  anulado_en       TEXT,
  ref_importacion  TEXT UNIQUE,                  -- 'FEB!F5': evita importar dos veces
  creado_en        TEXT NOT NULL DEFAULT (datetime('now','-5 hours')),
  actualizado_en   TEXT NOT NULL DEFAULT (datetime('now','-5 hours')),
  cambio_en        TEXT                          -- hora del servidor del último cambio (sincronización parcial)
);
CREATE INDEX idx_mov_fecha    ON movimientos (ocurrido_en);
CREATE INDEX idx_mov_etiqueta ON movimientos (etiqueta);
CREATE INDEX idx_mov_cambio   ON movimientos (cambio_en);

CREATE TABLE asientos (
  id             INTEGER PRIMARY KEY AUTOINCREMENT,
  movimiento_id  TEXT NOT NULL REFERENCES movimientos(id) ON DELETE CASCADE,
  cuenta_id      TEXT NOT NULL REFERENCES cuentas(id),
  monto          INTEGER NOT NULL,               -- con signo
  moneda         TEXT NOT NULL DEFAULT 'COP'
);
CREATE INDEX idx_asi_mov    ON asientos (movimiento_id);
CREATE INDEX idx_asi_cuenta ON asientos (cuenta_id);

CREATE TABLE atajos (                 -- 'pasaje' => 7000 en Viaje semanal
  palabra      TEXT PRIMARY KEY,
  concepto     TEXT NOT NULL,
  monto        INTEGER,
  moneda       TEXT NOT NULL DEFAULT 'COP',
  categoria_id TEXT REFERENCES cuentas(id),
  cuenta_id    TEXT REFERENCES cuentas(id)
);

CREATE TABLE aprendido (              -- palabras que el bot aprendió de ti
  palabra      TEXT PRIMARY KEY,        -- clave normalizada
  categoria_id TEXT REFERENCES cuentas(id),
  cuenta_id    TEXT REFERENCES cuentas(id)
);

CREATE TABLE presupuestos (           -- tope mensual por categoría (p.ej. Mecato)
  categoria_id TEXT PRIMARY KEY REFERENCES cuentas(id),
  monto        INTEGER NOT NULL
);

CREATE TABLE config (
  clave TEXT PRIMARY KEY,
  valor TEXT NOT NULL
);

CREATE TABLE pendiente (              -- conversación en curso (tarjeta sin confirmar); una sola fila
  id             INTEGER PRIMARY KEY CHECK (id = 1),
  json           TEXT NOT NULL,
  actualizado_en TEXT NOT NULL DEFAULT (datetime('now','-5 hours'))
);

CREATE TABLE fotos (
  movimiento_id TEXT PRIMARY KEY,
  datos         TEXT NOT NULL,           -- JPEG en base64
  subida_en     TEXT NOT NULL DEFAULT (datetime('now','-5 hours'))
);

-- Los saldos solo cuentan desde la fecha de apertura: lo anterior (Excel) es historial.
CREATE VIEW v_saldos AS
SELECT a.cuenta_id, a.moneda, SUM(a.monto) AS saldo
FROM asientos a
JOIN movimientos m ON m.id = a.movimiento_id
WHERE m.estado = 'ok'
  AND m.ocurrido_en >= (SELECT valor FROM config WHERE clave = 'fecha_apertura')
GROUP BY a.cuenta_id, a.moneda;

-- Gasto por mes y categoría (todo el historial).
CREATE VIEW v_gasto_mensual AS
SELECT substr(m.ocurrido_en, 1, 7) AS mes, c.id AS categoria_id, c.nombre AS categoria,
       a.moneda, SUM(a.monto) AS total
FROM asientos a
JOIN movimientos m ON m.id = a.movimiento_id
JOIN cuentas c     ON c.id = a.cuenta_id
WHERE m.estado = 'ok' AND c.tipo = 'categoria'
GROUP BY mes, c.id, a.moneda;

-- Control de calidad: debe estar siempre vacía.
CREATE VIEW v_movimientos_desbalanceados AS
SELECT movimiento_id, moneda, SUM(monto) AS diferencia
FROM asientos
GROUP BY movimiento_id, moneda
HAVING SUM(monto) <> 0;
