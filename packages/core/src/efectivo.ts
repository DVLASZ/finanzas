/**
 * Billetes, monedas y vuelto.
 *
 * En Colombia el efectivo de la billetera son billetes de 2.000, 5.000, 10.000, 20.000, 50.000 y
 * 100.000 (el de 1.000 casi no circula): siempre en múltiplos de 1.000. Todo lo menor de 1.000 es
 * moneda, y las monedas (50, 100, 200, 500 y 1.000) van en su propia cuenta, que no cuenta en el
 * disponible.
 *
 * Un pago en efectivo tiene cuatro cantidades: billetes y monedas entregados, billetes y monedas de
 * vuelto. Siempre se cumple: costo = entregado - vuelto. La persona puede decir cualquiera de ellas
 * y aquí se calculan las que faltan. Sin tocar datos ni parser: funciones puras, fáciles de probar.
 */

export const BILLETES = [2000, 5000, 10000, 20000, 50000, 100000];

export interface Reparto { billetes: number; monedas: number }

const total = (r: Reparto): number => r.billetes + r.monedas;

/**
 * Reparte un monto en billetes y monedas: billetes todo lo que se pueda, el resto en monedas.
 * Con billetes de 2.000 o más se forma cualquier múltiplo de 1.000 menos 1.000 y 3.000; esos dos
 * y cualquier sobrante menor de 1.000 van en monedas (3.000 = billete de 2.000 + moneda de 1.000).
 */
export function repartir(monto: number): Reparto {
  const mil = monto - (monto % 1000);
  const billetes = mil >= 2000 && mil !== 3000 ? mil : mil === 3000 ? 2000 : 0;
  return { billetes, monedas: monto - billetes };
}

/** El billete más chico que cubre el monto (el que sacarías si no tienes justo). */
export function billeteQueCubre(monto: number): number {
  return BILLETES.find(b => b >= monto) ?? Math.ceil(monto / 100000) * 100000;
}

/** Lo que la persona dijo (o no) sobre cómo pagó. Es parte de la `Propuesta`. */
export interface DatosPago {
  /** Costo real. */
  monto: number;
  /** Billetes con los que pagó ("con 5k"). */
  pagoCon?: number;
  /** Monedas con las que pagó ("con 2k y 800 en monedas"). */
  pagoMonedas?: number;
  /** "...y el resto en monedas": las monedas son lo que falta para cubrir el costo. */
  restoEnMonedas?: boolean;
  /** Vuelto dicho. `{0,0}` = "sin vuelto" / "justo". null o ausente = no dijo nada. */
  vuelto?: Reparto | null;
  /** Atajo de la tarjeta: "Pagué justo" o "Pagué con un billete mayor". */
  formaPago?: 'justo' | 'mayor';
  /** Atajo de la tarjeta: "Pagué con $10.000". */
  billeteMayor?: number;
}

export interface PagoEfectivo {
  pago: Reparto;
  vuelto: Reparto;
  modo: 'justo' | 'con' | 'deducido' | 'billete_mayor';
  /** El vuelto lo calculé yo (no lo dijo la persona). */
  estimado: boolean;
  /** Explica un cambio automático (por ejemplo, "no tenías monedas suficientes"). */
  nota?: string;
  /** Lo dicho no cuadra: la tarjeta avisa y no deja guardar. */
  cuadra: boolean;
  aviso?: string;
}

const pesos = (n: number): string => '$' + String(n).replace(/\B(?=(\d{3})+(?!\d))/g, '.');

/**
 * Calcula el pago completo. `monedasHay` es lo que hay en la cuenta Monedas: si pagar justo exige
 * más monedas de las que hay, se cambia solo a pagar con un billete mayor (y se dice).
 */
export function resolverEfectivo(d: DatosPago, monedasHay: number, porDefecto: 'justo' | 'mayor' = 'justo'): PagoEfectivo {
  const cero: Reparto = { billetes: 0, monedas: 0 };
  const cuadrar = (pago: Reparto, vuelto: Reparto, modo: PagoEfectivo['modo'], estimado: boolean): PagoEfectivo => {
    const sobra = total(pago) - total(vuelto) - d.monto;
    if (sobra === 0) return { pago, vuelto, modo, estimado, cuadra: true };
    return {
      pago, vuelto, modo, estimado, cuadra: false,
      aviso: `El vuelto no cuadra: pagaste con ${pesos(total(pago))}, te devolvieron ${pesos(total(vuelto))} y el gasto fue ${pesos(d.monto)} (el vuelto debería ser ${pesos(total(pago) - d.monto)}).`,
    };
  };

  // 1. Dijo con qué pagó.
  if (d.pagoCon !== undefined || d.pagoMonedas !== undefined || d.restoEnMonedas) {
    const billetes = d.pagoCon ?? 0;
    const monedas = d.restoEnMonedas ? Math.max(0, d.monto - billetes) : (d.pagoMonedas ?? 0);
    const pago = { billetes, monedas };
    if (d.vuelto) return cuadrar(pago, d.vuelto, 'con', false);
    const dif = total(pago) - d.monto;
    if (dif < 0) {
      return { pago, vuelto: cero, modo: 'con', estimado: false, cuadra: false, aviso: `Pagaste con ${pesos(total(pago))} y el gasto fue ${pesos(d.monto)}: te faltan ${pesos(-dif)}.` };
    }
    return { pago, vuelto: repartir(dif), modo: 'con', estimado: true, cuadra: true };
  }

  // 2. Dijo el vuelto pero no con qué pagó: se entregó el costo más el vuelto.
  if (d.vuelto && total(d.vuelto) > 0) {
    return { pago: repartir(d.monto + total(d.vuelto)), vuelto: d.vuelto, modo: 'deducido', estimado: false, cuadra: true };
  }

  // 3. No dijo nada (o dijo "sin vuelto"): justo, con un billete mayor, o lo que eligió en la tarjeta.
  const justoDicho = Boolean(d.vuelto) || d.formaPago === 'justo';
  const conBillete = (billete: number, nota?: string): PagoEfectivo =>
    ({ pago: { billetes: billete, monedas: 0 }, vuelto: repartir(billete - d.monto), modo: 'billete_mayor', estimado: true, cuadra: true, nota });

  if (d.billeteMayor !== undefined && d.billeteMayor >= d.monto) return conBillete(d.billeteMayor);

  const justo = repartir(d.monto);
  const forma = justoDicho ? 'justo' : (d.formaPago ?? porDefecto);
  if (justo.monedas === 0) return { pago: justo, vuelto: cero, modo: 'justo', estimado: false, cuadra: true };
  if (forma === 'justo') {
    if (justoDicho || justo.monedas <= monedasHay) return { pago: justo, vuelto: cero, modo: 'justo', estimado: false, cuadra: true };
    const billete = billeteQueCubre(d.monto);
    return conBillete(billete, `No tenías monedas suficientes (${pesos(Math.max(0, monedasHay))}): lo calculé como pago con billete de ${pesos(billete)}.`);
  }
  return conBillete(billeteQueCubre(d.monto));
}

/** Los billetes más comunes que cubren un monto, para los atajos de la tarjeta ("Con $5.000"). */
export function billetesSugeridos(monto: number, cuantos = 2): number[] {
  return BILLETES.filter(b => b > monto).slice(0, cuantos);
}

/**
 * Parte un monto que entra o sale del efectivo sin pasar por el pago completo (ingreso, cobro,
 * transferencia...): los miles van a Efectivo (billetes) y lo menor a 1.000 va a Monedas.
 */
export function partirEfectivo(monto: number): { efectivo: number; monedas: number } {
  const resto = monto % 1000;
  return { efectivo: monto - resto, monedas: resto };
}

/**
 * Interpreta lo que se dice de un pago o de un vuelto: "5k y 200 monedas", "2k", "2200",
 * "un billete de 5k y 500 en monedas". Con marca ("monedas", "billete") se respeta; sin marca el
 * monto se reparte con `repartir`. Recibe los montos ya hallados con su texto alrededor.
 */
export function clasificar(texto: string, montos: { valor: number; inicio: number; fin: number }[]): Reparto {
  const res: Reparto = { billetes: 0, monedas: 0 };
  montos.forEach((m, i) => {
    const antesTxt = texto.slice(i === 0 ? 0 : montos[i - 1].fin, m.inicio);
    const despuesTxt = texto.slice(m.fin, montos[i + 1]?.inicio ?? texto.length);
    const antes = antesTxt.slice(antesTxt.lastIndexOf(' y ') + 1); // lo anterior a un "y" es del monto previo
    const marcaDespues = despuesTxt.slice(0, 16);
    const esMoneda = /moned|suelt|sencill/.test(marcaDespues) || (!/billete/.test(marcaDespues) && /moned|suelt|sencill/.test(antes));
    const esBillete = /billete/.test(marcaDespues) || /billete/.test(antes);
    if (esMoneda && !esBillete) res.monedas += m.valor;
    else if (esBillete && !esMoneda) res.billetes += m.valor;
    else {
      const r = repartir(m.valor);
      res.billetes += r.billetes;
      res.monedas += r.monedas;
    }
  });
  return res;
}
