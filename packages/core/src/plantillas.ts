/**
 * Plantillas de instalación. Cada app nace de una: sus cuentas, categorías, palabras que ya sabe,
 * atajos y grupos de personas. Hay tres:
 *
 *  - `personal`: la de uso personal (la semilla de siempre).
 *  - `familia`: los gastos de una casa con campo y trabajadores (arriendo, servicios, jornales, reparaciones...),
 *    con alcancía de monedas y dos bancos.
 *  - `empresa`: un negocio pequeño o una organización (insumos, impuestos, ventas con catálogo de productos).
 *    Solo maneja efectivo y monedas: lo que llega por transferencia de alguna persona se pasa a efectivo al final.
 *
 * Lo propio de cada instalación (los nombres de sus personas, sus precios) NO va aquí: va en
 * instalaciones/<nombre>.json, que no se sube a git.
 */
import { categoria, dinero, sistema, ATAJOS_INICIALES, CONFIG_INICIAL, CUENTAS_INICIALES } from './semilla.ts';
import { idPersona } from './entidades.ts';
import { normalizar } from './texto.ts';
import type { Aprendido, Atajo, Cuenta } from './tipos.ts';

export interface Plantilla {
  id: string;
  nombre: string;
  cuentas: Cuenta[];
  atajos: Atajo[];
  config: Record<string, string>;
  /** Palabra ya normalizada (sin tildes) a la categoría donde va. */
  aprendido: Record<string, Aprendido>;
}

/** Lo que pone cada persona al instalar (instalaciones/<nombre>.json). */
export interface DatosDeInstalacion {
  personas?: { nombre: string; grupo: string }[];
  aprendido?: Record<string, Aprendido>;
  config?: Record<string, string>;
}

/** Lo que el banco cobra por su cuenta: el 4x1000 (se reescribe a «gravamen» en el parser), cuotas y comisiones. */
const BANCO = ['gravamen', 'gmf', 'manejo', 'comision', 'comisiones', 'sobregiro'];

const SISTEMA: Cuenta[] = [
  sistema('sys:apertura', 'Apertura', 'apertura', 'COP'),
  sistema('sys:cambio-cop', 'Cambio de moneda COP', 'cambio cop', 'COP'),
  sistema('sys:cambio-usd', 'Cambio de moneda USD', 'cambio usd', 'USD'),
];

/** «arriendo celular» -> { palabra: categoría } para varias palabras de una misma categoría. */
const palabras = (categoriaId: string, lista: string[]): Record<string, Aprendido> =>
  Object.fromEntries(lista.map(p => [p, { categoriaId }]));

const personal: Plantilla = {
  id: 'personal',
  nombre: 'Personal',
  cuentas: CUENTAS_INICIALES,
  atajos: ATAJOS_INICIALES,
  config: CONFIG_INICIAL,
  aprendido: {},
};

const familia: Plantilla = {
  id: 'familia',
  nombre: 'Familia: casa, campo y trabajo',
  cuentas: [
    dinero('efectivo', 'Efectivo', 'COP', true),
    dinero('monedas', 'Monedas', 'COP', false),
    dinero('bancolombia', 'Bancolombia', 'COP', true),
    dinero('banco-bogota', 'Banco de Bogotá', 'COP', true),
    dinero('alcancia', 'Alcancía', 'COP', false), // monedas guardadas en el armario: se ven aparte, no suman al disponible
    categoria('cat:arriendo', 'Arriendo'),
    categoria('cat:servicios', 'Servicios'),
    categoria('cat:mercado', 'Mercado y aseo'),
    categoria('cat:comida', 'Comida'),
    categoria('cat:transporte', 'Transporte'),
    categoria('cat:gasolina', 'Gasolina'),
    categoria('cat:salud', 'Salud'),
    categoria('cat:reparaciones', 'Reparaciones'),
    categoria('cat:jornales', 'Jornales'),
    categoria('cat:finca', 'Finca'),
    categoria('cat:insumos', 'Insumos del negocio'),
    categoria('cat:hijo', 'Hijo'),
    categoria('cat:regalos', 'Regalos'),
    categoria('cat:personal', 'Personal'),
    categoria('cat:aportes', 'Aportes y rifas'),
    categoria('cat:mascotas', 'Mascotas'),
    categoria('cat:estudio', 'Estudio'),
    categoria('cat:contador', 'Contador e impuestos'),
    categoria('cat:banco', 'Costos del banco'), // el 4x1000 y las cuotas: el banco las descuenta solo
    categoria('cat:otros', 'Otros'),
    categoria('cat:cooperativa', 'Aporte Cooperativa'), // pago mensual: es un gasto, no un saldo
    categoria('cat:descuadre', 'Descuadre'),
    ...SISTEMA,
  ],
  atajos: [],
  config: {
    fecha_apertura: '2000-01-01 00:00:00',
    moneda_base: 'COP',
    meta_ahorro_pct: '35',
    // «transferencia» y «bancolombia» son la misma cuenta; «bogota», la otra
    alias_cuentas: JSON.stringify({ bancolombia: ['bancolombia', 'bancol', 'transferencia'], 'banco-bogota': ['bogota', 'bbogota'] }),
  },
  aprendido: {
    ...palabras('cat:arriendo', ['arriendo', 'alquiler']),
    ...palabras('cat:servicios', ['celular', 'internet', 'agua', 'luz', 'energia', 'acueducto', 'gas', 'minutos']),
    ...palabras('cat:mercado', ['mercado', 'jabon', 'aseo', 'arroz', 'azucar', 'sal', 'papel', 'higienico', 'cepillo', 'crema', 'galeria', 'limpido', 'limpieza']),
    ...palabras('cat:comida', ['arepas', 'envueltos', 'pan', 'frutas', 'fruta', 'desayuno', 'almuerzo', 'cena', 'comida', 'tinto', 'jugo', 'chorizos', 'empanadas', 'queso', 'mecato']),
    ...palabras('cat:gasolina', ['gasolina', 'combustible', 'acpm']),
    ...palabras('cat:salud', ['medicamentos', 'medicina', 'drogas', 'drogueria', 'examenes', 'doctor']),
    ...palabras('cat:reparaciones', ['reparacion', 'reparar', 'arreglo', 'arreglar', 'repuesto', 'repuestos', 'llanta']),
    ...palabras('cat:jornales', ['jornal', 'jornales', 'jornalero']),
    ...palabras('cat:finca', ['abono', 'herramienta', 'herramientas', 'machete', 'fertilizante', 'bultos', 'finca']),
    ...palabras('cat:insumos', ['botellas', 'botella', 'empaques', 'etiquetas', 'envases']),
    ...palabras('cat:hijo', ['matricula']),
    ...palabras('cat:regalos', ['regalo', 'regalos', 'cumpleanos']),
    ...palabras('cat:personal', ['ropa', 'zapatos']),
    ...palabras('cat:cooperativa', ['cooperativa']),
    ...palabras('cat:aportes', ['rifa', 'rifas', 'limosna', 'aporte', 'aportes', 'iglesia', 'colectas']),
    ...palabras('cat:mascotas', ['mascota', 'mascotas', 'perro', 'gato', 'veterinario']),
    ...palabras('cat:estudio', ['curso', 'cursos', 'fotocopias', 'cuaderno', 'cuadernos', 'utiles']),
    ...palabras('cat:contador', ['contador', 'dian', 'impuesto', 'impuestos', 'renta']),
    ...palabras('cat:banco', BANCO),
  },
};

const empresa: Plantilla = {
  id: 'empresa',
  nombre: 'Empresa',
  cuentas: [
    dinero('efectivo', 'Efectivo', 'COP', true),
    dinero('monedas', 'Monedas', 'COP', false),
    dinero('otras-cuentas', 'En otras cuentas', 'COP', true), // plata del negocio guardada en cuentas personales de los socios
    categoria('cat:insumos', 'Insumos'),
    categoria('cat:materia-prima', 'Materia prima'),
    categoria('cat:impuestos', 'Impuestos y trámites'),
    categoria('cat:transporte-eventos', 'Transporte a eventos'),
    categoria('cat:servicios', 'Servicios'),
    categoria('cat:publicidad', 'Publicidad'),
    categoria('cat:banco', 'Costos del banco'),
    categoria('cat:retiros', 'Retiros de los socios'),
    categoria('cat:otros', 'Otros'),
    categoria('cat:descuadre', 'Descuadre'),
    ...SISTEMA,
  ],
  atajos: [],
  config: {
    fecha_apertura: '2000-01-01 00:00:00',
    moneda_base: 'COP',
    meta_ahorro_pct: '0',
    ventas: '1', // la app muestra los productos y entiende vendí 3 botellas
    // «cambio 100000 efectivo a personal» pasa plata a la cuenta personal de una socio
    alias_cuentas: JSON.stringify({ 'otras-cuentas': ['personal', 'personales'] }),
    grupos: JSON.stringify([
      { id: 'socios', nombre: 'Socios' }, { id: 'clientes', nombre: 'Clientes' }, { id: 'proveedores', nombre: 'Proveedores' }, { id: 'otros', nombre: 'Otros' },
    ]),
  },
  aprendido: {
    ...palabras('cat:insumos', ['botellas', 'botella', 'empaques', 'etiquetas', 'envases', 'bolsas']),
    ...palabras('cat:materia-prima', ['harina', 'jugo', 'azucar', 'ingredientes']),
    ...palabras('cat:impuestos', ['impuesto', 'impuestos', 'camara', 'tramite', 'tramites', 'rut', 'renovacion']),
    ...palabras('cat:transporte-eventos', ['feria', 'evento', 'eventos', 'flete', 'transporte']),
    ...palabras('cat:servicios', ['celular', 'internet', 'luz', 'agua']),
    ...palabras('cat:publicidad', ['publicidad', 'volantes', 'afiches', 'pendon']),
    ...palabras('cat:banco', BANCO),
  },
};

export const PLANTILLAS: Record<string, Plantilla> = { personal, familia, empresa };

const q = (v: string | number | null | undefined): string =>
  v === null || v === undefined ? 'NULL' : typeof v === 'number' ? String(v) : `'${String(v).replaceAll("'", "''")}'`;

/** Las cuentas, atajos, palabras y config de una plantilla (más lo propio de la instalación) como SQL para D1. */
export function sqlDePlantilla(id: string, extra: DatosDeInstalacion = {}): string {
  const pl = PLANTILLAS[id];
  if (!pl) throw new Error(`No existe la plantilla «${id}».`);
  const personas: Cuenta[] = (extra.personas ?? []).map(p => ({
    id: idPersona(p.nombre), nombre: p.nombre, clave: normalizar(p.nombre), tipo: 'persona', moneda: 'COP', grupo: p.grupo,
  }));
  const l: string[] = [];
  for (const c of [...pl.cuentas, ...personas]) {
    l.push(`INSERT INTO cuentas (id, nombre, clave, tipo, moneda, grupo, fijo, en_disponible) VALUES (${[
      q(c.id), q(c.nombre), q(c.clave), q(c.tipo), q(c.moneda ?? 'COP'), q(c.grupo ?? null), c.fijo ? 1 : 0, c.enDisponible === false ? 0 : 1,
    ].join(', ')});`);
  }
  for (const a of pl.atajos) {
    l.push(`INSERT INTO atajos (palabra, concepto, monto, moneda, categoria_id, cuenta_id) VALUES (${[
      q(a.palabra), q(a.concepto), a.monto ?? null, q(a.moneda), q(a.categoriaId ?? null), q(a.cuentaId ?? null),
    ].join(', ')});`);
  }
  for (const [palabra, a] of Object.entries({ ...pl.aprendido, ...(extra.aprendido ?? {}) })) {
    l.push(`INSERT INTO aprendido (palabra, categoria_id, cuenta_id) VALUES (${q(palabra)}, ${q(a.categoriaId ?? null)}, ${q(a.cuentaId ?? null)});`);
  }
  for (const [clave, valor] of Object.entries({ ...pl.config, ...(extra.config ?? {}) })) l.push(`INSERT INTO config (clave, valor) VALUES (${q(clave)}, ${q(valor)});`);
  return l.join('\n') + '\n';
}

/**
 * Pone al día una copia local vieja con su plantilla: agrega las cuentas y ajustes que le faltan y
 * quita las cuentas de dinero que la plantilla ya no tiene (si nunca se usaron). Solo para la app
 * cuando no está conectada a un servidor; con servidor, mandan los datos del servidor.
 * Devuelve true si cambió algo.
 */
export function alinearConPlantilla(
  datos: { cuentas: Cuenta[]; movimientos: { asientos: { cuentaId: string }[] }[]; config: Record<string, string> },
  id: string,
): boolean {
  const pl = PLANTILLAS[id];
  if (!pl) return false;
  let cambio = false;
  const ids = new Set(datos.cuentas.map(c => c.id));
  for (const c of pl.cuentas) {
    if (ids.has(c.id)) continue;
    datos.cuentas.push(structuredClone(c));
    cambio = true;
  }
  const deLaPlantilla = new Set(pl.cuentas.map(c => c.id));
  const usadas = new Set(datos.movimientos.flatMap(m => m.asientos.map(a => a.cuentaId)));
  const antes = datos.cuentas.length;
  datos.cuentas = datos.cuentas.filter(c => c.tipo !== 'dinero' || deLaPlantilla.has(c.id) || usadas.has(c.id));
  if (datos.cuentas.length !== antes) cambio = true;
  for (const [k, v] of Object.entries(pl.config)) {
    if (k in datos.config) continue;
    datos.config[k] = v;
    cambio = true;
  }
  return cambio;
}
