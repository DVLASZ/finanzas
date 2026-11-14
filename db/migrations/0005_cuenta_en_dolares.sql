-- La cuenta en dólares se llamaba ARQ (un nombre propio de quien la creó). Ahora se llama Dólares.
-- Solo toca la fila que todavía se llama ARQ: si ya le pusiste otro nombre, no la cambia.
UPDATE cuentas SET nombre = 'Dólares', clave = 'dolares' WHERE id = 'arq' AND nombre = 'ARQ';
