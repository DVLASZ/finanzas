-- Datos iniciales: cuentas, categorías y atajos.

INSERT INTO cuentas (id, nombre, clave, tipo, moneda, en_disponible) VALUES
  ('efectivo',  'Efectivo',  'efectivo',  'dinero', 'COP', 1),
  ('monedas',   'Monedas',   'monedas',   'dinero', 'COP', 0),
  ('nequi',     'Nequi',     'nequi',     'dinero', 'COP', 1),
  ('daviplata', 'Daviplata', 'daviplata', 'dinero', 'COP', 1),
  ('arq',       'ARQ',       'arq',       'dinero', 'USD', 1);

INSERT INTO cuentas (id, nombre, clave, tipo, fijo) VALUES
  ('cat:mecato',        'Mecato',        'mecato',        'categoria', 0),
  ('cat:comida',        'Comida',        'comida',        'categoria', 0),
  ('cat:transporte',    'Transporte',    'transporte',    'categoria', 0),
  ('cat:viaje-semanal', 'Viaje semanal', 'viaje semanal', 'categoria', 1),
  ('cat:recargas',      'Recargas',      'recargas',      'categoria', 0),
  ('cat:banco',         'Costos del banco', 'costos del banco', 'categoria', 0),
  ('cat:juegos',        'Juegos',        'juegos',        'categoria', 0),
  ('cat:suscripciones', 'Suscripciones', 'suscripciones', 'categoria', 0),
  ('cat:salidas',       'Salidas',       'salidas',       'categoria', 0),
  ('cat:universidad',   'Universidad',   'universidad',   'categoria', 0),
  ('cat:personal',      'Personal',      'personal',      'categoria', 0),
  ('cat:compras',       'Compras',       'compras',       'categoria', 0),
  ('cat:regalos',       'Regalos',       'regalos',       'categoria', 0),
  ('cat:salud',         'Salud',         'salud',         'categoria', 0),
  ('cat:reparaciones',  'Reparaciones',  'reparaciones',  'categoria', 0),
  ('cat:otros',         'Otros',         'otros',         'categoria', 0),
  ('cat:descuadre',     'Descuadre',     'descuadre',     'categoria', 0);

INSERT INTO cuentas (id, nombre, clave, tipo, moneda) VALUES
  ('sys:apertura',    'Apertura',        'apertura',        'sistema', 'COP'),
  ('sys:cambio-cop',  'Cambio de moneda COP', 'cambio cop', 'sistema', 'COP'),
  ('sys:cambio-usd',  'Cambio de moneda USD', 'cambio usd', 'sistema', 'USD');

INSERT INTO atajos (palabra, concepto, monto, moneda, categoria_id, cuenta_id) VALUES
  ('pasaje', 'Pasaje Terminal', 7000, 'COP', 'cat:viaje-semanal', 'efectivo');

-- Mecato es el "gasto hormiga": el tope se fija cuando quieras (p.ej. 60000).
INSERT INTO config (clave, valor) VALUES
  ('fecha_apertura', '2000-01-01 00:00:00'),
  ('moneda_base', 'COP'),
  ('meta_ahorro_pct', '30');
