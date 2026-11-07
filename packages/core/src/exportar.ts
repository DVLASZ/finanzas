/**
 * Exportar a Excel. Arma un archivo .xlsx sin librerías: un .xlsx es un zip de archivos XML y para
 * este uso basta guardar el zip sin comprimir. Funciona igual en el navegador y en Node.
 */
import { hayTrabajadores, pagosATrabajadores } from './trabajadores.ts';
import { deudasPorPersona, resumenSaldos } from './consultas.ts';
import type { Datos } from './repo.ts';
import type { Movimiento } from './tipos.ts';

export type Celda = string | number | null;
export interface Hoja { nombre: string; filas: Celda[][]; anchos?: number[] }

// ---------------------------------------------------------------------------------------
// zip sin compresión
// ---------------------------------------------------------------------------------------

const TABLA_CRC = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  return t;
})();

function crc32(b: Uint8Array): number {
  let c = 0xffffffff;
  for (let i = 0; i < b.length; i++) c = TABLA_CRC[(c ^ b[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function zip(archivos: { nombre: string; datos: Uint8Array }[]): Uint8Array {
  const partes: Uint8Array[] = [];
  const central: Uint8Array[] = [];
  let pos = 0;
  const cod = new TextEncoder();
  const escribe = (n: number, ...campos: [number, number][]) => {
    const b = new Uint8Array(n);
    const v = new DataView(b.buffer);
    let o = 0;
    for (const [tam, valor] of campos) {
      if (tam === 2) v.setUint16(o, valor, true); else v.setUint32(o, valor, true);
      o += tam;
    }
    return b;
  };
  for (const a of archivos) {
    const nombre = cod.encode(a.nombre);
    const crc = crc32(a.datos);
    const cab = escribe(30, [4, 0x04034b50], [2, 20], [2, 0x0800], [2, 0], [2, 0], [2, 0x21], [4, crc], [4, a.datos.length], [4, a.datos.length], [2, nombre.length], [2, 0]);
    partes.push(cab, nombre, a.datos);
    central.push(
      escribe(46, [4, 0x02014b50], [2, 20], [2, 20], [2, 0x0800], [2, 0], [2, 0], [2, 0x21], [4, crc], [4, a.datos.length], [4, a.datos.length], [2, nombre.length], [2, 0], [2, 0], [2, 0], [2, 0], [4, 0], [4, pos]),
      nombre,
    );
    pos += cab.length + nombre.length + a.datos.length;
  }
  const tamCentral = central.reduce((s, x) => s + x.length, 0);
  const fin = escribe(22, [4, 0x06054b50], [2, 0], [2, 0], [2, archivos.length], [2, archivos.length], [4, tamCentral], [4, pos], [2, 0]);
  const todo = [...partes, ...central, fin];
  const salida = new Uint8Array(todo.reduce((s, x) => s + x.length, 0));
  let o = 0;
  for (const x of todo) { salida.set(x, o); o += x.length; }
  return salida;
}

// ---------------------------------------------------------------------------------------
// xlsx
// ---------------------------------------------------------------------------------------

const xml = (s: string): string => s.replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c] ?? c).replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g, '');

/** A, B, ... Z, AA. */
const letra = (i: number): string => (i >= 26 ? letra(Math.floor(i / 26) - 1) : '') + String.fromCharCode(65 + (i % 26));

function xmlHoja(h: Hoja): string {
  const filas = h.filas.map((fila, r) => {
    const celdas = fila.map((v, c) => {
      const ref = `${letra(c)}${r + 1}`;
      const estilo = r === 0 ? ' s="1"' : typeof v === 'number' ? ' s="2"' : '';
      if (v === null || v === '') return '';
      if (typeof v === 'number') return `<c r="${ref}"${estilo}><v>${v}</v></c>`;
      return `<c r="${ref}"${estilo} t="inlineStr"><is><t xml:space="preserve">${xml(v)}</t></is></c>`;
    }).join('');
    return `<row r="${r + 1}">${celdas}</row>`;
  }).join('');
  const anchos = h.anchos?.length ? `<cols>${h.anchos.map((a, i) => `<col min="${i + 1}" max="${i + 1}" width="${a}" customWidth="1"/>`).join('')}</cols>` : '';
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetViews><sheetView workbookViewId="0"><pane ySplit="1" topLeftCell="A2" activePane="bottomLeft" state="frozen"/></sheetView></sheetViews>${anchos}<sheetData>${filas}</sheetData></worksheet>`;
}

/** Nombres de hoja válidos en Excel: sin : \ / ? * [ ], hasta 31 letras. */
const nombreDeHoja = (n: string): string => n.replace(/[:\\/?*[\]]/g, ' ').slice(0, 31) || 'Hoja';

export function crearXlsx(hojas: Hoja[]): Uint8Array {
  const cod = new TextEncoder();
  const a = (nombre: string, texto: string) => ({ nombre, datos: cod.encode(texto) });
  const cab = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>';
  return zip([
    a('[Content_Types].xml', `${cab}<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>${hojas.map((_, i) => `<Override PartName="/xl/worksheets/sheet${i + 1}.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>`).join('')}</Types>`),
    a('_rels/.rels', `${cab}<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>`),
    a('xl/workbook.xml', `${cab}<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets>${hojas.map((h, i) => `<sheet name="${xml(nombreDeHoja(h.nombre))}" sheetId="${i + 1}" r:id="rId${i + 1}"/>`).join('')}</sheets></workbook>`),
    a('xl/_rels/workbook.xml.rels', `${cab}<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">${hojas.map((_, i) => `<Relationship Id="rId${i + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet${i + 1}.xml"/>`).join('')}<Relationship Id="rId${hojas.length + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>`),
    a('xl/styles.xml', `${cab}<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><numFmts count="1"><numFmt numFmtId="164" formatCode="#,##0.##"/></numFmts><fonts count="2"><font><sz val="11"/><name val="Calibri"/></font><font><b/><sz val="11"/><name val="Calibri"/></font></fonts><fills count="2"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill></fills><borders count="1"><border><left/><right/><top/><bottom/><diagonal/></border></borders><cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs><cellXfs count="3"><xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/><xf numFmtId="0" fontId="1" fillId="0" borderId="0" xfId="0" applyFont="1"/><xf numFmtId="164" fontId="0" fillId="0" borderId="0" xfId="0" applyNumberFormat="1"/></cellXfs></styleSheet>`),
    ...hojas.map((h, i) => a(`xl/worksheets/sheet${i + 1}.xml`, xmlHoja(h))),
  ]);
}

// ---------------------------------------------------------------------------------------
// los datos de la app, en hojas
// ---------------------------------------------------------------------------------------

const TIPOS: Record<string, string> = {
  gasto: 'Gasto', ingreso: 'Ingreso', transferencia: 'Pasar plata', prestamo: 'Préstamo', deuda: 'Deuda', pago: 'Pago de deuda',
  compartido: 'Gasto compartido', apertura: 'Saldo inicial', ajuste: 'Cuadre', cambio_moneda: 'Cambio de moneda',
};

/** El monto en la unidad de la moneda: pesos tal cual, dólares en centavos pasan a dólares. */
const unidad = (monto: number, moneda: string): number => (moneda === 'USD' ? monto / 100 : monto);

function filaDeMovimiento(m: Movimiento, tipoDe: Map<string, { nombre: string; tipo: string }>): Celda[] {
  let gasto = 0;
  let ingreso = 0;
  let moneda = 'COP';
  const categorias = new Set<string>();
  const cuentas = new Set<string>();
  const personas = new Set<string>();
  for (const x of m.asientos) {
    const c = tipoDe.get(x.cuentaId);
    if (!c) continue;
    if (c.tipo === 'categoria') { gasto += unidad(x.monto, x.moneda); categorias.add(c.nombre); moneda = x.moneda; }
    else if (c.tipo === 'fuente') { ingreso -= unidad(x.monto, x.moneda); moneda = x.moneda; }
    else if (c.tipo === 'dinero') cuentas.add(c.nombre);
    else if (c.tipo === 'persona') personas.add(c.nombre);
  }
  // pasar plata, préstamos y pagos no son gasto ni ingreso: el monto es lo que se movió
  if (!gasto && !ingreso) {
    const dinero = m.asientos.filter(x => tipoDe.get(x.cuentaId)?.tipo === 'dinero');
    const entra = dinero.filter(x => x.monto > 0).reduce((s, x) => s + unidad(x.monto, x.moneda), 0);
    const sale = dinero.filter(x => x.monto < 0).reduce((s, x) => s - unidad(x.monto, x.moneda), 0);
    const movido = Math.max(entra, sale);
    return [m.ocurridoEn.slice(0, 16), TIPOS[m.tipo] ?? m.tipo, m.descripcion, '', [...cuentas].join(', '), [...personas].join(', '), null, null, movido || null, moneda, m.estado === 'ok' ? 'Vigente' : 'Anulado'];
  }
  return [m.ocurridoEn.slice(0, 16), TIPOS[m.tipo] ?? m.tipo, m.descripcion, [...categorias].join(', '), [...cuentas].join(', '), [...personas].join(', '), gasto || null, ingreso || null, null, moneda, m.estado === 'ok' ? 'Vigente' : 'Anulado'];
}

/** Las hojas del libro de Excel con todo lo de la app. */
export function hojasDeDatos(datos: Datos): Hoja[] {
  const tipoDe = new Map(datos.cuentas.map(c => [c.id, { nombre: c.nombre, tipo: c.tipo }]));
  const apertura = datos.config.fecha_apertura ?? '2000-01-01 00:00:00';
  const movs = [...datos.movimientos].sort((a, b) => a.ocurridoEn.localeCompare(b.ocurridoEn));

  const hojaMovs: Hoja = {
    nombre: 'Movimientos',
    anchos: [17, 16, 34, 20, 20, 18, 14, 14, 14, 9, 10],
    filas: [['Fecha', 'Tipo', 'Qué fue', 'Categoría', 'Cuenta', 'Persona', 'Gasto', 'Ingreso', 'Se movió', 'Moneda', 'Estado'], ...movs.map(m => filaDeMovimiento(m, tipoDe))],
  };

  const r = resumenSaldos(datos.movimientos, datos.cuentas, apertura);
  const hojaSaldos: Hoja = {
    nombre: 'Saldos',
    anchos: [26, 9, 16],
    filas: [['Cuenta', 'Moneda', 'Saldo'], ...r.cuentas.map(x => [x.cuenta.nombre, x.cuenta.moneda, unidad(x.saldo, x.cuenta.moneda)])],
  };

  const hojaDeudas: Hoja = {
    nombre: 'Deudas',
    anchos: [24, 12, 16, 9, 30],
    filas: [
      ['Persona', 'Quién debe', 'Monto', 'Moneda', 'Motivo'],
      ...deudasPorPersona(datos.movimientos, datos.cuentas, datos.compromisos, apertura).flatMap(d => {
        const motivo = d.compromisos[0]?.motivo ?? '';
        const filas: (string | number)[][] = [];
        // la plata de otros que tienes para gastarla por ellos no es deuda tuya: va en su propia fila
        if (d.deOtros > 0) filas.push([d.persona.nombre, 'Plata de otros', unidad(d.deOtros, d.moneda), d.moneda, motivo]);
        const deuda = d.saldo < 0 ? -d.saldo - d.deOtros : d.saldo;
        if (deuda > 0) filas.push([d.persona.nombre, d.saldo > 0 ? 'Te debe' : 'Le debes', unidad(deuda, d.moneda), d.moneda, d.deOtros > 0 ? '' : motivo]);
        return filas;
      }),
    ],
  };

  // gastos e ingresos por mes (en pesos), solo movimientos vigentes
  const meses = new Map<string, { gastos: number; ingresos: number }>();
  for (const m of movs) {
    if (m.estado !== 'ok') continue;
    const f = filaDeMovimiento(m, tipoDe);
    if (f[9] !== 'COP') continue;
    const mes = m.ocurridoEn.slice(0, 7);
    const acum = meses.get(mes) ?? { gastos: 0, ingresos: 0 };
    acum.gastos += Number(f[6] ?? 0);
    acum.ingresos += Number(f[7] ?? 0);
    meses.set(mes, acum);
  }
  const hojaMeses: Hoja = {
    nombre: 'Por mes',
    anchos: [12, 16, 16, 16],
    filas: [['Mes', 'Gastos', 'Ingresos', 'Balance'], ...[...meses.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([mes, v]) => [mes, v.gastos, v.ingresos, v.ingresos - v.gastos])],
  };

  // pagos a trabajadores por semana (solo donde hay trabajadores)
  const hojas = [hojaMovs, hojaSaldos, hojaDeudas, hojaMeses];
  if (hayTrabajadores(datos.cuentas, datos.movimientos)) {
    const lunesDe = (dia: string): string => {
      const d = new Date(`${dia}T00:00:00Z`);
      d.setUTCDate(d.getUTCDate() - ((d.getUTCDay() + 6) % 7));
      return d.toISOString().slice(0, 10);
    };
    const filas = new Map<string, { semana: string; nombre: string; veces: number; total: number }>();
    for (const m of movs) {
      const semana = lunesDe(m.ocurridoEn.slice(0, 10));
      const [lun] = [semana];
      for (const p of pagosATrabajadores([m], datos.cuentas, m.ocurridoEn, m.ocurridoEn + '~')) {
        const clave = `${lun}|${p.nombre}`;
        const previo = filas.get(clave) ?? { semana: lun, nombre: p.nombre, veces: 0, total: 0 };
        previo.veces += p.veces; previo.total += p.total;
        filas.set(clave, previo);
      }
    }
    hojas.push({
      nombre: 'Trabajadores',
      anchos: [14, 22, 8, 16],
      filas: [['Semana (lunes)', 'Trabajador', 'Pagos', 'Total'], ...[...filas.values()].sort((a, b) => a.semana.localeCompare(b.semana) || a.nombre.localeCompare(b.nombre)).map(x => [x.semana, x.nombre, x.veces, x.total])],
    });
  }
  return hojas;
}

/** El archivo .xlsx listo para descargar. */
export const excelDeDatos = (datos: Datos): Uint8Array => crearXlsx(hojasDeDatos(datos));
