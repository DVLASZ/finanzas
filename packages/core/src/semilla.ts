/**
 * Datos iniciales: cuentas, categorías y atajos. Debe coincidir con db/seed.sql
 * (hay una prueba que lo comprueba).
 */
import type { Atajo, Cuenta } from './tipos.ts';

export const dinero = (id: string, nombre: string, moneda: 'COP' | 'USD', enDisponible: boolean): Cuenta =>
  ({ id, nombre, clave: nombre.toLowerCase(), tipo: 'dinero', moneda, enDisponible });
export const categoria = (id: string, nombre: string, fijo = false): Cuenta =>
  ({ id, nombre, clave: nombre.toLowerCase(), tipo: 'categoria', moneda: 'COP', fijo });
export const sistema = (id: string, nombre: string, clave: string, moneda: 'COP' | 'USD'): Cuenta =>
  ({ id, nombre, clave, tipo: 'sistema', moneda });

export const CUENTAS_INICIALES: Cuenta[] = [
  dinero('efectivo', 'Efectivo', 'COP', true),
  dinero('monedas', 'Monedas', 'COP', false),
  dinero('nequi', 'Nequi', 'COP', true),
  dinero('daviplata', 'Daviplata', 'COP', true),
  dinero('arq', 'ARQ', 'USD', true),
  categoria('cat:mecato', 'Mecato'),
  categoria('cat:comida', 'Comida'),
  categoria('cat:transporte', 'Transporte'),
  categoria('cat:viaje-semanal', 'Viaje semanal', true),
  categoria('cat:recargas', 'Recargas'),
  categoria('cat:banco', 'Costos del banco'),
  categoria('cat:juegos', 'Juegos'),
  categoria('cat:suscripciones', 'Suscripciones'),
  categoria('cat:salidas', 'Salidas'),
  categoria('cat:universidad', 'Universidad'),
  categoria('cat:personal', 'Personal'),
  categoria('cat:compras', 'Compras'),
  categoria('cat:regalos', 'Regalos'),
  categoria('cat:salud', 'Salud'),
  categoria('cat:reparaciones', 'Reparaciones'),
  categoria('cat:otros', 'Otros'),
  categoria('cat:descuadre', 'Descuadre'),
  sistema('sys:apertura', 'Apertura', 'apertura', 'COP'),
  sistema('sys:cambio-cop', 'Cambio de moneda COP', 'cambio cop', 'COP'),
  sistema('sys:cambio-usd', 'Cambio de moneda USD', 'cambio usd', 'USD'),
];

export const ATAJOS_INICIALES: Atajo[] = [
  { palabra: 'pasaje', concepto: 'Pasaje Terminal', monto: 7000, moneda: 'COP', categoriaId: 'cat:viaje-semanal', cuentaId: 'efectivo' },
];

export const CONFIG_INICIAL: Record<string, string> = {
  fecha_apertura: '2000-01-01 00:00:00',
  moneda_base: 'COP',
  meta_ahorro_pct: '30',
};
