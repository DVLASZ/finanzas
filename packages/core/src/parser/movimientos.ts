// Gasto, ingreso, transferencia entre cuentas y alcancía.
import { error, type Propuesta, type Resultado } from './tipos.ts';
import { RELLENO, VEHICULOS, conOriginales, dentroDe, listaCategorias, nombreEn, palabrasLibres, propuestaBase, recortarBordes, resolverNombre, total, tramosDe, type Base } from './comun.ts';
import { anotarPago, leerPago } from './pago.ts';
import { preguntarPorPersona } from './personas.ts';
import { aMinor, formatear, type MontoHallado } from '../dinero.ts';
import { BILLETES } from '../efectivo.ts';
import { borrarTramos, categorizar, ejemploDeCuenta } from '../entidades.ts';
import { capitalizar, titulo } from '../texto.ts';
import { type Contexto, type Cuenta, type Moneda } from '../tipos.ts';

// ---------------------------------------------------------------------------------------
// Alcancía
// ---------------------------------------------------------------------------------------

const NUMEROS_EN_LETRAS: Record<string, number> = { un: 1, una: 1, dos: 2, tres: 3, cuatro: 4, cinco: 5, seis: 6, siete: 7, ocho: 8, nueve: 9, diez: 10 };

/**
 * Las monedas que se meten (o sacan) de la alcancía se cuentan por tipo y el bot suma:
 * «5 monedas de 500 y 3 de mil» = $5.500. También vale una cifra suelta («metí 10000 a la alcancía»).
 * La plata sale de (o vuelve a) Monedas: las monedas de la billetera pasan al armario.
 */
export function alcancia(b: Base): Resultado {
  const saca = /\b(saque|saco|sacamos|retire|retiro|retiramos)\b/.test(b.t);
  const partes: string[] = [];
  let total = 0;
  for (const m of b.t.matchAll(/\b(\d+|un|una|dos|tres|cuatro|cinco|seis|siete|ocho|nueve|diez)\s+(?:monedas?\s+)?(?:de\s+)?(1\.?000|mil|1k|50|100|200|500)\b/g)) {
    const n = NUMEROS_EN_LETRAS[m[1]] ?? Number(m[1]);
    const valor = /^(mil|1k|1\.?000)$/.test(m[2]) ? 1000 : Number(m[2]);
    if (!n || n > 1000) continue;
    total += n * valor;
    partes.push(`${n} × ${formatear(valor)}`);
  }
  if (!total) {
    const m = b.montos.find(x => x.moneda !== 'USD');
    if (m) total = aMinor(m.valor, 'COP');
  }
  if (!total) return error('Dime cuánto. Por ejemplo: «metí 5 monedas de 500 y 3 de mil a la alcancía».');
  const p = propuestaBase(b, 'transferencia', 'Alcancía', total, 'COP');
  p.cuentaId = saca ? 'alcancia' : 'monedas';
  p.cuentaDestinoId = saca ? 'monedas' : 'alcancia';
  if (partes.length) p.nota = partes.join(' + ');
  return { clase: 'movimiento', propuesta: p };
}

// ---------------------------------------------------------------------------------------
// Gasto (el caso más común)
// ---------------------------------------------------------------------------------------

export function gasto(b: Base, ctx: Contexto): Resultado {
  const avisos: string[] = [];
  let montos = b.montos;

  // Las cláusulas de reparto ocupan el final del mensaje: lo que digan ("ivan 3000") no cuenta
  // como cuenta ni monto principal. Lo del pago ("con 5k"), el vuelto y "justo" lo lee `leerPago`.
  const mc = b.t.match(/\b(pague por|pague la parte de|compartido con|dividido con)\b/);
  const pg = leerPago(b.t, montos, mc?.index ?? Infinity);
  montos = pg.montos;
  const cuentas = b.cuentas.filter(c => c.inicio < (mc?.index ?? Infinity) && !dentroDe(c, pg.tramos));
  const tramos: { inicio: number; fin: number }[] = [...cuentas, ...pg.tramos];

  // Gasto compartido: "pagué por ivan 3000 y daniel 2500" / "pagué por ivan y daniel"
  let personasTexto: { nombres: string[]; montos: MontoHallado[] } | null = null;
  if (mc) {
    const desde = mc.index ?? 0;
    const enLista = montos.filter(m => m.inicio >= desde);
    montos = montos.filter(m => m.inicio < desde);
    // Nombres: lo que hay después de la cláusula, sin montos, separados por «y», coma o «/»
    const lista = borrarTramos(b.t, [...tramosDe(enLista), { inicio: 0, fin: desde + mc[0].length }]);
    const nombres = lista.split(/\s+y\s+|\//).map(s => recortarBordes(s.split(' ').filter(Boolean)).join(' ')).filter(Boolean);
    personasTexto = { nombres, montos: enLista };
    tramos.push({ inicio: desde, fin: b.t.length });
  }

  // Monto principal
  const cuentaMencion = cuentas[0]?.id;
  const candidatos = montos.filter(m => m.explicito || cuentaMencion === 'arq');
  const principales = candidatos;
  if (cuentas.length > 1) return error(`Veo dos cuentas. Si es una transferencia escribe, por ejemplo: «cambio 50k efectivo a ${ejemploDeCuenta(ctx)}».`);

  // Atajo: "pasaje" sin monto
  const libresAtajo = recortarBordes(palabrasLibres(b.t, [...tramos, ...tramosDe(b.montos)]));
  const atajo = ctx.atajos.find(a => libresAtajo[0] === a.palabra);

  if (principales.length === 1 && principales[0].negativo) return error('Un gasto no puede ser negativo. Si te devolvieron plata, anótalo como ingreso: «+mamá 30k».');

  if (principales.length > 1) {
    return error('Veo varios montos. Escribe un movimiento por mensaje (para repartir un gasto entre personas usa «pagué por ivan 3000 y daniel 2500»).');
  }
  if (principales.length === 0 && !(atajo && atajo.monto)) {
    return error(libresAtajo.length
      ? `Me falta el monto de «${conOriginales(libresAtajo, b)}». Escríbelo completo, por ejemplo: «${conOriginales(libresAtajo, b)} 5000».`
      : 'Me falta el monto y en qué fue. Escríbelo completo, por ejemplo: «mecato 5000».');
  }

  const cuentaId = cuentas[0]?.id ?? atajo?.cuentaId ?? 'efectivo';
  const m0 = principales[0];
  let moneda: Moneda = m0?.moneda ?? atajo?.moneda ?? 'COP';
  if (cuentaId === 'arq') moneda = 'USD';
  else if (moneda === 'USD') return error('El monto está en dólares pero la cuenta no es ARQ. Dime cuántos pesos salieron, por ejemplo: «juego 32000».');
  let monto = m0 ? aMinor(m0.valor, moneda) : (atajo!.monto as number);

  // Si dijo el vuelto sin decir con qué pagó y el monto es justo un billete, ese monto es el billete
  // con el que pagó: «almuerzo 20000 vuelto 500 monedas» costó 19.500.
  const efectivoCOP = cuentaId === 'efectivo' && moneda === 'COP';
  if (efectivoCOP && !pg.hayCon && pg.vueltoDicho && pg.vuelto && total(pg.vuelto) > 0 && BILLETES.includes(monto)) {
    if (total(pg.vuelto) >= monto) return error('El vuelto no puede ser igual o mayor a lo que pagaste.');
    pg.pagoCon = monto;
    pg.hayCon = true;
    monto -= total(pg.vuelto);
  }

  // Concepto y categoría
  const todosLosTramos = [...tramos, ...tramosDe(b.montos)];
  const libres = recortarBordes(palabrasLibres(b.t, todosLosTramos));
  const textoCategoria = recortarBordes(borrarTramos(b.t, todosLosTramos).split(' ').filter(Boolean)).join(' ');

  let categoriaId: string | null = null;
  if (atajo && libres[0] === atajo.palabra && atajo.categoriaId) categoriaId = atajo.categoriaId;
  categoriaId ??= categorizar(textoCategoria || b.t, ctx);
  // «moto 180000» no es un pasaje: una cifra grande de moto, carro o camioneta sin recorrido es un arreglo.
  if (categoriaId === 'cat:transporte' && moneda === 'COP' && monto >= 50_000 && ctx.cuentas.some(c => c.id === 'cat:reparaciones')) {
    const lug = lugares(b.t, todosLosTramos, b);
    if (!lug.desde && !lug.hasta && !lug.ambiguo && /^(moto|carro|camioneta)$/i.test(lug.vehiculo)) categoriaId = 'cat:reparaciones';
  }

  const p = propuestaBase(b, 'gasto', '', monto, moneda);
  p.cuentaId = cuentaId;
  if (categoriaId) p.categoriaId = categoriaId;

  const esTransporte = categoriaId === 'cat:transporte';
  if (esTransporte) {
    const lug = lugares(b.t, todosLosTramos, b);
    p.concepto = capitalizar(lug.vehiculo);
    if (lug.desde) p.desde = lug.desde;
    if (lug.hasta) p.hasta = lug.hasta;
    if (lug.ambiguo) {
      p.faltantes.push({ campo: 'hasta', pregunta: 'No entendí el recorrido. ¿A dónde fue? Responde con el lugar de llegada (p. ej. «Casa»).' });
    } else {
      if (!p.hasta) p.faltantes.push({ campo: 'hasta', pregunta: '¿A dónde fue? Responde con el lugar de llegada (p. ej. «Casa»).' });
      if (p.hasta && !p.desde) p.faltantes.push({ campo: 'desde', pregunta: `¿Desde dónde saliste hacia ${p.hasta}? Responde con el lugar (p. ej. «Terminal»).` });
    }
  } else {
    p.concepto = capitalizar(libres.length ? conOriginales(libres, b) : (atajo?.concepto ?? ''));
    if (!p.concepto) return error('Me falta decirme en qué fue el gasto. Escríbelo completo, por ejemplo: «mecato 5000».');
    if (atajo && libres[0] === atajo.palabra && libres.length === 1) p.concepto = atajo.concepto;
  }

  if (!categoriaId) {
    p.faltantes.push({
      campo: 'categoria', dato: libres.join(' ') || p.concepto.toLowerCase(),
      pregunta: `¿En qué categoría va «${p.concepto}»? Responde con una: ${listaCategorias(ctx).join(', ')}.`,
      opciones: listaCategorias(ctx),
    });
  }

  // Compartido
  if (personasTexto) armarCompartido(p, personasTexto, ctx, b);
  // Un nombre sin verbo («30000 Felipe», «pagué 3700 por Ivan empanadas»): se pregunta qué fue
  else preguntarPorPersona(p, b, ctx, esTransporte);

  // Cómo pagó en efectivo (billetes y monedas entregados, vuelto): ver `leerPago` y core/src/efectivo.ts
  anotarPago(p, pg, efectivoCOP, avisos);
  p.avisos.push(...avisos);
  return { clase: 'movimiento', propuesta: p };
}

/** Origen y destino de un transporte: "de terminal a casa", "terminal-casa", "terminal casa", "casa". */
export function lugares(t: string, tramos: { inicio: number; fin: number }[], b: Base) {
  const ws = borrarTramos(t, tramos).split(' ').filter(w => w && !RELLENO.has(w));
  const iv = ws.findIndex(w => VEHICULOS.includes(w));
  const vehiculo = iv >= 0 ? conOriginales([ws[iv]], b) : 'Transporte';
  const resto = (iv >= 0 ? [...ws.slice(0, iv), ...ws.slice(iv + 1)] : ws).filter(w => w !== 'ida' && w !== 'vuelta');
  const txt = resto.join(' ');
  const art = (s: string) => s.replace(/^(la|el|los|las) /, '').trim();
  const lugar = (s: string) => titulo(conOriginales(art(s).split(' '), b));

  const m = txt.match(/^(?:de |del |desde )?(.+?) (?:a|al|hasta|hacia|para)(?: la| el)? (.+)$/) ?? txt.match(/^(.+?) ?(?:->|=>|>|-) ?(.+)$/);
  if (m && m[1].trim() && m[2].trim()) return { vehiculo, desde: lugar(m[1]), hasta: lugar(m[2]), ambiguo: false };
  const lugares1 = recortarBordes(resto);
  if (lugares1.length === 1) return { vehiculo, hasta: lugar(lugares1[0]), ambiguo: false };
  if (lugares1.length === 2) return { vehiculo, desde: lugar(lugares1[0]), hasta: lugar(lugares1[1]), ambiguo: false };
  return { vehiculo, ambiguo: lugares1.length > 2 };
}

/** Reparte un gasto entre ti y las personas de la lista. */
function armarCompartido(
  p: Propuesta, lista: { nombres: string[]; montos: MontoHallado[] }, ctx: Contexto, b: Base,
): void {
  // Cada segmento es un nombre completo (1-3 palabras); se le devuelven tildes y mayúsculas.
  const nombres = lista.nombres.map(n => titulo(conOriginales(n.split(' '), b)));
  if (!nombres.length) { p.avisos.push('No entendí con quién se divide el gasto.'); return; }

  const total = p.monto;
  const conMonto = lista.montos.map(m => aMinor(m.valor, p.moneda));
  p.tipo = 'compartido';
  if (conMonto.length === nombres.length) {
    p.personas = nombres.map((n, i) => ({ nombre: resolverNombre(n, ctx, p), monto: conMonto[i] }));
  } else if (conMonto.length === 0) {
    const partes = nombres.length + 1; // tú también
    const cada = Math.floor(total / partes);
    p.personas = nombres.map(n => ({ nombre: resolverNombre(n, ctx, p), monto: cada }));
    p.avisos.push(`Partes iguales entre ${partes} (tú incluido): ${cada} c/u.`);
  } else {
    p.avisos.push('Los montos de las personas no coinciden con los nombres. Pulsa Editar.');
  }
  const deben = (p.personas ?? []).reduce((s, x) => s + x.monto, 0);
  if (deben > total) p.avisos.push('Lo que te deben supera el total del gasto. Pulsa Editar.');
}

// ---------------------------------------------------------------------------------------
// Ingreso
// ---------------------------------------------------------------------------------------

export function ingreso(b: Base, ctx: Contexto): Resultado {
  // + montos positivos, - devoluciones ("-30k" o "le devolví 30k")
  let neto = 0;
  const usados: MontoHallado[] = [];
  for (const m of b.montos.filter(x => x.explicito)) {
    const devuelto = m.negativo || /devolv\w* (?:le |les )?$/.test(b.t.slice(Math.max(0, m.inicio - 14), m.inicio));
    neto += (devuelto ? -1 : 1) * aMinor(m.valor, 'COP');
    usados.push(m);
  }
  if (!usados.length) return error('Me falta el monto del ingreso. Ejemplo: «+mamá 100k».');
  if (neto <= 0) return error('El ingreso neto es cero o negativo. Revisa los montos.');
  const brutos = usados.filter(m => !m.negativo).reduce((s, m) => s + aMinor(m.valor, 'COP'), 0);

  const cuentaId = b.cuentas[0]?.id ?? 'efectivo';
  const texto = b.t.replace(/^\+/, ' ').replace(/(^| )\+/g, ' ');
  const ws = palabrasLibres(texto, [...b.cuentas, ...tramosDe(b.montos)]).filter(
    w => !['ingreso', 'recibi', 'cobre', 'gane', 'mesada', 'me', 'dio', 'dieron', 'pago', 'pagaron', 'deposito', 'transfirio', 'mando', 'envio',
      'devolvi', 'devolvio', 'le', 'les', 'de', 'del', 'y', '-', '+'].includes(w),
  );
  // «+mesada 100k»: si la mesada es lo único que dice, ella es la fuente
  const nombre = nombreEn(ws, ctx, b) ?? (texto.includes('mesada') ? { escrito: 'Mesada', usadas: [] } : null);
  if (!nombre) return error('¿De quién o de qué es el ingreso? Ejemplo: «+mamá 100k» o «ingreso 50k chamba».');

  const p = propuestaBase(b, 'ingreso', `Ingreso de ${nombre.escrito}`, neto, 'COP');
  p.cuentaId = cuentaId;
  p.fuente = nombre.escrito;
  if (brutos !== neto) p.nota = `Recibiste $${brutos} y devolviste $${brutos - neto}: se guarda el neto.`;
  return { clase: 'movimiento', propuesta: p };
}

// ---------------------------------------------------------------------------------------
// Transferencias entre tus cuentas (y cambio de moneda)
// ---------------------------------------------------------------------------------------

export function transferencia(b: Base, ctx: Contexto): Resultado {
  let origen: string;
  let destino: string;
  const [m1, m2] = b.cuentas;
  if (b.cuentas.length >= 2) {
    origen = m1.id; destino = m2.id;
    const entre = b.t.slice(m1.fin, m2.inicio);
    const antes = b.t.slice(0, m1.inicio);
    if (/\b(de|desde)\b/.test(entre) && /\b(a|hacia|para)\s*$/.test(antes)) [origen, destino] = [destino, origen];
  } else if (/\b(saque|retire|retiro)\b/.test(b.t)) {
    origen = m1.id; destino = 'efectivo';
  } else {
    origen = 'efectivo'; destino = m1.id;
  }
  if (origen === destino) return error('El origen y el destino son la misma cuenta.');

  const explicitos = b.montos.filter(m => m.explicito || origen === 'arq' || destino === 'arq');
  const conUsd = explicitos.find(m => m.moneda === 'USD');
  const involucraArq = origen === 'arq' || destino === 'arq';

  const etiqueta = b.etiqueta;
  if (involucraArq) {
    // Cambio de moneda: hace falta cuánto en pesos y cuánto en dólares.
    const usd = conUsd ?? explicitos.find(m => m.valor < 1000 && m.moneda === null && explicitos.length === 2);
    const cop = explicitos.find(m => m !== usd && m.moneda === null);
    if (!usd || !cop) {
      return error(`Para mover plata de/hacia ARQ dime los pesos y los dólares. Ejemplo: «cambio 32000 ${ejemploDeCuenta(ctx)} a arq 8 usd».`);
    }
    const p = propuestaBase(b, 'cambio_moneda', 'Cambio de moneda', 0, 'COP');
    const pesos = aMinor(cop.valor, 'COP');
    const dolares = aMinor(usd.valor, 'USD');
    p.cuentaId = origen; p.cuentaDestinoId = destino;
    if (destino === 'arq') { p.monto = pesos; p.moneda = 'COP'; p.montoOtro = dolares; p.monedaOtra = 'USD'; }
    else { p.monto = dolares; p.moneda = 'USD'; p.montoOtro = pesos; p.monedaOtra = 'COP'; }
    p.etiqueta = etiqueta;
    return { clase: 'movimiento', propuesta: p };
  }

  if (explicitos.length !== 1) return error(`Me falta el monto (uno solo). Ejemplo: «cambio 50k efectivo a ${ejemploDeCuenta(ctx)}».`);
  const p = propuestaBase(b, 'transferencia', 'Transferencia', aMinor(explicitos[0].valor, 'COP'), 'COP');
  p.cuentaId = origen; p.cuentaDestinoId = destino;
  void ctx;
  return { clase: 'movimiento', propuesta: p };
}


// ---------------------------------------------------------------------------------------
// Vuelto en monedas que se olvidó anotar con el pago
// ---------------------------------------------------------------------------------------

const SOLO_VUELTO = /^(?:(?:me|dieron|devolvieron|recibi|el|la|de|del|vuelto|en|monedas?|un|pago|anterior|que|fue|era|eran|ayer|hoy|sobro|y|ya)\s+)*\$?\d[\d.,]*\s?(?:k|mil)?(?:\s+(?:en|de|del|pago|anterior|monedas?|vuelto|que|fue|era|eran|ayer|hoy|y|ya))*$/;

/**
 * «me dieron vuelto 26000 en monedas» dicho solo, después de pagar: el pago quedó anotado sin vuelto,
 * así que esa plata está en el efectivo en vez de en Monedas. Se mueve de Efectivo a Monedas.
 */
export function vueltoSuelto(b: Base): Resultado | null {
  if (!/\bvuelto\b/.test(b.t) || !/\bmonedas?\b/.test(b.t) || !SOLO_VUELTO.test(b.t)) return null;
  const m = b.montos.find(x => x.moneda !== 'USD');
  if (!m) return null;
  const p = propuestaBase(b, 'transferencia', 'Vuelto en monedas', aMinor(m.valor, 'COP'), 'COP');
  p.cuentaId = 'efectivo';
  p.cuentaDestinoId = 'monedas';
  p.nota = 'Vuelto de un pago que ya estaba anotado: pasa del efectivo a las monedas.';
  return { clase: 'movimiento', propuesta: p };
}
