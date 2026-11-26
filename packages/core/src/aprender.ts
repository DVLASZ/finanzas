/**
 * Escudo de aprendizaje: «aprende que "pastilla" es salud» enseña una palabra al bot. Una regla mala (una palabra que
 * significa mil cosas, una fecha, una cuenta) dañaría todos los gastos futuros, así que antes de guardar se revisa,
 * y lo que choca con el diccionario se confirma con la persona. Funciones puras: quien las llama guarda.
 */
import { aliasDeCuentas, categoriaPorNombre, categorizar, cuentaDePalabra } from './entidades.ts';
import { normalizar } from './texto.ts';
import type { Contexto } from './tipos.ts';

export type Veredicto =
  | { tipo: 'guardar'; palabra: string; categoriaId: string; texto: string }
  | { tipo: 'confirmar'; palabra: string; categoriaId: string; texto: string }
  | { tipo: 'rechazo'; texto: string };

/** Tope de palabras enseñadas: la lista se lee entera en cada mensaje. */
export const MAX_APRENDIDAS = 300;

/** Palabras que sirven para cualquier gasto: aprenderlas mandaría todo a una sola categoría. */
const GENERICAS = new Set([
  'pago', 'pagos', 'pague', 'cosa', 'cosas', 'gasto', 'gastos', 'compra', 'compras', 'plata', 'dinero', 'cobro',
  'ingreso', 'movimiento', 'algo', 'varios', 'otro', 'otros', 'otra', 'esto', 'eso', 'cuenta', 'monto', 'valor',
  'total', 'item', 'tema', 'asunto', 'detalle', 'nada', 'todo',
]);

/** Fechas y periodos: cambian de significado cada día, una regla sobre ellas es siempre un error. */
const TEMPORALES = new Set([
  'hoy', 'ayer', 'anteayer', 'manana', 'pasado', 'ahora', 'luego', 'despues', 'antes', 'semana', 'mes', 'ano', 'dia', 'dias',
  'quincena', 'noche', 'tarde', 'madrugada', 'fin', 'finde',
  'lunes', 'martes', 'miercoles', 'jueves', 'viernes', 'sabado', 'domingo',
  'enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'setiembre', 'octubre', 'noviembre', 'diciembre',
]);

/** Palabras con varios sentidos según quién las diga: «plan» es de celular o de cine, «cuota» de un carro o de una cena. */
const AMBIGUAS = new Set([
  'plan', 'planes', 'servicio', 'servicios', 'cuota', 'cuotas', 'recibo', 'recibos', 'factura', 'facturas', 'arreglo', 'arreglos',
  'tramite', 'tramites', 'vuelta', 'vueltas', 'diligencia', 'mensualidad', 'abono', 'abonos', 'pasaje', 'regalo', 'prestamo',
  'ayuda', 'saldo', 'deshacer', 'ok', 'si', 'no',
]);

/** Cómo se puede decir una categoría que en esta app tiene otro nombre. */
const SINONIMOS: Record<string, string> = { educacion: 'cat:universidad', estudio: 'cat:universidad', estudios: 'cat:universidad' };

const nombreDe = (ctx: Contexto, id: string): string => ctx.cuentas.find(c => c.id === id)?.nombre ?? id;

/** La categoría que nombra el texto («educación aunque sea...» da Universidad): se prueban las primeras palabras, de más a menos. */
function categoriaDicha(texto: string, ctx: Contexto): string | null {
  const ws = normalizar(texto).replace(/[^a-z0-9 ]/g, ' ').split(/\s+/).filter(Boolean);
  for (let n = Math.min(3, ws.length); n >= 1; n--) {
    const frase = ws.slice(0, n).join(' ');
    const c = categoriaPorNombre(frase, ctx);
    if (c) return c.id;
    if (n === 1 && SINONIMOS[frase] && ctx.cuentas.some(x => x.id === SINONIMOS[frase])) return SINONIMOS[frase];
  }
  return null;
}

const rechazo = (texto: string): Veredicto => ({ tipo: 'rechazo', texto });

/** Revisa «aprende que X es Y». `palabraCruda` y `categoriaCruda` son lo que escribió la persona. */
export function evaluarAprendizaje(palabraCruda: string, categoriaCruda: string, ctx: Contexto): Veredicto {
  const dicha = palabraCruda.trim().replace(/^["'«»“”]+|["'«»“”]+$/g, '').trim();
  const palabra = normalizar(dicha).replace(/[^a-z0-9 ]/g, ' ').replace(/\s+/g, ' ').trim();
  const regla = `No la guardo como regla`;

  if (!palabra) return rechazo(`Dime qué palabra quieres que aprenda, por ejemplo: «aprende que "pastilla" es salud».`);
  if (palabra.includes(' ')) return rechazo(`${regla}: aprendo de a una palabra por vez. Prueba con la más específica, por ejemplo la marca o el producto.`);
  if (/\d/.test(palabra) || palabra.length < 3) return rechazo(`${regla}: «${dicha}» es muy corta o lleva números. Para aprender necesito una palabra concreta, como «pastilla» o «peluqueria».`);
  if (GENERICAS.has(palabra)) return rechazo(`No voy a aprender «${dicha}» como regla: sirve para casi cualquier gasto y mandaría todo a una sola categoría. Dame una palabra más específica.`);
  if (TEMPORALES.has(palabra)) return rechazo(`No voy a aprender «${dicha}» como regla: es una fecha o un periodo, y eso cambia cada día. Aprendo palabras de cosas, como «pastilla».`);
  if (AMBIGUAS.has(palabra)) return rechazo(`No voy a aprender «${dicha}» como regla: puede ser muchas cosas distintas según el caso. Prefiero una palabra más concreta.`);

  const esCuenta = cuentaDePalabra(palabra, aliasDeCuentas(ctx)) !== null
    || ctx.cuentas.some(c => (c.tipo === 'dinero' || c.tipo === 'persona') && normalizar(c.clave).split(' ').includes(palabra));
  if (esCuenta) return rechazo(`No voy a aprender «${dicha}» como regla: es el nombre de una cuenta o de una persona, no de un tipo de gasto.`);

  const categoriaId = categoriaDicha(categoriaCruda, ctx);
  if (!categoriaId) return rechazo(`No encontré esa categoría para aprender «${dicha}». Dime una que ya tengas, por ejemplo «aprende que "${dicha}" es salud».`);
  const cat = nombreDe(ctx, categoriaId);

  const actual = categorizar(palabra, ctx);
  if (actual === categoriaId) return rechazo(`Eso ya lo sé: «${dicha}» va en ${cat}, no hace falta una regla nueva.`);
  if (actual) {
    return {
      tipo: 'confirmar', palabra, categoriaId,
      texto: `${dicha[0].toUpperCase()}${dicha.slice(1)} ya va en ${nombreDe(ctx, actual)}. ¿Seguro que quieres cambiarlo a ${cat}? Sería una regla nueva tuya.`,
    };
  }
  if (Object.keys(ctx.aprendido).length >= MAX_APRENDIDAS) return rechazo(`Ya aprendí muchas palabras (${MAX_APRENDIDAS}) y no puedo guardar otra regla.`);
  return { tipo: 'guardar', palabra, categoriaId, texto: `Listo, aprendí que «${dicha}» va en ${cat}. Desde ahora lo pongo ahí.` };
}

/** Lo que el bot devuelve: un texto y, si pide confirmar, los botones (misma forma que `Salida`). */
export interface RespuestaAprender { texto: string; botones?: { id: string; titulo: string }[] }

type Guardador = { guardarAprendido(palabra: string, valor: { categoriaId: string }): Promise<void> };

/** Atiende «aprende que X es Y» (arg «X|Y»): guarda si es sana, pide confirmar si choca, o explica por qué no. */
export async function alAprender(arg: string, ctx: Contexto, repo: Guardador): Promise<RespuestaAprender[]> {
  const [palabra = '', categoria = ''] = arg.split('|');
  const v = evaluarAprendizaje(palabra, categoria, ctx);
  if (v.tipo === 'rechazo') return [{ texto: v.texto }];
  if (v.tipo === 'confirmar') {
    return [{ texto: v.texto, botones: [{ id: `aprende!:${v.palabra}|${v.categoriaId}`, titulo: 'Sí, cambiarlo' }, { id: 'no', titulo: 'No' }] }];
  }
  await guardar(v.palabra, v.categoriaId, ctx, repo);
  return [{ texto: v.texto }];
}

async function guardar(palabra: string, categoriaId: string, ctx: Contexto, repo: Guardador): Promise<void> {
  await repo.guardarAprendido(palabra, { categoriaId });
  ctx.aprendido[palabra] = { categoriaId };
}

/** El botón «Sí, cambiarlo» (id «aprende!:palabra|categoría»): se vuelve a revisar y se guarda. */
export async function alConfirmarAprender(dato: string, ctx: Contexto, repo: Guardador): Promise<RespuestaAprender[]> {
  const [palabra = '', categoriaId = ''] = dato.split('|');
  if (!/^[a-z0-9]{3,}$/.test(palabra) || !ctx.cuentas.some(c => c.id === categoriaId && c.tipo === 'categoria')) return [{ texto: 'Ya no puedo aplicar esa regla.' }];
  await guardar(palabra, categoriaId, ctx, repo);
  const nombre = ctx.cuentas.find(c => c.id === categoriaId)?.nombre ?? categoriaId;
  return [{ texto: `Listo, aprendí la regla: «${palabra}» va en ${nombre}.` }];
}
