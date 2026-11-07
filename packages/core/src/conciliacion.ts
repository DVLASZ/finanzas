/**
 * Conciliar el extracto del banco con lo que anotaste. Se sube el CSV que baja la página del banco,
 * se marca lo que ya está en la app y se propone, con la frase lista para escribir, lo que falta
 * (el 4x1000, las cuotas, lo que se olvidó anotar). No guarda nada solo.
 */
import { limpiar } from './texto.ts';
import type { Datos } from './repo.ts';
import type { Movimiento } from './tipos.ts';

export interface FilaExtracto { fecha: string; descripcion: string; monto: number }

/** Divide una línea de CSV respetando las comillas. */
function partirLinea(linea: string, sep: string): string[] {
  const celdas: string[] = [];
  let actual = '';
  let comillas = false;
  for (let i = 0; i < linea.length; i++) {
    const c = linea[i];
    if (c === '"') { if (comillas && linea[i + 1] === '"') { actual += '"'; i++; } else comillas = !comillas; }
    else if (c === sep && !comillas) { celdas.push(actual.trim()); actual = ''; }
    else actual += c;
  }
  celdas.push(actual.trim());
  return celdas;
}

/** «1.234,56», «-1,234.56», «$ 12.500», «(500)» -> pesos redondeados. NaN si no es un número. */
export function leerMontoDelBanco(texto: string): number {
  let t = texto.replace(/[$\s]/g, '');
  if (!t) return NaN;
  let neg = false;
  if (/^\(.*\)$/.test(t)) { neg = true; t = t.slice(1, -1); }
  if (t.startsWith('-')) { neg = true; t = t.slice(1); }
  if (!/^[\d.,]+$/.test(t)) return NaN;
  const punto = t.lastIndexOf('.'), coma = t.lastIndexOf(',');
  let decimal = '';
  if (punto >= 0 && coma >= 0) decimal = punto > coma ? '.' : ',';
  else if (coma >= 0) decimal = /,\d{1,2}$/.test(t) ? ',' : '';
  else if (punto >= 0) decimal = /\.\d{1,2}$/.test(t) && (t.match(/\./g) ?? []).length === 1 ? '.' : '';
  const entero = decimal ? t.slice(0, t.lastIndexOf(decimal)) : t;
  const frac = decimal ? t.slice(t.lastIndexOf(decimal) + 1) : '';
  const n = Number(entero.replace(/[.,]/g, '') + (frac ? '.' + frac : ''));
  return Number.isFinite(n) ? Math.round(neg ? -n : n) : NaN;
}

function leerFecha(texto: string): string | null {
  let m = texto.match(/^(\d{4})[-/](\d{1,2})[-/](\d{1,2})/);
  if (m) return `${m[1]}-${m[2].padStart(2, '0')}-${m[3].padStart(2, '0')}`;
  m = texto.match(/^(\d{1,2})[-/](\d{1,2})[-/](\d{2,4})/);
  if (m) return `${m[3].length === 2 ? 2000 + Number(m[3]) : m[3]}-${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')}`;
  return null;
}

/** Lee el CSV del banco: busca la fila de encabezados y las columnas de fecha, descripción y valor (o débito y crédito). */
export function leerExtracto(texto: string): FilaExtracto[] {
  const lineas = texto.replace(/^﻿/, '').split(/\r?\n/).filter(l => l.trim());
  const sep = [';', '\t', ','].map(s => ({ s, n: (lineas.slice(0, 5).join('\n').match(new RegExp(s === '\t' ? '\t' : `\\${s}`, 'g')) ?? []).length })).sort((a, b) => b.n - a.n)[0].s;
  for (const [i, linea] of lineas.entries()) {
    const cab = partirLinea(linea, sep).map(c => limpiar(c));
    const col = (re: RegExp) => cab.findIndex(c => re.test(c));
    const fecha = col(/^(fecha|date)/), valor = col(/^(valor|monto|importe|amount)/);
    const deb = col(/(debito|retiro|cargo)/), cre = col(/(credito|abono|deposito)/);
    if (fecha < 0 || (valor < 0 && deb < 0 && cre < 0)) continue;
    const desc = col(/(descripcion|detalle|concepto|movimiento|description)/);
    const filas: FilaExtracto[] = [];
    for (const l of lineas.slice(i + 1)) {
      const c = partirLinea(l, sep);
      const f = leerFecha(c[fecha] ?? '');
      const monto = valor >= 0 ? leerMontoDelBanco(c[valor] ?? '')
        : (Number.isNaN(leerMontoDelBanco(c[cre] ?? '')) ? 0 : leerMontoDelBanco(c[cre])) - Math.abs(Number.isNaN(leerMontoDelBanco(c[deb] ?? '')) ? 0 : leerMontoDelBanco(c[deb]));
      if (!f || Number.isNaN(monto) || monto === 0) continue;
      filas.push({ fecha: f, descripcion: (desc >= 0 ? c[desc] : '') ?? '', monto });
    }
    return filas;
  }
  return [];
}

export interface Conciliacion {
  encontrados: { fila: FilaExtracto; movimientoId: string }[];
  /** Lo que el banco tiene y la app no: con la frase para anotarlo. */
  faltan: { fila: FilaExtracto; sugerencia: string }[];
  /** Lo anotado en las fechas del extracto que el banco no trae (informativo). */
  soloEnLaApp: Movimiento[];
}

const DIAS_DE_MARGEN = 2;
const dias = (a: string, b: string): number => Math.abs(Date.parse(a.slice(0, 10)) - Date.parse(b.slice(0, 10))) / 86400000;

function sugerir(f: FilaExtracto, clave: string): string {
  const d = limpiar(f.descripcion);
  const monto = Math.abs(f.monto);
  if (f.monto < 0 && /(gravamen|gmf|4 ?x ?1000|impuesto)/.test(d)) return `4x1000 ${monto} ${clave}`;
  if (f.monto < 0 && /(cuota|manejo|comision)/.test(d)) return `cuota de manejo ${monto} ${clave}`;
  const nombre = f.descripcion.replace(/\s+/g, ' ').trim().slice(0, 30);
  return f.monto < 0 ? `${nombre} ${monto} ${clave}` : `ingreso ${monto} ${nombre.replace(new RegExp(clave, 'i'), '').trim()} ${clave}`.replace(/\s+/g, ' ');
}

/** Cruza las filas del extracto con los movimientos de una cuenta (por id o por nombre: «nequi»). */
export function conciliar(datos: Datos, filas: FilaExtracto[], cuenta: string): Conciliacion {
  const c = datos.cuentas.find(x => x.tipo === 'dinero' && (x.id === cuenta || x.clave === limpiar(cuenta)));
  if (!c) throw new Error(`No hay una cuenta «${cuenta}».`);
  const usados = new Set<string>();
  const res: Conciliacion = { encontrados: [], faltan: [], soloEnLaApp: [] };
  const candidatos = datos.movimientos.filter(m => m.estado === 'ok' && m.tipo !== 'apertura' && m.tipo !== 'ajuste' && m.asientos.some(a => a.cuentaId === c.id));
  for (const f of filas) {
    const m = candidatos.find(x => !usados.has(x.id) && dias(x.ocurridoEn, f.fecha) <= DIAS_DE_MARGEN
      && x.asientos.some(a => a.cuentaId === c.id && a.moneda === 'COP' && a.monto === f.monto));
    if (m) { usados.add(m.id); res.encontrados.push({ fila: f, movimientoId: m.id }); }
    else res.faltan.push({ fila: f, sugerencia: sugerir(f, c.clave) });
  }
  if (filas.length) {
    const desde = filas.map(f => f.fecha).sort()[0], hasta = filas.map(f => f.fecha).sort().slice(-1)[0];
    res.soloEnLaApp = candidatos.filter(m => !usados.has(m.id) && m.ocurridoEn.slice(0, 10) >= desde && m.ocurridoEn.slice(0, 10) <= hasta);
  }
  return res;
}
