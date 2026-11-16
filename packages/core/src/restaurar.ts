/**
 * Restaurar un respaldo: de los datos que guarda la copia de seguridad a un SQL que se corre en una
 * base D1 nueva (con `db/schema.sql` ya aplicado y sin semilla). Lo usa `npm run restaurar` y una
 * prueba que comprueba que lo restaurado es idéntico a lo que se respaldó.
 */
import type { Datos } from './repo.ts';

const q = (v: string | number | boolean | null | undefined): string =>
  v === null || v === undefined ? 'NULL' : typeof v === 'number' ? String(v) : typeof v === 'boolean' ? (v ? '1' : '0') : `'${String(v).replaceAll("'", "''")}'`;

export function sqlDeRespaldo(d: Datos): string {
  const l: string[] = ['-- Restauración de un respaldo. Correr en una base nueva con db/schema.sql aplicado y sin semilla.', 'PRAGMA foreign_keys = OFF;'];
  for (const c of d.cuentas) {
    l.push(`INSERT OR REPLACE INTO cuentas (id, nombre, clave, tipo, moneda, grupo, fijo, en_disponible) VALUES (${[
      q(c.id), q(c.nombre), q(c.clave), q(c.tipo), q(c.moneda ?? 'COP'), q(c.grupo ?? null), c.fijo ? 1 : 0, c.enDisponible === false ? 0 : 1,
    ].join(', ')});`);
  }
  for (const c of d.compromisos) {
    l.push(`INSERT OR REPLACE INTO compromisos (id, persona_id, direccion, monto, moneda, motivo, fecha_limite, estado, creado_en) VALUES (${[
      q(c.id), q(c.personaId), q(c.direccion), c.monto, q(c.moneda), q(c.motivo ?? null), q(c.fechaLimite ?? null), q(c.estado), q(c.creadoEn),
    ].join(', ')});`);
  }
  for (const m of d.movimientos) {
    l.push(`INSERT OR REPLACE INTO movimientos (id, ocurrido_en, sin_hora, tipo, descripcion, etiqueta, nota, lugar_desde, lugar_hasta, origen, mensaje_original, propuesta, compromiso_id, estado, anulado_en, creado_en, actualizado_en, cambio_en, editado_en) VALUES (${[
      q(m.id), q(m.ocurridoEn), m.sinHora ? 1 : 0, q(m.tipo), q(m.descripcion), q(m.etiqueta ?? null), q(m.nota ?? null),
      q(m.lugarDesde ?? null), q(m.lugarHasta ?? null), q(m.origen), q(m.mensajeOriginal ?? null),
      q(m.propuesta ? JSON.stringify(m.propuesta) : null), q(m.compromisoId ?? null), q(m.estado), q(m.anuladoEn ?? null), q(m.creadoEn), q(m.creadoEn), q(m.creadoEn), q(m.editadoEn ?? null),
    ].join(', ')});`);
    for (const a of m.asientos) l.push(`INSERT INTO asientos (movimiento_id, cuenta_id, monto, moneda) VALUES (${q(m.id)}, ${q(a.cuentaId)}, ${a.monto}, ${q(a.moneda)});`);
  }
  for (const a of d.atajos) {
    l.push(`INSERT OR REPLACE INTO atajos (palabra, concepto, monto, moneda, categoria_id, cuenta_id) VALUES (${[
      q(a.palabra), q(a.concepto), a.monto ?? null, q(a.moneda), q(a.categoriaId ?? null), q(a.cuentaId ?? null),
    ].join(', ')});`);
  }
  for (const [palabra, a] of Object.entries(d.aprendido)) l.push(`INSERT OR REPLACE INTO aprendido (palabra, categoria_id, cuenta_id) VALUES (${q(palabra)}, ${q(a.categoriaId ?? null)}, ${q(a.cuentaId ?? null)});`);
  for (const [cat, monto] of Object.entries(d.presupuestos)) l.push(`INSERT OR REPLACE INTO presupuestos (categoria_id, monto) VALUES (${q(cat)}, ${monto});`);
  for (const [clave, valor] of Object.entries(d.config)) l.push(`INSERT OR REPLACE INTO config (clave, valor) VALUES (${q(clave)}, ${q(valor)});`);
  l.push('PRAGMA foreign_keys = ON;');
  return l.join('\n') + '\n';
}
