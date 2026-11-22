-- Las claves de las cuentas se guardaban con tilde («dólares», «alcancía», «impuestos y trámites») y las consultas
-- por nombre, que comparan sin tildes, no las encontraban. Esta migración las reescribe sin tildes.
-- Si dos cuentas del mismo tipo quedaran con la misma clave, se queda la más antigua y la otra recibe el sufijo «-2».
-- Se puede correr más de una vez: lo que ya está sin tildes no se toca.
UPDATE cuentas SET clave = CASE
  WHEN EXISTS (
    SELECT 1 FROM cuentas b
    WHERE b.id <> cuentas.id AND b.tipo = cuentas.tipo AND REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(b.clave, 'á', 'a'), 'é', 'e'), 'í', 'i'), 'ó', 'o'), 'ú', 'u'), 'ü', 'u'), 'ñ', 'n') = REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(cuentas.clave, 'á', 'a'), 'é', 'e'), 'í', 'i'), 'ó', 'o'), 'ú', 'u'), 'ü', 'u'), 'ñ', 'n')
      AND (b.clave = REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(b.clave, 'á', 'a'), 'é', 'e'), 'í', 'i'), 'ó', 'o'), 'ú', 'u'), 'ü', 'u'), 'ñ', 'n') OR b.creada_en < cuentas.creada_en OR (b.creada_en = cuentas.creada_en AND b.id < cuentas.id))
  ) THEN REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(clave, 'á', 'a'), 'é', 'e'), 'í', 'i'), 'ó', 'o'), 'ú', 'u'), 'ü', 'u'), 'ñ', 'n') || '-2'
  ELSE REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(clave, 'á', 'a'), 'é', 'e'), 'í', 'i'), 'ó', 'o'), 'ú', 'u'), 'ü', 'u'), 'ñ', 'n')
END
WHERE clave <> REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(clave, 'á', 'a'), 'é', 'e'), 'í', 'i'), 'ó', 'o'), 'ú', 'u'), 'ü', 'u'), 'ñ', 'n');
