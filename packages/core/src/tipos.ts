/**
 * Tipos compartidos por el bot, el Worker de Cloudflare y la app web.
 *
 * Convenciones (ver docs/MODELO-DATOS.md):
 *  - Los montos son enteros en la unidad mínima de la moneda: COP = pesos, USD = centavos.
 *  - Las fechas son hora local de Colombia (UTC-5, sin horario de verano) con formato
 *    'YYYY-MM-DD HH:MM:SS'. Así se ordenan como texto.
 *  - Todo movimiento mueve plata entre "cuentas" y sus asientos suman 0 por moneda.
 */

export type Moneda = 'COP' | 'USD';

/** Decimales de cada moneda: sirve para pasar de "8 dólares" a 800 centavos. */
export const DECIMALES: Record<Moneda, number> = { COP: 0, USD: 2 };

export type TipoCuenta = 'dinero' | 'persona' | 'categoria' | 'fuente' | 'sistema';

/** Grupo de una persona. Los de siempre están en `GRUPOS` (entidades.ts); cada plantilla puede definir los suyos. */
export type Grupo = string;

export interface Cuenta {
  id: string;
  /** Como lo escribes tú: "Juan Manuel". */
  nombre: string;
  /** Minúsculas y sin tildes, para buscar: "juan manuel". */
  clave: string;
  tipo: TipoCuenta;
  moneda: Moneda;
  /** Solo personas: a qué grupo pertenecen (ver `GRUPOS`). 'familia' y 'otros' son de versiones anteriores. */
  grupo?: Grupo | null;
  /** Categorías fijas (p. ej. Viaje semanal). */
  fijo?: boolean;
  /** false = no cuenta como plata disponible (las monedas). */
  enDisponible?: boolean;
}

export type TipoMovimiento =
  | 'gasto'
  | 'ingreso'
  | 'transferencia'
  | 'prestamo'
  | 'deuda'
  | 'pago'
  | 'compartido'
  | 'apertura'
  | 'ajuste'
  | 'cambio_moneda';

export interface Asiento {
  cuentaId: string;
  /** Con signo. Ver el cuadro de signos en db/schema.sql. */
  monto: number;
  moneda: Moneda;
}

export interface Movimiento {
  id: string;
  ocurridoEn: string;
  /** true = solo se conoce el día (movimientos importados del Excel). */
  sinHora: boolean;
  tipo: TipoMovimiento;
  descripcion: string;
  etiqueta?: string | null;
  nota?: string | null;
  lugarDesde?: string | null;
  lugarHasta?: string | null;
  origen: 'bot' | 'app' | 'excel';
  /** Lo que escribiste, tal cual: sirve para "editar" un movimiento ya guardado. */
  mensajeOriginal?: string | null;
  /** La tarjeta (Propuesta) confirmada, para poder editar el movimiento después. */
  propuesta?: unknown;
  compromisoId?: string | null;
  estado: 'ok' | 'anulado';
  anuladoEn?: string | null;
  creadoEn: string;
  /** Cuándo se editó por última vez desde el detalle del movimiento (hora local). Si falta, nunca se editó. */
  editadoEn?: string | null;
  asientos: Asiento[];
}

export interface Compromiso {
  id: string;
  personaId: string;
  direccion: 'debo' | 'me_deben';
  monto: number;
  moneda: Moneda;
  motivo?: string | null;
  fechaLimite?: string | null;
  estado: 'activa' | 'saldada' | 'anulada';
  creadoEn: string;
}

/** Atajo con monto: "pasaje" -> 7.000 en Viaje semanal. */
export interface Atajo {
  palabra: string;
  concepto: string;
  monto?: number | null;
  moneda: Moneda;
  categoriaId?: string | null;
  cuentaId?: string | null;
}

export interface Aprendido {
  categoriaId?: string;
  cuentaId?: string;
}

/** Palabras clave -> categoría (db/diccionario.json). */
export interface Diccionario {
  categorias: { id: string; palabras: string[] }[];
  prestamos_inicio: string[];
}

/** Todo lo que el parser necesita saber del mundo para interpretar un mensaje. */
export interface Contexto {
  ahora: Date;
  cuentas: Cuenta[];
  atajos: Atajo[];
  aprendido: Record<string, Aprendido>;
  /** Tope mensual por categoría (en pesos). */
  presupuestos: Record<string, number>;
  config: Record<string, string>;
  diccionario: Diccionario;
}
