/**
 * De una `Propuesta` confirmada a un `Movimiento` con sus asientos (partida doble).
 *
 * Regla de oro: los asientos de cada movimiento suman 0 por moneda. Si no, es un bug y se lanza
 * un error en vez de guardar datos torcidos.
 */
import { partirEfectivo, resolverEfectivo } from './efectivo.ts';
import { grupoPorDefecto, idFuente, idPersona } from './entidades.ts';
import type { Propuesta } from './parser.ts';
import { normalizar, titulo } from './texto.ts';
import type { Asiento, Compromiso, Contexto, Cuenta, Moneda, Movimiento } from './tipos.ts';
import { aLocal } from './fechas.ts';

/** Saldo actual por cuenta y moneda: clave `${cuentaId}|${moneda}`. */
export type Saldos = Map<string, number>;

export interface Construido {
  movimiento: Movimiento;
  /** Cuentas (personas, fuentes) que no existían y hay que crear. */
  cuentasNuevas: Cuenta[];
  /** Deudas o préstamos nuevos que registrar. */
  compromisos: Compromiso[];
}

/** Cuánto hay en una cuenta ahora mismo. */
export function saldoDe(saldos: Saldos, cuentaId: string, moneda: Moneda): number {
  return saldos.get(`${cuentaId}|${moneda}`) ?? 0;
}

/** Monedas en las que opera una cuenta de dinero. */
function monedaDe(cuentaId: string): Moneda {
  return cuentaId === 'arq' ? 'USD' : 'COP';
}

/**
 * Lo que cambia un arqueo: por cada cuenta, cuánto tenías, cuánto dices que tienes y la diferencia.
 * Sirve tanto para mostrar la tarjeta como para construir el movimiento.
 */
export function diferenciasArqueo(p: Propuesta, saldos: Saldos) {
  return (p.declarados ?? []).map(d => {
    const antes = saldoDe(saldos, d.cuentaId, d.moneda);
    return { cuentaId: d.cuentaId, moneda: d.moneda, antes, declarado: d.monto, diferencia: d.monto - antes };
  });
}

/**
 * Control de calidad de la partida doble: cada monto es un número entero y cada moneda suma 0.
 * Lo usa `construirMovimiento` y también el servidor para no creerle a ciegas a lo que llega
 * por `/api/sync` (un movimiento torcido en la base ya no se puede detectar después).
 */
export function validarAsientos(asientos: Asiento[]): void {
  const porMoneda = new Map<Moneda, number>();
  for (const a of asientos) {
    if (!Number.isSafeInteger(a.monto)) throw new Error(`Monto inválido en un asiento: ${a.monto}`);
    porMoneda.set(a.moneda, (porMoneda.get(a.moneda) ?? 0) + a.monto);
  }
  for (const [moneda, suma] of porMoneda) {
    if (suma !== 0) throw new Error(`Movimiento desbalanceado en ${moneda}: ${suma}`);
  }
}

const enMoneda = (m: Moneda): string => (m === 'USD' ? 'dólares' : 'pesos');

/**
 * Un abono tiene que ser en la moneda de la deuda y de la cuenta con la que se paga: los dólares nunca se convierten
 * a pesos por su cuenta. Devuelve el motivo si no se puede, o null.
 */
export function errorDePago(p: Propuesta, ctx: Contexto, saldos: Saldos): string | null {
  if (p.tipo !== 'pago' || !p.persona || p.montoOtro !== undefined) return null;
  const clave = normalizar(p.persona);
  const per = ctx.cuentas.find(c => c.tipo === 'persona' && c.clave === clave);
  const otra: Moneda = p.moneda === 'USD' ? 'COP' : 'USD';
  if (per && saldoDe(saldos, per.id, p.moneda) === 0) {
    const s = saldoDe(saldos, per.id, otra);
    if (p.direccion === 'yo_pago' ? s < 0 : s > 0) {
      return p.direccion === 'yo_pago'
        ? `No le debes ${enMoneda(p.moneda)} a ${per.nombre}: la deuda es en ${enMoneda(otra)}`
        : `${per.nombre} no te debe ${enMoneda(p.moneda)}: la deuda es en ${enMoneda(otra)}`;
    }
  }
  const cuenta = ctx.cuentas.find(c => c.id === (p.cuentaId ?? 'efectivo'));
  if (cuenta && cuenta.tipo === 'dinero' && cuenta.moneda !== p.moneda) {
    return `${cuenta.nombre} es una cuenta en ${enMoneda(cuenta.moneda)} y el pago es en ${enMoneda(p.moneda)}`;
  }
  return null;
}

export function construirMovimiento(
  p: Propuesta, ctx: Contexto, saldos: Saldos, id: string, origen: 'bot' | 'app',
): Construido {
  const asientos: Asiento[] = [];
  const cuentasNuevas: Cuenta[] = [];
  const compromisos: Compromiso[] = [];
  const mov = (a: Asiento) => { if (a.monto !== 0) asientos.push(a); };

  /** Cuenta de una persona (la crea si no existe). */
  const persona = (nombre: string): string => {
    const clave = normalizar(nombre);
    const ex = ctx.cuentas.find(c => c.tipo === 'persona' && c.clave === clave) ?? cuentasNuevas.find(c => c.clave === clave && c.tipo === 'persona');
    if (ex) return ex.id;
    // El grupo que se eligió en la pregunta «¿Quién es...?» vale para la persona del mensaje.
    const grupo = p.grupoPersona && p.persona && normalizar(p.persona) === clave ? p.grupoPersona : grupoPorDefecto(nombre);
    const nueva: Cuenta = {
      id: idPersona(nombre), nombre: titulo(nombre), clave, tipo: 'persona', moneda: 'COP', grupo,
    };
    cuentasNuevas.push(nueva);
    return nueva.id;
  };
  const fuente = (nombre: string): string => {
    const clave = normalizar(nombre);
    const ex = ctx.cuentas.find(c => c.tipo === 'fuente' && c.clave === clave) ?? cuentasNuevas.find(c => c.clave === clave && c.tipo === 'fuente');
    if (ex) return ex.id;
    const nueva: Cuenta = { id: idFuente(nombre), nombre: titulo(nombre), clave, tipo: 'fuente', moneda: 'COP' };
    cuentasNuevas.push(nueva);
    return nueva.id;
  };

  const cuenta = p.cuentaId ?? 'efectivo';
  const M = p.moneda;
  const creado = aLocal(ctx.ahora);
  const nuevoCompromiso = (personaId: string, direccion: 'debo' | 'me_deben', monto: number, moneda: Moneda, motivo?: string, fechaLimite?: string) => {
    const c: Compromiso = {
      id: `${id}-c${compromisos.length + 1}`, personaId, direccion, monto, moneda,
      motivo: motivo ?? null, fechaLimite: fechaLimite ?? null, estado: 'activa', creadoEn: creado,
    };
    compromisos.push(c);
    return c;
  };

  /**
   * El dinero que sale de tu bolsillo. En efectivo se reparte entre billetes y monedas según cómo
   * pagaste (justo, con un billete mayor y vuelto...): ver core/src/efectivo.ts.
   */
  const salidaDeDinero = (monto: number) => {
    if (cuenta === 'efectivo' && M === 'COP') {
      const r = resolverEfectivo({ ...p, monto }, saldoDe(saldos, 'monedas', 'COP'), ctx.config.pago_defecto === 'mayor' ? 'mayor' : 'justo');
      if (!r.cuadra) throw new Error(r.aviso ?? 'El pago no cuadra');
      mov({ cuentaId: 'efectivo', monto: -r.pago.billetes + r.vuelto.billetes, moneda: 'COP' });
      mov({ cuentaId: 'monedas', monto: -r.pago.monedas + r.vuelto.monedas, moneda: 'COP' });
    } else {
      mov({ cuentaId: cuenta, monto: -monto, moneda: M });
    }
  };

  switch (p.tipo) {
    case 'gasto': {
      salidaDeDinero(p.monto);
      mov({ cuentaId: p.categoriaId!, monto: p.monto, moneda: M });
      if (p.persona) persona(p.persona); // regalo o pago a alguien: queda registrada, con su grupo
      break;
    }
    case 'compartido': {
      const categoria = p.categoriaId!;
      if (p.pagoOtro) {
        // Lo pagó otra persona: es tu gasto y le debes ese monto.
        mov({ cuentaId: categoria, monto: p.monto, moneda: M });
        const pid = persona(p.persona!);
        mov({ cuentaId: pid, monto: -p.monto, moneda: M });
        nuevoCompromiso(pid, 'debo', p.monto, M, p.concepto);
      } else {
        const deben = (p.personas ?? []).reduce((s, x) => s + x.monto, 0);
        if (deben > p.monto) throw new Error('Lo que te deben supera el gasto.');
        salidaDeDinero(p.monto);
        mov({ cuentaId: categoria, monto: p.monto - deben, moneda: M });
        for (const x of p.personas ?? []) {
          const pid = persona(x.nombre);
          mov({ cuentaId: pid, monto: x.monto, moneda: M });
          nuevoCompromiso(pid, 'me_deben', x.monto, M, p.concepto);
        }
      }
      break;
    }
    case 'ingreso': {
      mov({ cuentaId: fuente(p.fuente!), monto: -p.monto, moneda: M });
      if (p.fiado && p.persona) {
        // Venta a crédito: no entra plata; el cliente queda debiendo.
        const pid = persona(p.persona);
        mov({ cuentaId: pid, monto: p.monto, moneda: M });
        nuevoCompromiso(pid, 'me_deben', p.monto, M, p.concepto);
        break;
      }
      mov({ cuentaId: cuenta, monto: p.monto, moneda: M });
      if (p.persona) persona(p.persona); // venta a alguien: queda registrada, con su grupo
      break;
    }
    case 'transferencia': {
      mov({ cuentaId: cuenta, monto: -p.monto, moneda: M });
      mov({ cuentaId: p.cuentaDestinoId!, monto: p.monto, moneda: M });
      break;
    }
    case 'cambio_moneda': {
      // monto/moneda = lo que sale del origen; montoOtro/monedaOtra = lo que entra al destino
      const sale = p.monto, entra = p.montoOtro!;
      mov({ cuentaId: cuenta, monto: -sale, moneda: M });
      mov({ cuentaId: p.cuentaDestinoId!, monto: entra, moneda: p.monedaOtra! });
      // cada moneda se compensa contra su cuenta de sistema
      mov({ cuentaId: M === 'COP' ? 'sys:cambio-cop' : 'sys:cambio-usd', monto: sale, moneda: M });
      mov({ cuentaId: p.monedaOtra === 'COP' ? 'sys:cambio-cop' : 'sys:cambio-usd', monto: -entra, moneda: p.monedaOtra! });
      break;
    }
    case 'prestamo': {
      const pid = persona(p.persona!);
      salidaDeDinero(p.monto);
      mov({ cuentaId: pid, monto: p.monto, moneda: M });
      nuevoCompromiso(pid, 'me_deben', p.monto, M, p.motivo, p.fechaLimite);
      break;
    }
    case 'deuda': {
      const pid = persona(p.persona!);
      if (p.recibeDinero) mov({ cuentaId: cuenta, monto: p.monto, moneda: M });
      else mov({ cuentaId: p.categoriaId!, monto: p.monto, moneda: M });
      mov({ cuentaId: pid, monto: -p.monto, moneda: M });
      nuevoCompromiso(pid, 'debo', p.monto, M, p.motivo, p.fechaLimite);
      break;
    }
    case 'pago': {
      const motivo = errorDePago(p, ctx, saldos);
      if (motivo) throw new Error(motivo);
      const pid = persona(p.persona!);
      const yoPago = p.direccion === 'yo_pago';
      const signo = yoPago ? -1 : 1;
      if (p.montoOtro !== undefined && p.monedaOtra) {
        // pago cruzado: pesos (montoOtro, COP) por una deuda en dólares (monto, USD)
        mov({ cuentaId: cuenta, monto: signo * p.montoOtro, moneda: p.monedaOtra });
        mov({ cuentaId: 'sys:cambio-cop', monto: -signo * p.montoOtro, moneda: p.monedaOtra });
        mov({ cuentaId: 'sys:cambio-usd', monto: signo * p.monto, moneda: M });
        mov({ cuentaId: pid, monto: -signo * p.monto, moneda: M });
      } else {
        if (yoPago) salidaDeDinero(p.monto);
        else mov({ cuentaId: cuenta, monto: p.monto, moneda: M });
        mov({ cuentaId: pid, monto: -signo * p.monto, moneda: M });
      }
      break;
    }
    case 'apertura': {
      for (const d of p.declarados ?? []) {
        mov({ cuentaId: d.cuentaId, monto: d.monto, moneda: d.moneda });
        mov({ cuentaId: 'sys:apertura', monto: -d.monto, moneda: d.moneda });
      }
      for (const d of p.deudasIniciales ?? []) {
        const pid = persona(d.nombre);
        const signo = d.direccion === 'debo' ? -1 : 1; // debo => la persona queda en negativo
        mov({ cuentaId: pid, monto: signo * d.monto, moneda: d.moneda });
        mov({ cuentaId: 'sys:apertura', monto: -signo * d.monto, moneda: d.moneda });
        nuevoCompromiso(pid, d.direccion, d.monto, d.moneda, d.motivo, d.fechaLimite);
      }
      break;
    }
    case 'ajuste': {
      if (p.cuadra) {
        // lo poco que quedó pendiente con una persona se manda a Descuadre, y la persona queda en cero
        mov({ cuentaId: p.cuadra.personaId, monto: -p.cuadra.saldo, moneda: 'COP' });
        mov({ cuentaId: 'cat:descuadre', monto: p.cuadra.saldo, moneda: 'COP' });
        break;
      }
      // Arqueo: lo que falta o sobra va a la categoría "Descuadre".
      for (const d of diferenciasArqueo(p, saldos)) {
        if (d.diferencia === 0) continue;
        mov({ cuentaId: d.cuentaId, monto: d.diferencia, moneda: d.moneda });
        mov({ cuentaId: 'cat:descuadre', monto: -d.diferencia, moneda: d.moneda });
      }
      break;
    }
  }

  // El efectivo son billetes: lo que entre o salga de la billetera por otro camino (ingreso, cobro,
  // retiro...) y no sea múltiplo de 1.000 deja la parte menor en Monedas. (Saldo inicial y arqueo
  // declaran lo que hay, tal cual.)
  if (p.tipo !== 'apertura' && p.tipo !== 'ajuste') {
    for (const a of [...asientos]) {
      if (a.cuentaId !== 'efectivo' || a.moneda !== 'COP' || a.monto % 1000 === 0) continue;
      const { efectivo, monedas } = partirEfectivo(a.monto);
      asientos.splice(asientos.indexOf(a), 1);
      mov({ cuentaId: 'efectivo', monto: efectivo, moneda: 'COP' });
      mov({ cuentaId: 'monedas', monto: monedas, moneda: 'COP' });
    }
  }

  validarAsientos(asientos);
  if (!asientos.length && p.tipo !== 'ajuste') throw new Error('El movimiento no tiene asientos.');

  const movimiento: Movimiento = {
    id,
    ocurridoEn: p.ocurridoEn,
    sinHora: false,
    tipo: p.tipo,
    descripcion: p.concepto,
    etiqueta: p.etiqueta ?? null,
    nota: p.nota ?? null,
    lugarDesde: p.desde ?? null,
    lugarHasta: p.hasta ?? null,
    origen,
    mensajeOriginal: p.mensajeOriginal,
    propuesta: p,
    compromisoId: compromisos[0]?.id ?? null,
    estado: 'ok',
    creadoEn: creado,
    asientos,
  };
  return { movimiento, cuentasNuevas, compromisos };
}
