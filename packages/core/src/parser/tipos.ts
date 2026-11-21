// Los tipos que comparten el intérprete, el bot y la app: Propuesta, Faltante, Resultado.
import { deuda } from './personas.ts';
import { type Grupo, type Moneda, type TipoMovimiento } from '../tipos.ts';

// ---------------------------------------------------------------------------------------
// Resultado del intérprete
// ---------------------------------------------------------------------------------------

export type Comando =
  | 'ventas' | 'existencias' | 'existencias_fijar' | 'existencias_sumar'
  | 'saldo' | 'semana' | 'mes' | 'anio' | 'deudas' | 'deshacer' | 'ayuda'
  | 'editar_ultimo' | 'ultimos' | 'categoria' | 'evento' | 'lista' | 'lista_agregar' | 'lista_quitar'
  | 'recurrente_agregar' | 'recurrente_quitar' | 'recurrentes'
  | 'deshacer_varios' | 'subcategoria' | 'cierre_cerrar' | 'cierre_abrir' | 'cierre_ver'
  | 'corte' | 'saldo_cuenta' | 'presupuesto_semana' | 'revision' | 'jornales' | 'cuadrar_persona' | 'metas' | 'meta_fijar' | 'meta_apartar' | 'meta_sacar' | 'meta_quitar';

/** Un dato que falta o que hay que aclarar antes de poder confirmar. */
export interface Faltante {
  campo: 'categoria' | 'desde' | 'hasta' | 'persona' | 'grupo' | 'rol' | 'cobro' | 'apodo';
  pregunta: string;
  opciones?: string[];
  /** Lo que escribiste (para 'persona': el nombre dudoso). */
  dato?: string;
}

export interface Propuesta {
  tipo: TipoMovimiento;
  ocurridoEn: string;
  concepto: string;
  /** Monto principal en unidad mínima de `moneda`. */
  monto: number;
  moneda: Moneda;
  /** Cuenta de dinero de origen (gasto, préstamo, pago...) o de destino (ingreso). */
  cuentaId?: string;
  cuentaDestinoId?: string;
  /** Cambio de moneda / pagos cruzados: monto en la otra moneda. */
  montoOtro?: number;
  monedaOtra?: Moneda;
  categoriaId?: string;
  fuente?: string;
  persona?: string;
  /** Venta del catálogo: «3 × botella a $20.000». */
  venta?: { producto: string; presentacion: string; cantidad: number; precio: number };
  /** Venta a crédito: el cliente queda debiendo y no entra plata a la caja. */
  fiado?: boolean;
  /** Grupo de la persona cuando es nueva (los de la casa, trabajadores...). */
  grupoPersona?: Grupo;
  /** La persona es nueva: si se aclara que es «(nuevo)», hay que preguntar su grupo. */
  pedirGrupo?: boolean;
  /** Un nombre nuevo que resultó ser el apodo de alguien que ya conoces: se guarda al confirmar. */
  apodoNuevo?: { apodo: string; personaId: string };
  /** Gasto compartido: lo que te debe cada persona. */
  personas?: { nombre: string; monto: number }[];
  /** Compartido o gasto pagado por otro. */
  pagoOtro?: boolean;
  /** Pago: quién mueve el dinero. Deuda: true si te prestaron dinero en efectivo. */
  direccion?: 'yo_pago' | 'me_pagan';
  recibeDinero?: boolean;
  /** Cómo se pagó en efectivo (ver core/src/efectivo.ts). Todo es opcional: lo que no se dijo se calcula. */
  pagoCon?: number;
  pagoMonedas?: number;
  restoEnMonedas?: boolean;
  vuelto?: { billetes: number; monedas: number } | null;
  /** Atajos de la tarjeta: «Justo» o «Con $10.000». */
  formaPago?: 'justo' | 'mayor';
  billeteMayor?: number;
  etiqueta?: string;
  /** Si la cuenta o la categoría salió de una regla aprendida: «Laura va a Nequi». Se muestra en la tarjeta. */
  reglaUsada?: string;
  desde?: string;
  hasta?: string;
  fechaLimite?: string;
  motivo?: string;
  nota?: string;
  /** Arqueo / saldo inicial. */
  declarados?: { cuentaId: string; monto: number; moneda: Moneda }[];
  deudasIniciales?: { nombre: string; monto: number; moneda: Moneda; direccion: 'debo' | 'me_deben'; fechaLimite?: string; motivo?: string }[];
  /** Plata que otra persona te mandó para pagar algo suyo (o lo que gastaste con ella): no es deuda ni ingreso ni gasto tuyo. */
  custodia?: boolean;
  /** Arqueo de una persona: deja en cero lo poco que quedó pendiente con ella (saldo con signo: positivo = te debe). */
  cuadra?: { personaId: string; nombre: string; saldo: number };
  mensajeOriginal: string;
  /** Avisos suaves (p. ej. "no dijiste el vuelto"). */
  avisos: string[];
  faltantes: Faltante[];
}

export type Resultado =
  | { clase: 'comando'; comando: Comando; arg?: string }
  | { clase: 'movimiento'; propuesta: Propuesta }
  | { clase: 'error'; mensaje: string }
  /** La frase puede significar dos cosas: se pregunta con botones. Cada opción trae la frase que se manda si se elige. */
  | { clase: 'pregunta'; mensaje: string; opciones: { titulo: string; frase: string }[] };

export const error = (mensaje: string): Resultado => ({ clase: 'error', mensaje });

