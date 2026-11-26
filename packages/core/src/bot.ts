/**
 * El bot: recibe un mensaje o un botón y devuelve las respuestas a mostrar.
 *
 * Corre dentro de la app (también sin conexión) con su copia local de los datos. No sabe
 * nada de redes: solo usa un `Repo`.
 *
 * Flujo: mensaje -> tarjeta "Entendí: ..." -> [Confirmar] [Editar] [Cancelar]. Nada se guarda
 * hasta confirmar. Tras confirmar quedan [Editar] [Deshacer]. El bot nunca borra: solo anula.
 */
import { calcularSaldos, compromisosSaldados, deudasPorPersona, gastoHabitual, resumenSaldos } from './consultas.ts';
import { construirMovimiento, errorDePago } from './asientos.ts';
import { apodosDePersonas, ejemploDeCuenta, grupoPorDefecto, gruposDe, idPersona } from './entidades.ts';
import {
  abonosHuerfanos, AVISO_APERTURA, AVISO_EXCESO, AVISO_FALTA, AVISO_MONEDA, excesoDePago, faltaPlata, movimientosQueSePierden,
  quedaNegativoSin, type Falta,
} from './guardas.ts';
import { aLocal, deLocal, describirDia, indiceMes, nombreMes } from './fechas.ts';
import { billetesSugeridos } from './efectivo.ts';
import {
  alertaPresupuesto, pagoDe, resumenGuardado, sacaEfectivo, tarjeta, textoAyuda, textoCategoria, textoDeudas,
  textoEvento, textoResumen, textoSaldo, textoSaldoDe, textoUltimos, textoVentas,
} from './mensajes.ts';
import { textoPresupuestoSemana } from './presupuesto.ts';
import { corteDeTurno, textoCorte } from './operacion.ts';
import { textoJornales } from './trabajadores.ts';
import { textoRevision } from './revision.ts';
import { aplicarCambio, interpretar, resolverFaltante, type Propuesta } from './parser.ts';
import {
  aclarar, buscarEnLista, correccionDeGuardado, corregirNombreEnOpciones, editarFrase, elegirOpcion, leerOrdenDeCola, sinMuletillaDeRegistro,
  type Opcion, type Orden,
} from './aclaraciones.ts';
import { hallarMontos, aMinor, formatear } from './dinero.ts';
import { contextoDe, type Datos, type Pendiente, type Repo } from './repo.ts';
import { alAprender, alConfirmarAprender } from './aprender.ts';
import { ayudaDeTema, buscarAyuda, consultaDisfrazada, esPreguntaDeAyuda, temasParecidos, type RespuestaDeAyuda } from './ayudaGuiada.ts';
import { dividirTodo, MAX_MOVIMIENTOS_POR_MENSAJE } from './lineas.ts';
import { leerNotificacionBancaria } from './banco.ts';
import { incertidumbre } from './incertidumbre.ts';
import { descendientes, leerSubcategorias, MAX_NIVELES, puedeIrDentro } from './subcategorias.ts';
import { leerMetas, textoAvance, textoMetas, totalApartado, type Meta } from './metas.ts';
import { describirFrecuencia, leerPausa, leerRecurrentes, type Frecuencia, type Recurrente } from './recurrentes.ts';
import { avisoDeExistencias, conConteo, existencias, existenciasDe, productoPorNombre } from './existencias.ts';
import { leerCatalogo } from './ventas.ts';

const PREFIJO_EXISTENCIAS = '📦 ';

const MENSAJE_APERTURA = 'El saldo inicial no se deshace: ajusta lo que tienes con un arqueo (por ejemplo «arqueo efectivo 80000 monedas 11500») o cámbialo con el botón Editar.';
const propuestaDe = (m: Movimiento): Partial<Propuesta> | undefined => m.propuesta as Partial<Propuesta> | undefined;

const botonExacto =(debido: number, moneda: 'COP' | 'USD'): Boton => ({ id: 'exacto', titulo: `Registrar solo ${formatear(debido, moneda)}` });

const EJEMPLOS_RECURRENTES: Record<Frecuencia, string> = {
  mensual: 'Ejemplo: «cada mes el 5 internet 60000».',
  quincenal: 'Ejemplo: «cada quincena el 5 almuerzo 40000» (cae el 5 y el 20).',
  semanal: 'Ejemplo: «cada lunes almuerzo 12000».',
  anual: 'Ejemplo: «cada año el 15 de marzo seguro 300000».',
};
import { limpiar, titulo } from './texto.ts';
import type { Contexto, Cuenta, Movimiento } from './tipos.ts';

export interface Entrada {
  texto?: string;
  /** Id del botón pulsado: 'ok', 'edit', 'no', 'undo:<id>', 'edit:<id>'. */
  boton?: string;
}
export interface Boton { id: string; titulo: string }
export interface Salida {
  texto: string;
  botones?: Boton[];
  /** El bot no entendió el mensaje: la app puede pedir ayuda a la IA (si el servidor la tiene). */
  noEntendido?: boolean;
}

const BOTONES_TARJETA: Boton[] = [
  { id: 'ok', titulo: '✅ Confirmar' },
  { id: 'edit', titulo: '✏️ Editar' },
  { id: 'no', titulo: '❌ Cancelar' },
];

/** La lista de compras guardada en la config (siempre una lista de textos). */
export function leerLista(config: Record<string, string>): string[] {
  try {
    const l = JSON.parse(config.lista_compras ?? '[]');
    return Array.isArray(l) ? l.filter((x): x is string => typeof x === 'string') : [];
  } catch { return []; }
}

/** «arroz y sal, jabón» -> ['arroz', 'sal', 'jabón'] */
function separarCosas(texto: string): string[] {
  return texto.split(/\s*(?:,|\by\b)\s*/i).map(x => x.trim()).filter(Boolean).map(x => x.slice(0, 60)).slice(0, 20);
}

function textoExistencias(config: Record<string, string>, movs: Movimiento[]): string {
  const lista = existencias(config, movs);
  if (!lista.length) return '📦 Ningún producto lleva cuenta de existencias. Para empezar: «inventario galletas 200».';
  return [
    '📦 Existencias:',
    ...lista.map(x => `• ${x.producto.nombre}: ${x.quedan} ${x.quedan === 1 ? 'unidad' : 'unidades'}${x.quedan < 0 ? ' (revisa el conteo)' : ''}`),
    '', 'Cuando llegue más: «llegaron 50 galletas». Para volver a contar: «inventario galletas 120».',
  ].join('\n');
}

/** «2026-12-21» como «21/12/2026». */
const diaCorto = (iso: string): string => `${iso.slice(8, 10)}/${iso.slice(5, 7)}/${iso.slice(0, 4)}`;

function textoRecurrentes(lista: Recurrente[]): string {
  return lista.length
    ? ['🔁 Gastos que se repiten:', ...[...lista].sort((a, b) => a.dia - b.dia).map(r => `• ${r.concepto} ${formatear(r.monto)} (${describirFrecuencia(r)})${r.pausado ? ' (en pausa)' : ''}${r.fin ? ` (hasta ${diaCorto(r.fin)})` : ''}`), '', 'Para quitar uno: «quitar recurrente internet». También: «pausar recurrente internet», «reanudar recurrente internet» o «fin recurrente internet 21/12/2026».'].join('\n')
    : '🔁 No hay gastos que se repitan. Agrega uno así: «cada mes el 5 internet 60000», «cada quincena el 5 almuerzo 40000», «cada lunes almuerzo 12000» o «cada año el 15 de marzo seguro 300000».';
}

function textoLista(lista: string[]): string {
  return lista.length
    ? ['🛒 Lista de compras:', ...lista.map(x => `• ${x}`), '', 'Cuando compres algo, dime «compré arroz» y lo tacho.'].join('\n')
    : 'La lista de compras está vacía. Para agregar: «falta arroz y sal».';
}

type Suelta = 'confirma' | 'guarda' | 'cancela' | 'borra' | 'gracias';

/** Una palabra suelta de confirmar, cancelar o agradecer (ya pasada por `limpiar`), o null si el mensaje dice otra cosa. */
function palabraSuelta(t: string): Suelta | null {
  const s = t.trim();
  // «guarda» es una orden de guardar: si solo falta la categoría, se guarda en Otros (ver alPalabraSuelta)
  if (/^(?:(?:si|dale|ok|listo) )?(?:guarda|guardalo|guardala|guardar|guardalo ya)$/.test(s)) return 'guarda';
  if (/^(?:ok|okey|okay|oki|dale|listo|si|sii|confirmar|confirmo|confirma|si confirma|si confirmo|de una|vale|perfecto|correcto|esta bien|asi esta bien)$/.test(s)) return 'confirma';
  if (/^(?:borra|borralo|borrala|borrar)$/.test(s)) return 'borra';
  if (/^(?:no|nop|nel|cancela|cancelar|cancelalo|cancelala|olvidalo|mejor no|no gracias|descarta|descartar|descartalo|descartala)$/.test(s)) return 'cancela';
  if (/^(?:gracias|muchas gracias|mil gracias|grax|gracias parce|chevere|genial|super)$/.test(s)) return 'gracias';
  return null;
}

/**
 * La última pregunta con botones que hizo el bot («¿De qué cuenta sacaste $200.000?»), por repositorio. Vive solo en
 * memoria mientras la app está abierta: así «de nequi para efectivo» responde la pregunta sin guardar nada en la nube.
 */
const preguntasAbiertas = new WeakMap<Repo, { mensaje: string; opciones: Opcion[] }>();

/** La pregunta con un botón por opción (y Cancelar); queda abierta para que también se pueda responder escribiendo. */
function salidaDePregunta(repo: Repo, mensaje: string, opciones: Opcion[]): Salida {
  preguntasAbiertas.set(repo, { mensaje, opciones });
  return { texto: `❓ ${mensaje}`, botones: [...opciones.map(o => ({ id: `ia:${o.frase}`, titulo: o.titulo })), { id: 'no', titulo: '❌ Cancelar' }] };
}

export async function procesar(
  repo: Repo, entrada: Entrada, ahora: Date, origen: 'bot' | 'app' = 'bot',
): Promise<Salida[]> {
  const datos = await repo.cargar();
  const ctx = contextoDe(datos, ahora);
  const pend = await repo.leerPendiente();
  const e = new Motor(repo, datos, ctx, pend, origen);
  return entrada.boton ? e.alPulsar(entrada.boton) : e.alEscribir(entrada.texto ?? '');
}

class Motor {
  // (campos explícitos: Node ejecuta TypeScript "borrando tipos" y no admite parámetros-propiedad)
  private repo: Repo;
  private datos: Datos;
  private ctx: Contexto;
  private pend: Pendiente | null;
  private origen: 'bot' | 'app';

  constructor(repo: Repo, datos: Datos, ctx: Contexto, pend: Pendiente | null, origen: 'bot' | 'app') {
    this.repo = repo;
    this.datos = datos;
    this.ctx = ctx;
    this.pend = pend;
    this.origen = origen;
  }

  private get apertura(): string { return this.datos.config.fecha_apertura ?? '2000-01-01 00:00:00'; }
  private get saldos() { return calcularSaldos(this.datos.movimientos, this.apertura); }

  // ---------------------------------------------------------------- botones

  async alPulsar(id: string): Promise<Salida[]> {
    if ((id === 'ok' || id === 'no') && this.datos.config.pausa_fijo_pendiente && !this.pend) return this.resolverPausaPendiente(id === 'ok');
    if (id === 'ok') return this.confirmar();
    if (id === 'okall') return this.confirmarTodos();
    if (id === 'cubrir') return this.cubrirFalta();
    if (id.startsWith('cuad:')) return this.cuadrarConPersona(id.slice(5));
    if (id === 'no') {
      await this.repo.guardarPendiente(null);
      const aviso = { texto: this.pend?.reemplazaId ? 'Edición cancelada ❌ (queda el movimiento original).' : 'Cancelado ❌ No se guardó nada.' };
      const cola = this.pend?.siguientes;
      return cola?.length ? [aviso, ...(await this.siguienteDe(cola, this.pend?.total ?? cola.length + 1))] : [aviso];
    }
    if (id === 'edit') {
      if (!this.pend) return [{ texto: 'No hay nada pendiente por editar.' }];
      await this.repo.guardarPendiente({ ...this.pend, editando: true });
      return [{
        texto: `✏️ Dime qué quieres cambiar. Por ejemplo: «monto 6000», «categoría comida», «${ejemploDeCuenta(this.ctx)}» (para cambiar la cuenta), «vuelto 5000 y 500 en monedas», «ayer». También puedes escribir todo el mensaje otra vez.`,
        botones: [{ id: 'no', titulo: '❌ Cancelar' }],
      }];
    }
    // Respuesta a una pregunta con botones: es lo mismo que escribir esa opción
    if (id.startsWith('resp:')) {
      const opcion = this.pend?.propuesta.faltantes[0]?.opciones?.[Number(id.slice(5))];
      if (!opcion) return [{ texto: 'Esa opción ya no está disponible.' }];
      return this.alEscribir(opcion);
    }
    // Atajos de la tarjeta para cambiar cómo se pagó: «Justo» o «Con $10.000»
    if (id.startsWith('pago:')) {
      if (!this.pend) return [{ texto: 'Eso ya no está pendiente.' }];
      const forma = id.slice(5);
      const propuesta = { ...this.pend.propuesta };
      propuesta.pagoCon = propuesta.pagoMonedas = propuesta.restoEnMonedas = undefined;
      propuesta.vuelto = undefined;
      if (forma === 'justo') { propuesta.formaPago = 'justo'; propuesta.billeteMayor = undefined; }
      else { propuesta.formaPago = undefined; propuesta.billeteMayor = Number(forma); }
      return this.mostrar({ ...this.pend, propuesta });
    }
    // «Registrar solo lo justo» de un abono que pasaba de lo que se debe
    if (id === 'exacto') {
      if (!this.pend) return [{ texto: 'Eso ya no está pendiente.' }];
      const ex = excesoDePago(this.pend.propuesta, this.ctx, this.saldosPara(this.pend));
      if (!ex) return this.mostrar(this.pend);
      const propuesta = { ...this.pend.propuesta, monto: ex.debido };
      propuesta.pagoCon = propuesta.pagoMonedas = propuesta.restoEnMonedas = undefined;
      propuesta.vuelto = undefined; propuesta.formaPago = undefined; propuesta.billeteMayor = undefined;
      return this.mostrar({ ...this.pend, propuesta });
    }
    if (id.startsWith('undometa:')) return this.deshacerAporte(id.slice(9));
    if (id.startsWith('metaok:')) return this.moverMeta(id.slice(7), 1, true);
    // «per:<id>»: la tarjeta de esa persona (cuando el nombre escrito tenía varias posibles)
    if (id.startsWith('per:')) {
      const p = this.ctx.cuentas.find(c => c.tipo === 'persona' && c.id === id);
      return p ? this.estadoDePersona(p) : [{ texto: 'Esa persona ya no está.' }];
    }
    if (id.startsWith('aprende!:')) return alConfirmarAprender(id.slice(9), this.ctx, this.repo);
    if (id.startsWith('lista+:')) return this.agregarALista(id.slice(7));
    // «ayuda:<tema>»: la explicación de ese tema; «poner:<frase>» la maneja la app (deja la frase escrita), aquí no hace nada
    if (id.startsWith('ayuda:')) { const r = ayudaDeTema(id.slice(6), this.ctx); return r ? [this.salidaDeAyuda([r])] : [{ texto: 'Ese tema ya no está.' }]; }
    if (id.startsWith('poner:')) return [];
    // una frase que la IA entendió cuando volvió el internet: se trata como si se acabara de escribir
    // «ia:=texto» no es una frase para el bot sino una indicación para la persona (por ejemplo, cómo decir un reparto distinto)
    if (id.startsWith('ia:=')) return [{ texto: id.slice(4) }];
    if (id.startsWith('ia:')) return this.alEscribir(id.slice(3));
    if (id === 'nada') return [{ texto: 'Está bien, no lo anoté.' }];
    if (id.startsWith('undo:')) return this.deshacer(id.slice(5));
    if (id.startsWith('undo!:')) return this.deshacer(id.slice(6), true);
    if (id.startsWith('unds!:')) {
      const ids = id.slice(6).split(',');
      return this.anularVarios(this.datos.movimientos.filter(m => ids.includes(m.id) && m.estado === 'ok'), true);
    }
    if (id.startsWith('edit:')) return this.reabrir(id.slice(5));
    return [{ texto: 'Ese botón ya no está disponible.' }];
  }

  // ---------------------------------------------------------------- texto

  async alEscribir(texto: string): Promise<Salida[]> {
    const t = limpiar(texto);

    // una pausa esperando respuesta: «ok»/«no» la resuelven; cualquier otra cosa la deja sin efecto
    if (this.datos.config.pausa_fijo_pendiente) {
      if (/^(?:ok|si|dale|listo|confirmo|confirmar)$/.test(t)) return this.resolverPausaPendiente(true);
      await this.repo.setConfig('pausa_fijo_pendiente', '');
      if (/^(?:no|cancelar|cancela)$/.test(t)) return [{ texto: 'Listo, no cambié nada.' }];
    }

    // Topes mensuales: «tope mecato 60000» / «quitar tope mecato»
    const tope = t.match(/^tope ([a-z ]+?) (\d[\d.,]*\s?(?:k|mil)?)$/);
    if (tope) return this.fijarTope(tope[1], tope[2]);
    const quitar = t.match(/^(?:quitar|sin) tope ([a-z ]+)$/);
    if (quitar) return this.quitarTope(quitar[1]);

    const p = this.pend;

    // Una notificación del banco pegada se vuelve una frase por operación (ver banco.ts); con una sola, esa frase es el mensaje.
    // Es un movimiento nuevo: no se toma como respuesta ni corrección de la tarjeta pendiente.
    const banco = leerNotificacionBancaria(texto, this.ctx);
    if (banco?.frases.length === 1) texto = banco.frases[0];
    if (!banco) texto = sinMuletillaDeRegistro(texto);

    // 0) Palabras sueltas («ok», «no», «borra», «gracias»): con una tarjeta pendiente actúan solo sobre ella;
    //    sin tarjeta se contesta corto. Nunca son un gasto sin monto ni una corrección del concepto.
    const suelta = palabraSuelta(t);
    if (suelta && (p || suelta !== 'borra')) return this.alPalabraSuelta(suelta, p);

    // 0b) La conversación sigue: una aclaración de la tarjeta («mentiras, fue en nequi»), una orden sobre la cola
    //     («quita el del taxi»), una corrección de lo recién guardado («corrige, fueron 87000») o la respuesta escrita
    //     a la última pregunta con botones. Va antes de las preguntas de la tarjeta: «eran 21 mil» no es un lugar.
    const abierta = preguntasAbiertas.get(this.repo);
    preguntasAbiertas.delete(this.repo);
    if (!banco) {
      const conversado = await this.conversar(texto, p, abierta);
      if (conversado) return conversado;
    }

    // 1) Estaba esperando una respuesta (categoría, lugar, persona)
    if (p && !banco && p.propuesta.faltantes.length) {
      const r = resolverFaltante(p.propuesta, texto, this.ctx);
      if ('error' in r) {
        const nuevo = interpretar(texto, this.ctx);
        if (nuevo.clase === 'error') return [{ texto: r.error, botones: [{ id: 'no', titulo: '❌ Cancelar' }] }];
        // si escribió otra cosa completa, se procesa como mensaje nuevo (abajo)
      } else {
        // lo aprendido se guarda al confirmar: si la tarjeta se cancela, no queda una regla de algo que no pasó
        if (r.aprende) this.ctx.aprendido[r.aprende.palabra] = { categoriaId: r.aprende.categoriaId };
        const aprende = r.aprende ? [...(p.aprende ?? []), r.aprende] : p.aprende;
        return this.mostrar({ ...p, propuesta: r.propuesta, aprende });
      }
    }

    // 2) Hay una tarjeta sin confirmar: ¿el texto es una corrección? («monto 6000», «nequi»,
    //    «vuelto 5k y 500 monedas», «ayer»...). Solo se acepta si TODO el texto es una corrección,
    //    así un gasto nuevo nunca se confunde con una.
    if (p && !banco) {
      const cambio = aplicarCambio(p.propuesta, texto, this.ctx);
      if (cambio) return this.mostrar({ ...p, propuesta: cambio });
    }

    // 3) Varios movimientos en un mensaje: se van mostrando de a uno
    // (una sola línea que no se anota, como «pagué 10000 y me devolvieron los mismos 10000», no se parte)
    const todas = banco ? banco.frases : !/[\n;]/.test(texto) && incertidumbre(texto) ? [texto] : dividirTodo(texto, this.nombresDeCuentas());
    const partes = todas.slice(0, MAX_MOVIMIENTOS_POR_MENSAJE);

    // Un movimiento nuevo con una tarjeta sin confirmar: no se reemplaza en silencio. La nueva queda en la cola
    // y se pregunta qué hacer con la pendiente.
    if (p && !p.editando && (partes.length > 1 || interpretar(texto, this.ctx).clase === 'movimiento')) return this.avisarPendiente(p, partes);

    if (partes.length > 1 && !p?.editando) {
      const salida = await this.siguienteDe(partes, partes.length);
      const faltan = todas.slice(MAX_MOVIMIENTOS_POR_MENSAJE);
      if (!faltan.length) return salida;
      // más de la cuenta: se muestran los primeros y lo que sobra queda listo para mandarlo en otro mensaje
      return [{
        texto: `Son ${todas.length} movimientos: te muestro los primeros ${partes.length} de ${todas.length}. Faltan ${faltan.length}: toca el botón y quedan escritos para mandarlos cuando termines estos.`,
        botones: [{ id: `poner:${faltan.join('\n')}`, titulo: `✍️ Escribir los ${faltan.length} que faltan` }],
      }, ...salida];
    }

    // 4) Mensaje nuevo. Si estabas editando, el mensaje completo reemplaza la tarjeta y mantiene
    //    la referencia al movimiento original (que se anula solo al confirmar).
    // Escribir solo el nombre de alguien que ya tienes muestra cómo van las cuentas con esa persona.
    const tarjeta = this.tarjetaDePersona(texto);
    if (tarjeta) return tarjeta;
    const res = interpretar(texto, this.ctx);
    if (res.clase === 'comando') return this.comando(res.comando, res.arg);
    // la frase puede significar dos cosas: se pregunta con botones en vez de adivinar
    if (res.clase === 'pregunta') return [salidaDePregunta(this.repo, res.mensaje, res.opciones)];
    // «quiero mirar quién me debe», «cuánto me queda»: es una consulta dicha con otras palabras
    const consulta = res.clase === 'error' ? consultaDisfrazada(texto) : null;
    if (consulta) return this.alEscribir(consulta);
    if (res.clase === 'error' && esPreguntaDeAyuda(texto)) return [this.respuestaDeAyuda(texto)];
    if (res.clase === 'error') {
      // Una línea sin plata («Jabón baño») parece algo por comprar: se ofrece anotarla en la lista.
      const limpio = texto.trim();
      if (res.mensaje.includes('Me falta el monto') && !/\d/.test(limpio) && limpio.split(/\s+/).length <= 5 && limpio.length <= 60) {
        return [{ texto: `${res.mensaje}
¿O es algo por comprar? Puedo anotarlo en la lista de compras: «${limpio}».`, botones: [{ id: `lista+:${limpio}`, titulo: 'Agregar a la lista' }, { id: 'nada', titulo: 'No' }] }];
      }
      return [{ texto: res.mensaje, noEntendido: true }];
    }
    const reemplazaId = p?.editando ? p.reemplazaId : undefined;
    return this.mostrar({ propuesta: res.propuesta, editando: Boolean(reemplazaId), reemplazaId });
  }

  // ---------------------------------------------------------------- memoria de la conversación (ver aclaraciones.ts)

  /** Lo que se dice sobre la tarjeta, la cola o lo recién guardado; null si el texto es otra cosa. */
  private async conversar(texto: string, p: Pendiente | null, abierta?: { mensaje: string; opciones: Opcion[] }): Promise<Salida[] | null> {
    if (!p) {
      if (leerOrdenDeCola(texto)?.que === 'cancelarTodo') return [{ texto: 'Listo, no hay nada pendiente.' }];
      const resto = correccionDeGuardado(texto);
      if (resto) return this.corregirGuardado(resto);
      if (!abierta) return null;
      const nombre = corregirNombreEnOpciones(texto, abierta.opciones);
      if (nombre) {
        const mensaje = abierta.mensaje.replace(nombre.viejo, nombre.nombre);
        const s = salidaDePregunta(this.repo, mensaje, nombre.opciones);
        return [{ ...s, texto: `Listo, con ${nombre.nombre}. ${s.texto}` }];
      }
      const opcion = elegirOpcion(texto, abierta.opciones.map(o => o.frase), this.ctx);
      return opcion ? this.alEscribir(opcion) : null;
    }
    // escribir una de las opciones de la pregunta es responderla: eso lo hace resolverFaltante
    if (p.propuesta.faltantes[0]?.opciones?.some(o => limpiar(o) === limpiar(texto))) return null;
    const orden = leerOrdenDeCola(texto);
    if (orden) {
      const r = await this.ordenDeCola(orden, p);
      if (r) return r;
    }
    const a = aclarar(p.propuesta, texto, this.ctx);
    if (!a) return null;
    // «ese fue con tarjeta» con varios movimientos no dice cuál: se pregunta y no se toca ninguno
    if (a.referente && p.siguientes?.length) return [this.cualDeTodos(p, limpiar(texto).replace(/^.*?\b(?:ese|eso|esa|este|esto|esta)\s+/, ''))];
    if ('aviso' in a) return this.conNota(a.aviso, p);
    return this.conNota(a.nota, { ...p, propuesta: a.propuesta });
  }

  /** Muestra la tarjeta con una nota corta arriba. */
  private async conNota(nota: string, p: Pendiente): Promise<Salida[]> {
    const s = await this.mostrar(p);
    if (nota && s[0]) s[0].texto = `${nota}\n${s[0].texto}`;
    return s;
  }

  /** La tarjeta y lo que sigue en la cola, como se nombran en una lista. */
  private listaDeCola(p: Pendiente): string[] {
    return [`${p.propuesta.concepto} ${formatear(p.propuesta.monto, p.propuesta.moneda)}`, ...(p.siguientes ?? [])];
  }

  private cualDeTodos(p: Pendiente, resto: string): Salida {
    const lista = this.listaDeCola(p);
    return {
      texto: `¿Cuál de los ${lista.length}? No quiero cambiar el que no es.\n${lista.map((x, i) => `${i + 1}. ${x}`).join('\n')}\nDime, por ejemplo, «el primero ${resto}» o «el segundo ${resto}».`,
    };
  }

  /** Quitar uno, cambiar uno, cambiar todos, cancelar todo o confirmar el resto de un mensaje con varios movimientos. */
  private async ordenDeCola(orden: Orden, p: Pendiente): Promise<Salida[] | null> {
    const cola = [...(p.siguientes ?? [])];
    const n = 1 + cola.length;
    if (orden.que === 'cancelarTodo') {
      await this.repo.guardarPendiente(null);
      this.pend = null;
      return [{ texto: n > 1 ? `Listo, descarté los ${n}. No se guardó nada.` : 'Listo, lo descarté. No se guardó nada.' }];
    }
    if (orden.que === 'confirmarResto') return p.propuesta.faltantes.length ? this.confirmar() : this.confirmarTodos();
    const ORD = ['primero', 'segundo', 'tercero', 'cuarto', 'quinto', 'sexto', 'séptimo', 'octavo', 'noveno', 'décimo'];
    if (orden.que === 'todos') {
      const a0 = aclarar(p.propuesta, orden.resto, this.ctx);
      if (!a0 || !('propuesta' in a0)) return null;
      let fallan = 0;
      const nueva = cola.map(frase => {
        const r = interpretar(frase, this.ctx);
        const a = r.clase === 'movimiento' ? aclarar(r.propuesta, orden.resto, this.ctx) : null;
        const f = r.clase === 'movimiento' && a && 'propuesta' in a ? editarFrase(frase, r.propuesta, a.propuesta, this.ctx) : null;
        if (!f) fallan++;
        return f ?? frase;
      });
      const nota = fallan ? `Listo, cambié ${n - fallan} de ${n}; los otros ${fallan} dímelos cuando te los muestre.` : `Listo, cambié los ${n}.`;
      return this.conNota(nota, { ...p, propuesta: a0.propuesta, siguientes: nueva });
    }
    // quitar o editar: ¿cuál?
    const textos = [`${p.propuesta.concepto} ${p.propuesta.mensajeOriginal}`, ...cola];
    let i: number;
    if ('pos' in orden.cual) {
      i = orden.cual.pos === -1 ? n - 1 : orden.cual.pos;
      if (i >= n) return [{ texto: `Solo tengo ${n === 1 ? 'uno pendiente' : `${n} en la lista`}. ¿Cuál quieres cambiar?` }];
    } else {
      const hay = buscarEnLista(orden.cual.palabra, textos);
      if (!hay.length) return null; // «quita el arroz» puede ser de la lista de compras
      if (hay.length > 1) return [this.cualDeTodos(p, orden.que === 'editar' ? orden.resto : '')];
      i = hay[0];
    }
    if (orden.que === 'quitar') {
      if (i === 0) {
        await this.repo.guardarPendiente(null);
        this.pend = null;
        const nota = `Listo, quité «${p.propuesta.concepto}».`;
        if (!cola.length) return [{ texto: `${nota} No queda nada pendiente.` }];
        const s = await this.siguienteDe(cola, p.total ?? n);
        if (s[0]) s[0].texto = `${nota}\n${s[0].texto}`;
        return s;
      }
      const [fuera] = cola.splice(i - 1, 1);
      return this.conNota(`Listo, quité «${fuera}». ${cola.length ? `Quedan ${cola.length + 1}.` : 'Queda solo este.'}`, { ...p, siguientes: cola, total: (p.total ?? n) - 1 });
    }
    if (i === 0) {
      const a = aclarar(p.propuesta, orden.resto, this.ctx);
      if (!a) return [{ texto: `No entendí qué cambiar del ${ORD[0]}. Prueba así: «el ${ORD[0]} fue 8000» o «el ${ORD[0]} fue en nequi».` }];
      return 'aviso' in a ? this.conNota(a.aviso, p) : this.conNota(a.nota, { ...p, propuesta: a.propuesta });
    }
    const frase = cola[i - 1];
    const r = interpretar(frase, this.ctx);
    const a = r.clase === 'movimiento' ? aclarar(r.propuesta, orden.resto, this.ctx) : null;
    if (a && 'aviso' in a) return [{ texto: a.aviso }];
    const nueva = r.clase === 'movimiento' && a ? editarFrase(frase, r.propuesta, a.propuesta, this.ctx) : null;
    if (!nueva) return [{ texto: `Eso del ${ORD[i] ?? `número ${i + 1}`} te lo cambio cuando te lo muestre: ahí dime «${orden.resto}».` }];
    cola[i - 1] = nueva;
    return this.conNota(`Listo, el ${ORD[i] ?? `número ${i + 1}`} queda así: «${nueva}».`, { ...p, siguientes: cola });
  }

  /** «corrige, fueron 87000» sin tarjeta pendiente: edita lo último que se guardó (el original queda anulado, no borrado). */
  private async corregirGuardado(resto: string): Promise<Salida[] | null> {
    const m = this.ultimoPropio();
    const antes = m?.propuesta as Propuesta | undefined;
    if (!m || !antes) return null;
    const a = aclarar(antes, resto, this.ctx);
    if (a && 'aviso' in a) return [{ texto: a.aviso }];
    const cambio = a ? a.propuesta : aplicarCambio(antes, resto, this.ctx);
    if (!cambio) return null;
    const nota = a ? a.nota.replace(/^Listo, /, '') : 'lo cambié.';
    const tarjeta = await this.mostrar({ propuesta: cambio, editando: true, reemplazaId: m.id });
    // si la tarjeta trae una pregunta o un aviso, la persona la revisa antes de guardar
    const limpia = tarjeta[0]?.botones?.some(b => b.id === 'ok') && !/⚠️|❓/.test(tarjeta[0].texto);
    if (!limpia) {
      if (tarjeta[0]) tarjeta[0].texto = `Corrijo «${m.descripcion}»: ${nota} Revisa la tarjeta antes de guardarla.\n${tarjeta[0].texto}`;
      return tarjeta;
    }
    const r = await this.confirmar();
    if (r[0]) r[0].texto = `Corregí «${m.descripcion}»: ${nota} El original quedó anulado.\n${r[0].texto}`;
    return r;
  }

  /** Los nombres de las cuentas de plata y de las personas, para que «nequi 15k efectivo 10k» o «almuerzo 25000 marta 20000» no se partan como dos gastos. */
  private nombresDeCuentas(): string[] {
    return this.ctx.cuentas.filter(c => c.tipo === 'dinero' || c.tipo === 'persona').map(c => limpiar(c.nombre));
  }

  /** «ok», «no», «borra», «gracias» sueltos. Con tarjeta pendiente: confirman, cancelan o la dejan como está. */
  private async alPalabraSuelta(suelta: Suelta, p: Pendiente | null): Promise<Salida[]> {
    if (!p) return [{ texto: suelta === 'gracias' ? '¡Con gusto! Cuando quieras, escríbeme otro movimiento.' : 'Listo, no hay nada pendiente.' }];
    if (suelta === 'confirma') return this.confirmar();
    if (suelta === 'guarda') {
      // «guarda» con solo la categoría por responder: se guarda en Otros y se dice, para cambiarla luego con Editar
      const f = p.propuesta.faltantes;
      const otros = this.ctx.cuentas.find(c => c.id === 'cat:otros');
      if (!f.length || !otros || !f.every(x => x.campo === 'categoria')) return this.confirmar();
      this.pend = { ...p, propuesta: { ...p.propuesta, categoriaId: otros.id, faltantes: [] } };
      const r = await this.confirmar();
      r[0].texto = `Lo guardé en Otros porque no me dijiste la categoría; si quieres, cámbiala con Editar.\n${r[0].texto}`;
      return r;
    }
    if (suelta === 'cancela' || suelta === 'borra') return this.alPulsar('no');
    const salida = await this.mostrar(p);
    salida[0].texto = `¡Con gusto! Esta tarjeta sigue pendiente, confírmala o cancélala:\n${salida[0].texto}`;
    return salida;
  }

  /** Llegó un movimiento nuevo con una tarjeta sin confirmar: la nueva va a la cola y se pregunta por la pendiente. */
  private async avisarPendiente(p: Pendiente, nuevas: string[]): Promise<Salida[]> {
    const siguientes = [...(p.siguientes ?? []), ...nuevas];
    const total = (p.total ?? 1) + nuevas.length;
    await this.repo.guardarPendiente({ ...p, siguientes, total });
    this.pend = { ...p, siguientes, total };
    const lo = nuevas.length === 1 ? `«${nuevas[0]}»` : `los ${nuevas.length} nuevos`;
    const pregunta = p.propuesta.faltantes.length
      ? `Primero responde su pregunta (${p.propuesta.faltantes[0].pregunta}) o descártala, y sigo con ${lo}.`
      : `¿La guardo o la descarto? Después te muestro ${lo}.`;
    return [{
      texto: `Tienes una tarjeta pendiente sin confirmar:\n${tarjeta(p.propuesta, this.ctx, this.saldosPara(p))}\n${pregunta}`,
      botones: [
        ...(p.propuesta.faltantes.length ? [] : [{ id: 'ok', titulo: '✅ Guardar la pendiente' }]),
        { id: 'no', titulo: '❌ Descartar la pendiente' },
      ],
    }];
  }

  /** La respuesta del chat a una pregunta de uso: el tema que mejor responde y sus ejemplos como botones que dejan la frase escrita. */
  private respuestaDeAyuda(duda: string): Salida {
    const r = buscarAyuda(duda, this.ctx);
    if (r.length) return this.salidaDeAyuda(r);
    const parecidos = temasParecidos(duda);
    return {
      texto: 'No estoy seguro de qué quieres saber, pero con gusto te ayudo. Toca el tema que más se parezca o cuéntame con otras palabras, por ejemplo «cómo anoto un gasto».',
      botones: parecidos.map(t => ({ id: `ayuda:${t.id}`, titulo: t.tema })),
    };
  }

  private salidaDeAyuda(r: RespuestaDeAyuda[]): Salida {
    const [mejor, ...otros] = r;
    const texto = mejor.ejemplos.length ? `${mejor.explicacion}\nToca un ejemplo y queda escrito en el chat: solo cámbiale lo que haga falta y envíalo.` : mejor.explicacion;
    return {
      texto,
      botones: [
        ...mejor.ejemplos.map(e => ({ id: `poner:${e}`, titulo: e })),
        ...otros.map(o => ({ id: `ayuda:${o.id}`, titulo: `También: ${o.tema}` })),
      ],
    };
  }

  /**
   * Muestra el primer movimiento que se entienda de la lista y deja el resto para después.
   * Lo que no se entiende se avisa y se sigue con el próximo.
   */
  private async siguienteDe(restantes: string[], total: number): Promise<Salida[]> {
    const avisos: string[] = [];
    while (restantes.length) {
      const [texto, ...resto] = restantes;
      const res = interpretar(texto, this.ctx);
      if (res.clase === 'movimiento') {
        // en una lista el recorrido del bus o del taxi no frena las demás tarjetas: se puede poner después con Editar
        if (total > 1) res.propuesta.faltantes = res.propuesta.faltantes.filter(f => f.campo !== 'desde' && f.campo !== 'hasta');
        const n = total - restantes.length + 1;
        const salida = await this.mostrar({ propuesta: res.propuesta, editando: false, siguientes: resto, total });
        const cabeza = total > 1 ? `📋 Movimiento ${n} de ${total}` : '';
        salida[0].texto = [...avisos, cabeza].filter(Boolean).join('\n') + '\n' + salida[0].texto;
        return salida;
      }
      avisos.push(`No pude con «${texto}»: ${res.clase === 'error' ? res.mensaje : res.clase === 'pregunta' ? res.mensaje + ' Escríbelo solo.' : 'eso no es un movimiento'}`);
      restantes = resto;
    }
    return avisos.length ? [{ texto: avisos.join('\n') }] : [];
  }

  /** Un gasto de 20 mil o más y de más de tres veces lo habitual en su categoría (con al menos 5 gastos antes) lleva un aviso. */
  private avisarSiEsAtipico(p: Propuesta): void {
    p.avisos = p.avisos.filter(a => !a.startsWith('Es bastante más de lo normal'));
    if (p.tipo !== 'gasto' || !p.categoriaId || p.moneda !== 'COP' || p.monto < 20000) return;
    const h = gastoHabitual(this.datos.movimientos, this.ctx.cuentas, p.categoriaId, aLocal(this.ctx.ahora));
    if (h.n < 5 || p.monto <= 3 * h.promedio) return;
    const nombre = this.ctx.cuentas.find(c => c.id === p.categoriaId)?.nombre ?? 'esa categoría';
    p.avisos.push(`Es bastante más de lo normal en ${nombre}: lo usual son ${formatear(Math.round(h.promedio))}.`);
  }

  /** Lo mismo anotado hace menos de diez minutos casi siempre es un mensaje enviado dos veces: se pregunta antes de guardar. */
  private avisarSiSeRepite(p: Pendiente): void {
    const pr = p.propuesta;
    pr.avisos = pr.avisos.filter(a => !a.startsWith('Se parece a uno'));
    if (pr.faltantes.length || pr.tipo === 'apertura' || pr.tipo === 'ajuste') return;
    const ahora = this.ctx.ahora.getTime();
    const igual = this.datos.movimientos.find(m => {
      const q = m.propuesta as Partial<Propuesta> | undefined;
      if (m.estado !== 'ok' || m.id === p.reemplazaId || !q || q.tipo !== pr.tipo) return false;
      const hace = ahora - deLocal(m.creadoEn).getTime();
      if (hace < 0 || hace > 10 * 60000) return false;
      return q.monto === pr.monto && q.moneda === pr.moneda && (q.cuentaId ?? 'efectivo') === (pr.cuentaId ?? 'efectivo')
        && q.categoriaId === pr.categoriaId && q.persona === pr.persona && q.fuente === pr.fuente && q.cuentaDestinoId === pr.cuentaDestinoId;
    });
    if (!igual) return;
    const min = Math.max(1, Math.round((ahora - deLocal(igual.creadoEn).getTime()) / 60000));
    pr.avisos.push(`Se parece a uno que anotaste hace ${min} min (${igual.descripcion}, ${formatear(pr.monto, pr.moneda)}). Si es el mismo, pulsa Cancelar.`);
  }

  /** Guarda la tarjeta pendiente y la muestra. */
  /**
   * «Confirmar los N» de un mensaje con varios movimientos: guarda el de la tarjeta y los que siguen mientras se entiendan
   * del todo. Se detiene en el primero que tenga una pregunta, un aviso o plata que no alcanza, y lo deja como tarjeta.
   */
  private async confirmarTodos(): Promise<Salida[]> {
    const guardados: Salida[] = [];
    for (let i = 0; i < MAX_MOVIMIENTOS_POR_MENSAJE; i++) {
      const r = await this.confirmar();
      const [guardado, ...resto] = r;
      const sigue = resto[resto.length - 1];
      const limpia = sigue?.botones?.some(b => b.id === 'ok') && !/⚠️|❓/.test(sigue.texto);
      if (!sigue || !limpia || !this.pend) return [...guardados, guardado, ...resto];
      guardados.push(guardado);
    }
    return guardados;
  }

  private async mostrar(p: Pendiente): Promise<Salida[]> {
    p.id ??= crypto.randomUUID();
    const cerrado = this.avisoSiCerrado(p.propuesta.ocurridoEn, p.propuesta.concepto || 'Ese movimiento');
    if (cerrado) return [{ texto: cerrado }];
    this.avisarSiEsAtipico(p.propuesta);
    this.avisarSiSeRepite(p);
    const saldos = this.saldosPara(p);
    const faltas = this.avisarFaltaPlata(p, saldos);
    const pierde = this.avisarSegundoSaldoInicial(p);
    const exceso = this.avisarAbono(p, saldos);
    this.avisarExistencias(p);
    await this.repo.guardarPendiente(p);
    this.pend = p;
    const texto = tarjeta(p.propuesta, this.ctx, saldos);
    const prefijo = p.reemplazaId ? '✏️ Editando un movimiento guardado (si cancelas queda el original).\n' : '';
    if (p.propuesta.faltantes.length) {
      // Si la pregunta trae opciones (categorías, grupo, qué fue...), cada una es un botón.
      const opciones = (p.propuesta.faltantes[0].opciones ?? []).map((titulo, i) => ({ id: `resp:${i}`, titulo }));
      return [{ texto: prefijo + texto, botones: [...opciones, { id: 'no', titulo: '❌ Cancelar' }] }];
    }
    if (pierde) {
      return [{ texto: prefijo + texto, botones: [{ id: 'no', titulo: '❌ Cancelar' }, { id: 'ok', titulo: '⚠️ Sí, empezar de nuevo' }, { id: 'edit', titulo: '✏️ Editar' }] }];
    }
    if (faltas.length) {
      // Con plata que no alcanza, guardar pasa a ser una decisión consciente: el botón lo dice.
      const cubrir = this.formaDeCubrir(faltas[0], saldos);
      const botones: Boton[] = [
        ...(cubrir ? [{ id: 'cubrir', titulo: `↔️ Pasar ${formatear(faltas[0].faltan, faltas[0].moneda)} de ${cubrir.nombre} a ${faltas[0].nombre}` }] : []),
        ...(exceso ? [botonExacto(exceso.debido, exceso.moneda)] : []),
        { id: 'edit', titulo: '✏️ Editar' },
        { id: 'ok', titulo: '⚠️ Guardar igual' },
        { id: 'no', titulo: '❌ Cancelar' },
        ...this.atajosDePago(p.propuesta), // «pagué con $10.000» suele ser justo lo que faltaba decir
      ];
      return [{ texto: prefijo + texto, botones }];
    }
    if (exceso) {
      return [{ texto: prefijo + texto, botones: [botonExacto(exceso.debido, exceso.moneda), { id: 'ok', titulo: '⚠️ Guardar igual' }, { id: 'edit', titulo: '✏️ Editar' }, { id: 'no', titulo: '❌ Cancelar' }] }];
    }
    // en un mensaje con varios movimientos, un botón para guardarlos todos de una vez
    const todos: Boton[] = p.siguientes?.length ? [{ id: 'okall', titulo: `✅ Confirmar los ${p.siguientes.length + 1}` }] : [];
    return [{ texto: prefijo + texto, botones: [...todos, ...BOTONES_TARJETA, ...this.atajosDePago(p.propuesta)] }];
  }

  /** Un abono en otra moneda se avisa como imposible; uno que pasa de lo que se debe, con el resto a favor de alguien. */
  private avisarAbono(p: Pendiente, saldos: ReturnType<typeof calcularSaldos>): ReturnType<typeof excesoDePago> {
    p.propuesta.avisos = p.propuesta.avisos.filter(a => !a.startsWith(AVISO_EXCESO) && !a.startsWith(AVISO_MONEDA));
    if (p.propuesta.faltantes.length) return null;
    const imposible = errorDePago(p.propuesta, this.ctx, saldos);
    if (imposible) { p.propuesta.avisos.push(`${AVISO_MONEDA}${imposible}.`); return null; }
    const ex = excesoDePago(p.propuesta, this.ctx, saldos);
    if (ex) p.propuesta.avisos.push(ex.aviso);
    return ex;
  }

  /** Una venta de un producto que lleva cuenta de existencias avisa si no alcanzan o si quedan pocas. */
  private avisarExistencias(p: Pendiente): void {
    const venta = p.propuesta.venta;
    if (!venta) return;
    p.propuesta.avisos = p.propuesta.avisos.filter(a => !a.startsWith(PREFIJO_EXISTENCIAS));
    const aviso = avisoDeExistencias(this.datos.config, this.datos.movimientos, venta);
    if (aviso) p.propuesta.avisos.push(`${PREFIJO_EXISTENCIAS}${aviso}`);
  }

  /** Un segundo saldo inicial hace que lo anterior deje de contar: se avisa fuerte y se ofrece el arqueo. */
  private avisarSegundoSaldoInicial(p: Pendiente): number {
    p.propuesta.avisos = p.propuesta.avisos.filter(a => !a.startsWith(AVISO_APERTURA));
    if (p.propuesta.tipo !== 'apertura' || p.reemplazaId) return 0;
    const n = movimientosQueSePierden(this.datos.movimientos, this.datos.config.fecha_apertura);
    if (n) p.propuesta.avisos.push(`${AVISO_APERTURA}: si sigues, ${n === 1 ? 'el movimiento que anotaste desde entonces deja' : `los ${n} movimientos que anotaste desde entonces dejan`} de contar en los saldos. Para corregir lo que tienes en un momento, escribe, por ejemplo, «arqueo efectivo 80000 monedas 11500».`);
    return n;
  }

  /** Los saldos con los que se mide una tarjeta: al editar un movimiento guardado, sin ese movimiento. */
  private saldosPara(p: Pendiente) {
    if (!p.reemplazaId) return this.saldos;
    return calcularSaldos(this.datos.movimientos.filter(m => m.id !== p.reemplazaId), this.apertura);
  }

  /** Pone (o quita) el aviso de «falta plata» en la tarjeta y devuelve lo que falta. */
  private avisarFaltaPlata(p: Pendiente, saldos: ReturnType<typeof calcularSaldos>): Falta[] {
    p.propuesta.avisos = p.propuesta.avisos.filter(a => !a.startsWith(AVISO_FALTA));
    if (p.propuesta.faltantes.length) return [];
    const faltas = faltaPlata(p.propuesta, this.ctx, saldos);
    for (const f of faltas) {
      p.propuesta.avisos.push(`${AVISO_FALTA}${f.nombre}: hay ${formatear(f.tiene, f.moneda)} y esto saca ${formatear(f.sale, f.moneda)} (quedaría en -${formatear(f.faltan, f.moneda)}). Casi siempre es que falta anotar algo antes, como un vuelto o una transferencia.`);
    }
    return faltas;
  }

  /** De qué otra cuenta se puede pasar lo que falta: la billetera primero, y solo si ahí alcanza. */
  private formaDeCubrir(f: Falta, saldos: ReturnType<typeof calcularSaldos>): { id: string; nombre: string } | null {
    const origenes = this.ctx.cuentas
      .filter(c => c.tipo === 'dinero' && c.id !== f.cuentaId && c.moneda === f.moneda && (saldos.get(`${c.id}|${c.moneda}`) ?? 0) >= f.faltan)
      .sort((a, b) => Number(b.id === 'efectivo') - Number(a.id === 'efectivo'));
    return origenes[0] ? { id: origenes[0].id, nombre: origenes[0].nombre } : null;
  }

  /** «Pasar de Efectivo a Monedas»: anota la transferencia que faltaba y vuelve a mostrar la tarjeta. */
  private async cubrirFalta(): Promise<Salida[]> {
    const p = this.pend;
    if (!p) return [{ texto: 'Eso ya no está pendiente.' }];
    const saldos = this.saldosPara(p);
    const f = faltaPlata(p.propuesta, this.ctx, saldos)[0];
    const origen = f && this.formaDeCubrir(f, saldos);
    if (!f || !origen) return this.mostrar(p); // ya no hace falta (o no hay de dónde): se muestra tal cual
    const t: Propuesta = {
      tipo: 'transferencia', ocurridoEn: p.propuesta.ocurridoEn, concepto: 'Transferencia', monto: f.faltan, moneda: f.moneda,
      cuentaId: origen.id, cuentaDestinoId: f.cuentaId, mensajeOriginal: 'pasar lo que faltaba', avisos: [], faltantes: [],
    };
    const id = crypto.randomUUID();
    const hecho = construirMovimiento(t, this.ctx, saldos, id, this.origen);
    await this.repo.guardarMovimiento(hecho.movimiento, hecho.cuentasNuevas, hecho.compromisos);
    this.datos = await this.repo.cargar();
    this.ctx = contextoDe(this.datos, this.ctx.ahora);
    const aviso: Salida = {
      texto: `↔️ Pasé ${formatear(f.faltan, f.moneda)} de ${origen.nombre} a ${f.nombre}. Si no era eso, pulsa Deshacer.`,
      botones: [{ id: `undo:${id}`, titulo: '↩️ Deshacer' }],
    };
    return [aviso, ...(await this.mostrar(p))];
  }

  /**
   * Atajos para cambiar con qué se pagó, solo cuando el movimiento sale del efectivo y la persona no
   * lo dijo: pagar justo, o con uno de los dos billetes que alcanzan.
   */
  private atajosDePago(p: Propuesta): Boton[] {
    const dicho = p.pagoCon !== undefined || p.pagoMonedas !== undefined || p.restoEnMonedas || p.vuelto;
    if (!sacaEfectivo(p) || dicho) return [];
    const modo = pagoDe(p, this.ctx, this.saldos).modo;
    const atajos: Boton[] = billetesSugeridos(p.monto).map(b => ({ id: `pago:${b}`, titulo: `Pagué con ${formatear(b)}` }));
    if (modo !== 'justo') atajos.unshift({ id: 'pago:justo', titulo: 'Pagué justo' });
    return atajos;
  }

  // ---------------------------------------------------------------- confirmar

  private async confirmar(): Promise<Salida[]> {
    const p = this.pend;
    if (!p) return [{ texto: 'No hay nada pendiente por confirmar.' }];
    // en una lista, confirmar una tarjeta que solo espera la categoría la guarda en Otros (se cambia luego con Editar)
    // para que las demás no se queden atascadas detrás de una pregunta
    const otros = this.ctx.cuentas.find(c => c.id === 'cat:otros');
    if ((p.total ?? 1) > 1 && otros && p.propuesta.faltantes.length && p.propuesta.faltantes.every(f => f.campo === 'categoria')) {
      p.propuesta = { ...p.propuesta, categoriaId: otros.id, faltantes: [] };
    }
    if (p.propuesta.faltantes.length) {
      return [{ texto: `Antes de guardar: ${p.propuesta.faltantes[0].pregunta}`, botones: [{ id: 'no', titulo: '❌ Cancelar' }] }];
    }
    // El id nace con la tarjeta: si se toca Confirmar dos veces, los dos toques guardan el mismo movimiento.
    const id = p.id ?? crypto.randomUUID();
    let hecho;
    try {
      hecho = construirMovimiento(p.propuesta, this.ctx, this.saldosPara(p), id, this.origen);
    } catch (err) {
      return [{ texto: `No pude guardarlo: ${(err as Error).message.replace(/[.]$/, '')}. Pulsa Editar para corregirlo.`, botones: BOTONES_TARJETA }];
    }
    // Primero se guarda lo nuevo y después se anula el original: si algo falla en medio, no se pierde nada (a lo sumo queda repetido).
    // El nuevo recuerda a quién reemplazó para que «Deshacer» pueda devolver el original.
    if (p.reemplazaId) hecho.movimiento.propuesta = { ...p.propuesta, reemplazaA: p.reemplazaId };
    await this.repo.guardarMovimiento(hecho.movimiento, hecho.cuentasNuevas, hecho.compromisos);
    for (const a of p.aprende ?? []) await this.repo.guardarAprendido(a.palabra, { categoriaId: a.categoriaId });
    if (p.reemplazaId) await this.repo.anularMovimiento(p.reemplazaId, aLocal(this.ctx.ahora));
    if (p.propuesta.tipo === 'apertura') await this.repo.setConfig('fecha_apertura', p.propuesta.ocurridoEn);
    const ap = p.propuesta.apodoNuevo;
    if (ap) {
      const actuales = JSON.parse(this.datos.config.apodos_personas ?? '{}') as Record<string, string[]>;
      const lista = new Set([...(actuales[ap.personaId] ?? []), ap.apodo]);
      await this.repo.setConfig('apodos_personas', JSON.stringify({ ...actuales, [ap.personaId]: [...lista] }));
    }
    await this.repo.guardarPendiente(null);
    this.pend = null;

    // Con lo guardado: cierra deudas ya pagadas, calcula saldo y alerta de tope
    const d2 = await this.repo.cargar();
    const apertura2 = d2.config.fecha_apertura ?? '2000-01-01 00:00:00';
    const porSaldar = compromisosSaldados(d2.movimientos, d2.cuentas, d2.compromisos, apertura2);
    if (porSaldar.length) await this.repo.actualizarCompromisos(porSaldar);
    // los que ya quedaron saldados al anular el original (editar un pago) también se celebran
    const activas = new Set(this.datos.compromisos.filter(c => c.estado === 'activa').map(c => c.id));
    const saldados = [...porSaldar, ...d2.compromisos.filter(c => c.estado === 'saldada' && activas.has(c.id) && !porSaldar.some(x => x.id === c.id))];
    const ctx2 = contextoDe(d2, this.ctx.ahora);
    const saldos2 = calcularSaldos(d2.movimientos, apertura2);

    const l = ['✅ Guardado', resumenGuardado(p.propuesta, ctx2)];
    const tocadas = new Set(hecho.movimiento.asientos.map(a => a.cuentaId));
    for (const c of d2.cuentas.filter(c => c.tipo === 'dinero' && tocadas.has(c.id))) {
      l.push(`${c.nombre}: ${formatear(saldos2.get(`${c.id}|${c.moneda}`) ?? 0, c.moneda)}`);
    }
    for (const s of saldados) {
      const persona = d2.cuentas.find(c => c.id === s.personaId)?.nombre ?? '';
      l.push(`🎉 Deuda con ${persona} saldada`);
    }
    const alerta = alertaPresupuesto(d2.movimientos, ctx2, p.propuesta.categoriaId);
    if (alerta) l.push(alerta);
    const botones: Boton[] = [{ id: `edit:${id}`, titulo: '✏️ Editar' }, { id: `undo:${id}`, titulo: '↩️ Deshacer' }];
    // unos pesos de diferencia con una persona (150.000 enviados, 149.984 pagados): se ofrece cuadrarlos
    for (const a of hecho.movimiento.asientos) {
      const per = d2.cuentas.find(c => c.id === a.cuentaId && c.tipo === 'persona' && a.moneda === 'COP');
      const quedan = per ? saldos2.get(`${per.id}|COP`) ?? 0 : 0;
      if (per && quedan !== 0 && Math.abs(quedan) <= 1000 && p.propuesta.tipo !== 'ajuste') {
        l.push(`Quedaron ${formatear(Math.abs(quedan))} sin cuadrar con ${per.nombre}. Si no los vas a devolver ni cobrar, cuádralos.`);
        botones.push({ id: `cuad:${per.clave}`, titulo: `Cuadrar con ${per.nombre}` });
        break;
      }
    }
    const guardado: Salida = { texto: l.join('\n'), botones };
    if (p.siguientes?.length) {
      // lo siguiente se interpreta ya con lo recién guardado (personas nuevas, saldos al día)
      this.datos = d2;
      this.ctx = ctx2;
      return [guardado, ...(await this.siguienteDe(p.siguientes, p.total ?? p.siguientes.length + 1))];
    }
    return [guardado];
  }

  private async deshacer(id: string, aunqueQuedeNegativo = false): Promise<Salida[]> {
    const m = this.datos.movimientos.find(x => x.id === id);
    if (!m) return [{ texto: 'No encuentro ese movimiento.' }];
    if (m.estado === 'anulado') return [{ texto: 'Ese movimiento ya estaba anulado.' }];
    const cerrado = this.avisoSiCerrado(m.ocurridoEn, m.descripcion);
    if (cerrado) return [{ texto: cerrado }];
    if (m.tipo === 'apertura') return [{ texto: MENSAJE_APERTURA }];
    // Si este movimiento reemplazó a otro al editarlo, deshacer devuelve el original.
    const original = this.originalReemplazado(m);
    if (original) return this.devolverOriginal(m, original, aunqueQuedeNegativo);
    const abonos = this.avisoDeAbonos([m]);
    if (abonos) return abonos;
    // Anular algo de lo que otros movimientos dependen (unas monedas que luego fueron a la alcancía)
    // dejaría una cuenta en negativo: se avisa antes y se deja anular igual si la persona insiste.
    const falta = aunqueQuedeNegativo ? [] : quedaNegativoSin(this.datos.movimientos, this.ctx.cuentas, this.apertura, [id]);
    if (falta.length) {
      const l = falta.map(f => `${f.nombre} quedaría en -${formatear(f.faltan, f.moneda)}`).join(' y ');
      return [{
        texto: `⚠️ Si anulas «${m.descripcion}», ${l}: hay movimientos posteriores que usaron esa plata. Anula primero lo que depende de esto, o anúlalo igual y revisa los saldos después.`,
        botones: [{ id: `undo!:${id}`, titulo: '↩️ Anular igual' }, { id: 'nada', titulo: 'No anular' }],
      }];
    }
    await this.repo.anularMovimiento(id, aLocal(this.ctx.ahora));
    await this.olvidarUltimaMeta();
    return [{ texto: `↩️ Anulado: ${m.descripcion}. (No se borró: queda marcado como anulado.)` }];
  }

  /** El movimiento que este reemplazó al editarlo, si todavía está anulado y se puede devolver. */
  private originalReemplazado(m: Movimiento): Movimiento | undefined {
    const id = (m.propuesta as { reemplazaA?: string } | undefined)?.reemplazaA;
    return id ? this.datos.movimientos.find(x => x.id === id && x.estado === 'anulado') : undefined;
  }

  /** Deshacer una edición: se anula la versión nueva y vuelve a contar la que había antes. */
  private async devolverOriginal(m: Movimiento, original: Movimiento, aunqueQuedeNegativo: boolean): Promise<Salida[]> {
    const cerrado = this.avisoSiCerrado(original.ocurridoEn, original.descripcion);
    if (cerrado) return [{ texto: cerrado }];
    const conOriginal = this.datos.movimientos.map(x => (x.id === original.id ? { ...x, estado: 'ok' as const } : x));
    const falta = aunqueQuedeNegativo ? [] : quedaNegativoSin(conOriginal, this.ctx.cuentas, this.apertura, [m.id]);
    if (falta.length) {
      return [{
        texto: `⚠️ Si deshaces la edición de «${m.descripcion}», ${falta.map(f => `${f.nombre} quedaría en -${formatear(f.faltan, f.moneda)}`).join(' y ')}: hay movimientos posteriores que usaron esa plata. ¿La deshago igual?`,
        botones: [{ id: `undo!:${m.id}`, titulo: '↩️ Anular igual' }, { id: 'nada', titulo: 'No anular' }],
      }];
    }
    await this.repo.restaurarMovimiento(original.id, aLocal(this.ctx.ahora));
    await this.repo.anularMovimiento(m.id, aLocal(this.ctx.ahora));
    await this.olvidarUltimaMeta();
    return [{ texto: `↩️ Deshice la edición: volvió el original (${original.descripcion}, ${formatear(propuestaDe(original)?.monto ?? 0, propuestaDe(original)?.moneda ?? 'COP')}).` }];
  }

  /** Si algo de lo que se anula dejó abonos hechos después, anular solo eso dejaría una deuda al revés: se ofrece anular todo junto. */
  private avisoDeAbonos(ms: Movimiento[]): Salida[] | null {
    const huerfanos = abonosHuerfanos(this.datos.movimientos, this.ctx.cuentas, this.apertura, ms.map(m => m.id));
    if (!huerfanos.length) return null;
    const quienes = [...new Set(huerfanos.map(h => h.persona))].join(' y ');
    const cuantos = huerfanos.length === 1 ? 'un abono' : `${huerfanos.length} abonos`;
    const todos = [...ms.map(m => m.id), ...huerfanos.map(h => h.abono.id)];
    return [{
      texto: `⚠️ «${ms.map(m => m.descripcion).join(', ')}» ya tiene ${cuantos} de ${quienes} (${huerfanos.map(h => formatear(propuestaDe(h.abono)?.monto ?? 0, propuestaDe(h.abono)?.moneda ?? 'COP')).join(', ')}). Si lo anulas solo, ${quienes} quedaría con una deuda al revés. Anula todo junto o deja el movimiento como está.`,
      botones: [{ id: `unds!:${todos.join(',')}`, titulo: '↩️ Anular todo junto' }, { id: 'nada', titulo: 'No anular' }],
    }];
  }

  private async reabrir(id: string): Promise<Salida[]> {
    const m = this.datos.movimientos.find(x => x.id === id);
    if (!m || m.estado === 'anulado') return [{ texto: 'No encuentro ese movimiento (o ya está anulado).' }];
    const cerrado = this.avisoSiCerrado(m.ocurridoEn, m.descripcion);
    if (cerrado) return [{ texto: cerrado }];
    if (!m.propuesta) return [{ texto: 'Este movimiento no se puede editar desde aquí. Deshazlo y escríbelo de nuevo.' }];
    return this.mostrar({ propuesta: m.propuesta as Propuesta, editando: true, reemplazaId: id });
  }

  // ---------------------------------------------------------------- comandos

  /** Los últimos `n` movimientos propios sin anular, del más nuevo al más viejo (si hay empate de hora, manda el orden en que se guardaron). */
  private ultimosPropios(n: number): Movimiento[] {
    const orden = new Map(this.datos.movimientos.map((m, i) => [m.id, i]));
    return this.datos.movimientos
      // el saldo inicial nunca es «lo último que anoté»: anularlo deja todos los saldos en el aire
      .filter(m => m.estado === 'ok' && m.origen !== 'excel' && m.tipo !== 'apertura')
      .sort((a, b) => b.creadoEn.localeCompare(a.creadoEn) || (orden.get(b.id) ?? 0) - (orden.get(a.id) ?? 0))
      .slice(0, n);
  }

  /** Anula varios movimientos a la vez, con las mismas guardas que anular uno (meses cerrados y plata que deja de alcanzar). */
  private async anularVarios(ms: Movimiento[], forzar: boolean): Promise<Salida[]> {
    for (const m of ms) {
      const cerrado = this.avisoSiCerrado(m.ocurridoEn, m.descripcion);
      if (cerrado) return [{ texto: cerrado }];
      if (m.tipo === 'apertura') return [{ texto: MENSAJE_APERTURA }];
    }
    const abonos = this.avisoDeAbonos(ms);
    if (abonos) return abonos;
    const falta = forzar ? [] : quedaNegativoSin(this.datos.movimientos, this.ctx.cuentas, this.apertura, ms.map(m => m.id));
    if (falta.length) {
      return [{
        texto: `⚠️ Si anulas ${ms.length} movimientos, ${falta.map(f => `${f.nombre} quedaría en -${formatear(f.faltan, f.moneda)}`).join(' y ')}: hay otros que usaron esa plata. ¿Los anulo igual?`,
        botones: [{ id: `unds!:${ms.map(m => m.id).join(',')}`, titulo: '↩️ Anular igual' }, { id: 'nada', titulo: 'No anular' }],
      }];
    }
    for (const m of ms) {
      const original = this.originalReemplazado(m); // si era una edición, vuelve lo que había antes
      if (original) await this.repo.restaurarMovimiento(original.id, aLocal(this.ctx.ahora));
      await this.repo.anularMovimiento(m.id, aLocal(this.ctx.ahora));
    }
    return [{ texto: `↩️ Anulé ${ms.length} movimiento${ms.length > 1 ? 's' : ''}: ${ms.map(m => m.descripcion).join(', ')}. (No se borró nada: quedan marcados como anulados.)` }];
  }

  /** «cuadrar con mamá»: lo poco que quedó pendiente (unos pesos de diferencia) se manda a Descuadre. */
  private async cuadrarConPersona(nombre: string): Promise<Salida[]> {
    const clave = limpiar(nombre);
    const persona = this.ctx.cuentas.find(c => c.tipo === 'persona' && c.clave === clave) ?? this.ctx.cuentas.find(c => c.tipo === 'persona' && c.clave.startsWith(clave));
    if (!persona) return [{ texto: `No conozco a «${nombre}». Escribe «deudas» para ver con quién hay algo pendiente.` }];
    const saldo = this.saldos.get(`${persona.id}|COP`) ?? 0;
    const usd = this.saldos.get(`${persona.id}|USD`) ?? 0;
    if (usd !== 0) return [{ texto: `Con ${persona.nombre} hay dólares pendientes y esos nunca se cuadran solos. Anota el pago real.` }];
    if (saldo === 0) return [{ texto: `Con ${persona.nombre} no hay nada pendiente.` }];
    if (Math.abs(saldo) > 1000) return [{ texto: `Con ${persona.nombre} quedan ${formatear(Math.abs(saldo))}: es mucho para cuadrarlo sin más. Anota el pago o el cobro que falta.` }];
    const propuesta: Propuesta = {
      tipo: 'ajuste', ocurridoEn: aLocal(this.ctx.ahora), concepto: `Cuadrar con ${persona.nombre}`, monto: Math.abs(saldo), moneda: 'COP',
      cuadra: { personaId: persona.id, nombre: persona.nombre, saldo }, mensajeOriginal: `cuadrar con ${nombre}`, avisos: [], faltantes: [],
    };
    return this.mostrar({ propuesta, editando: false });
  }

  private ultimoPropio(): Movimiento | undefined {
    return this.ultimosPropios(1)[0];
  }

  private async comando(c: string, arg?: string): Promise<Salida[]> {
    const { movimientos, compromisos } = this.datos;
    switch (c) {
      case 'saldo': return [{ texto: textoSaldo(movimientos, this.ctx) }];
      case 'existencias': return [{ texto: textoExistencias(this.datos.config, movimientos) }];
      case 'existencias_fijar': return this.fijarExistencias(arg ?? '', false);
      case 'existencias_sumar': return this.fijarExistencias(arg ?? '', true);
      case 'ventas': return [{ texto: textoVentas(arg === 'semana' || arg === 'anio' ? arg : 'mes', movimientos, this.ctx) }];
      case 'semana': return [{ texto: textoResumen('semana', movimientos, this.ctx) }];
      case 'mes': return [{ texto: textoResumen('mes', movimientos, this.ctx) }];
      case 'anio': return [{ texto: textoResumen('anio', movimientos, this.ctx) }];
      case 'saldo_cuenta': return [{ texto: textoSaldoDe(arg ?? '', movimientos, this.ctx) }];
      case 'corte': return [{ texto: textoCorte(corteDeTurno(this.datos, this.ctx.ahora, arg === 'semana' ? 'semana' : 'dia')) }];
      case 'presupuesto_semana': return [{ texto: textoPresupuestoSemana(this.datos, this.ctx.ahora) }];
      case 'deudas': return [{ texto: textoDeudas(movimientos, compromisos, this.ctx) }];
      case 'ultimos': return [{ texto: textoUltimos(movimientos, this.ctx) }];
      case 'ayuda': return [{ texto: textoAyuda(this.ctx) }];
      case 'categoria': return [{ texto: textoCategoria(arg ?? '', movimientos, this.ctx) }];
      case 'evento': return [{ texto: textoEvento(arg ?? '', movimientos, this.ctx) }];
      case 'lista': return [{ texto: textoLista(leerLista(this.datos.config)) }];
      case 'lista_agregar': return this.agregarALista(arg ?? '');
      case 'lista_quitar': return this.quitarDeLista(arg ?? '');
      case 'recurrente_agregar': return this.agregarRecurrente(arg ?? '');
      case 'recurrente_quitar': return this.quitarRecurrente(arg ?? '');
      case 'recurrente_pausar': return this.cambiarFijo(arg ?? '', 'pausar');
      case 'recurrente_reanudar': return this.cambiarFijo(arg ?? '', 'reanudar');
      case 'recurrente_fin': return this.cambiarFijo(arg ?? '', 'fin');
      case 'persona_agregar': return this.agregarPersona(arg ?? '');
      case 'persona_renombrar': return this.renombrarPersona(arg ?? '');
      case 'cierre_cerrar': return this.cerrarMes(arg ?? '');
      case 'cierre_abrir': { await this.repo.setConfig('cerrado_hasta', ''); return [{ texto: '🔓 Abrí todos los meses. Puedes anotar y corregir fechas de antes.' }]; }
      case 'cierre_ver': { const h = this.cerradoHasta(); return [{ texto: h ? `🔒 Cerrado hasta el ${describirDia(h)}. Para abrirlo escribe «abrir meses».` : 'No hay meses cerrados. Para cerrar uno: «cerrar mes octubre».' }]; }
      case 'subcategoria': return this.crearSubcategoria(arg ?? '');
      case 'aprender': return alAprender(arg ?? '', this.ctx, this.repo);
      case 'metas': return [{ texto: textoMetas(leerMetas(this.datos.config)) }];
      case 'meta_fijar': return this.fijarMeta(arg ?? '');
      case 'meta_apartar': return this.moverMeta(arg ?? '', 1);
      case 'meta_sacar': return this.moverMeta(arg ?? '', -1);
      case 'meta_quitar': return this.quitarMeta(arg ?? '');
      case 'recurrentes': return [{ texto: textoRecurrentes(leerRecurrentes(this.datos.config)) }];
      case 'revision': return [{ texto: textoRevision(this.datos, this.ctx.ahora) }];
      case 'jornales': return [{ texto: textoJornales(arg === 'pasada' || arg === 'mes' ? arg : 'semana', movimientos, this.ctx) }];
      case 'cuadrar_persona': return this.cuadrarConPersona(arg ?? '');
      case 'deshacer_varios': {
        const n = Number(arg);
        if (!(n >= 1)) return [{ texto: 'Dime cuántos: «deshacer 3».' }];
        const ms = this.ultimosPropios(Math.min(n, 10));
        if (!ms.length) return [{ texto: 'No hay nada que deshacer.' }];
        return this.anularVarios(ms, false);
      }
      case 'deshacer': {
        const m = this.ultimoPropio();
        const aporte = this.ultimoAporte();
        if (aporte) {
          const { meta, ultimo } = aporte;
          return [{
            texto: `El último comando fue de una meta: ${ultimo.m > 0 ? `apartaste ${formatear(ultimo.m)} para` : `sacaste ${formatear(-ultimo.m)} de`} ${meta.nombre}. ¿Qué quieres deshacer?`,
            botones: [
              { id: `undometa:${ultimo.id}`, titulo: '↩️ Deshacer aporte' },
              ...(m ? [{ id: `undo:${m.id}`, titulo: `Anular «${m.descripcion}»` }] : []),
              { id: 'nada', titulo: 'Ninguno' },
            ],
          }];
        }
        return m ? this.deshacer(m.id) : [{ texto: 'No hay nada que deshacer.' }];
      }
      case 'editar_ultimo': {
        const m = this.ultimoPropio();
        if (!m) return [{ texto: 'No hay nada que editar.' }];
        const abierta = await this.reabrir(m.id);
        // «cambia el monto a 7000»: con la tarjeta ya abierta se aplica el cambio dicho («monto 7000»)
        if (arg && this.pend) {
          const cambio = aplicarCambio(this.pend.propuesta, arg, this.ctx);
          if (cambio) return this.mostrar({ ...this.pend, propuesta: cambio });
        }
        return abierta;
      }
    }
    return [{ texto: textoAyuda(this.ctx) }];
  }

  // ---------------------------------------------------------------- lista de compras

  private async agregarALista(texto: string): Promise<Salida[]> {
    const cosas = separarCosas(texto);
    if (!cosas.length) return [{ texto: '¿Qué agrego a la lista? Ejemplo: «falta arroz y sal».' }];
    const lista = leerLista(this.datos.config);
    const nuevas = cosas.filter(c => !lista.some(x => limpiar(x) === limpiar(c)));
    if (nuevas.length) await this.repo.setConfig('lista_compras', JSON.stringify([...lista, ...nuevas]));
    return [{ texto: nuevas.length ? `🛒 Agregué a la lista: ${nuevas.join(', ')}.` : 'Eso ya estaba en la lista.' }];
  }

  private async quitarDeLista(texto: string): Promise<Salida[]> {
    const cosas = separarCosas(texto);
    const lista = leerLista(this.datos.config);
    const quitadas = lista.filter(x => cosas.some(c => limpiar(c) === limpiar(x)));
    if (!quitadas.length) {
      return [{ texto: `No tengo «${cosas.join(', ')}» en la lista. Si lo compraste y quieres anotar el gasto, dime cuánto costó: «arroz 8000».` }];
    }
    await this.repo.setConfig('lista_compras', JSON.stringify(lista.filter(x => !quitadas.includes(x))));
    return [{ texto: `✅ Taché de la lista: ${quitadas.join(', ')}.` }];
  }

  // ---------------------------------------------------------------- meses cerrados

  /** Hasta qué día (AAAA-MM-DD, inclusive) está cerrado todo, o null. */
  private cerradoHasta(): string | null {
    const h = this.datos.config.cerrado_hasta;
    return h && /^\d{4}-\d{2}-\d{2}$/.test(h) ? h : null;
  }

  /** Un texto si esa fecha cae en un mes cerrado. */
  private avisoSiCerrado(fecha: string, que: string): string | null {
    const h = this.cerradoHasta();
    if (!h || fecha.slice(0, 10) > h) return null;
    return `🔒 ${que} es de ${nombreMes(fecha)}, que está cerrado (hasta el ${describirDia(h)}). Si de verdad hace falta, escribe «abrir meses», corrige y vuelve a cerrar.`;
  }

  private async cerrarMes(arg: string): Promise<Salida[]> {
    const [nombre, anioTexto] = arg.split('|');
    const mes = indiceMes(nombre ?? '');
    if (!(mes >= 0)) return [{ texto: 'No entendí el mes. Ejemplo: «cerrar mes octubre».' }];
    const hoy = aLocal(this.ctx.ahora);
    const mesHoy = Number(hoy.slice(5, 7)) - 1, anioHoy = Number(hoy.slice(0, 4));
    const anio = anioTexto ? Number(anioTexto) : mes > mesHoy ? anioHoy - 1 : anioHoy;
    if (anio > anioHoy || (anio === anioHoy && mes >= mesHoy)) return [{ texto: `${titulo(nombre)} todavía no termina. Solo se cierran meses que ya pasaron.` }];
    const ultimo = new Date(Date.UTC(anio, mes + 1, 0)).getUTCDate();
    const hasta = `${anio}-${String(mes + 1).padStart(2, '0')}-${String(ultimo).padStart(2, '0')}`;
    await this.repo.setConfig('cerrado_hasta', hasta);
    return [{ texto: `🔒 Cerré hasta el ${describirDia(hasta)}. Nada de ese tiempo se puede anotar, corregir ni anular hasta que escribas «abrir meses».` }];
  }

  // ---------------------------------------------------------------- subcategorías

  /** «restaurante|comida»: crea la categoría Restaurante y la deja dentro de Comida. */
  private async crearSubcategoria(arg: string): Promise<Salida[]> {
    const [hijo, padre] = arg.split('|').map(x => x.trim());
    const ejemplo = 'Ejemplo: «subcategoria restaurante de comida».';
    if (!hijo || !padre) return [{ texto: `Falta el nombre o la categoría de arriba. ${ejemplo}` }];
    const cats = this.ctx.cuentas.filter(c => c.tipo === 'categoria');
    const arriba = cats.find(c => c.clave === limpiar(padre)) ?? cats.find(c => c.clave.startsWith(limpiar(padre)));
    if (!arriba) return [{ texto: `No encuentro la categoría «${padre}». ${ejemplo}` }];
    const mapa: Record<string, string> = leerSubcategorias(this.datos.config);
    const existente = cats.find(c => c.clave === limpiar(hijo));
    if (existente && mapa[existente.id] === arriba.id) return [{ texto: `Ya existe: ${existente.nombre} está dentro de ${arriba.nombre}.` }];
    if (existente?.id === arriba.id) return [{ texto: `Una categoría no puede ir dentro de sí misma.` }];
    if (existente && descendientes(mapa, existente.id).includes(arriba.id)) return [{ texto: `${arriba.nombre} ya está dentro de ${existente.nombre}: no se puede poner al revés.` }];
    // sin existente se mide como una categoría nueva (sin nada por debajo)
    if (!(existente ? puedeIrDentro(mapa, existente.id, arriba.id) : puedeIrDentro({ ...mapa, __nueva: '' }, '__nueva', arriba.id))) return [{ texto: `Eso pasaría de ${MAX_NIVELES} niveles (categoría, subcategoría y sub-subcategoría).` }];
    let cuenta = existente;
    if (!cuenta) {
      const base = `cat:${limpiar(hijo).replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'nueva'}`;
      let id = base;
      for (let n = 2; this.ctx.cuentas.some(c => c.id === id); n++) id = `${base}-${n}`;
      cuenta = { id: id.slice(0, 60), nombre: titulo(hijo).slice(0, 40), clave: limpiar(hijo), tipo: 'categoria', moneda: 'COP' };
      await this.repo.guardarCuenta(cuenta);
    }
    await this.repo.setConfig('subcategorias', JSON.stringify({ ...mapa, [cuenta.id]: arriba.id }));
    return [{ texto: `Creé la subcategoría ${cuenta.nombre} dentro de ${arriba.nombre}. Lo que anotes en ${cuenta.nombre} también suma en ${arriba.nombre}.` }];
  }

  // ---------------------------------------------------------------- metas de ahorro

  private async fijarMeta(arg: string): Promise<Salida[]> {
    const [nombre, monto] = arg.split('|');
    const m = hallarMontos(monto ?? '')[0];
    if (!nombre?.trim() || !m || !(m.valor > 0) || m.valor > 2_000_000_000) return [{ texto: 'No entendí. Ejemplo: «meta moto 2000000».' }];
    const metas = leerMetas(this.datos.config);
    const previa = metas.find(x => limpiar(x.nombre) === limpiar(nombre));
    const nueva: Meta = { nombre: titulo(nombre.trim()), meta: aMinor(m.valor, 'COP'), apartado: previa?.apartado ?? 0, ...(previa?.aportes ? { aportes: previa.aportes } : {}), ...(previa?.fecha ? { fecha: previa.fecha } : {}) };
    await this.repo.setConfig('metas', JSON.stringify([...metas.filter(x => limpiar(x.nombre) !== limpiar(nombre)), nueva].slice(0, 20)));
    return [{ texto: `🎯 Meta ${nueva.nombre}: ${formatear(nueva.meta)}. Para apartar: «ahorré 50000 para ${limpiar(nombre)}».` }];
  }

  /** signo +1 aparta, -1 saca. «moto|50000». La plata no cambia de cuenta: solo se anota cuánto está apartado. */
  private async moverMeta(arg: string, signo: 1 | -1, forzar = false): Promise<Salida[]> {
    const [nombre, monto] = arg.split('|');
    const m = hallarMontos(monto ?? '')[0];
    const metas = leerMetas(this.datos.config);
    const meta = metas.find(x => limpiar(x.nombre) === limpiar(nombre ?? ''));
    if (!meta) return [{ texto: `No tengo una meta «${nombre?.trim()}». Escribe «metas» para verlas o «meta ${nombre?.trim()} 500000» para crearla.` }];
    if (!m || !(m.valor > 0)) return [{ texto: 'No entendí el monto. Ejemplo: «ahorré 50000 para moto».' }];
    const cantidad = aMinor(m.valor, 'COP');
    if (signo < 0 && cantidad > meta.apartado) return [{ texto: `Solo hay ${formatear(meta.apartado)} apartados en ${meta.nombre}.` }];
    // apartar más de lo que hay libre (lo que tienes en cuentas menos lo ya apartado) se confirma antes
    const apertura = this.datos.config.fecha_apertura;
    if (signo > 0 && !forzar && apertura && !apertura.startsWith('2000-01-01')) {
      const libre = resumenSaldos(this.datos.movimientos, this.datos.cuentas, this.apertura).disponibleCop - totalApartado(metas);
      if (cantidad > libre) {
        return [{
          texto: `⚠️ Apartar ${formatear(cantidad)} es más de lo que tienes libre: te quedan ${formatear(Math.max(libre, 0))} sin apartar. ¿Lo aparto igual?`,
          botones: [{ id: `metaok:${meta.nombre}|${cantidad}`, titulo: 'Apartar igual' }, { id: 'nada', titulo: 'No apartar' }],
        }];
      }
    }
    meta.apartado += signo * cantidad;
    meta.aportes = [...(meta.aportes ?? []), { f: aLocal(this.ctx.ahora).slice(0, 10), m: signo * cantidad }].slice(-40);
    for (const x of metas) delete x.ultimo;
    const ultimo = { id: crypto.randomUUID(), m: signo * cantidad, n: this.datos.movimientos.length };
    meta.ultimo = ultimo;
    await this.repo.setConfig('metas', JSON.stringify(metas));
    return [{
      texto: textoAvance(meta, signo > 0 ? `🎯 Apartaste ${formatear(cantidad)} para` : `🎯 Sacaste ${formatear(cantidad)} de`),
      botones: [{ id: `undometa:${ultimo.id}`, titulo: '↩️ Deshacer aporte' }],
    }];
  }

  /** El último aporte a una meta, si fue lo último que se hizo (después no se guardó ningún movimiento). */
  private ultimoAporte(): { meta: Meta; ultimo: NonNullable<Meta['ultimo']> } | null {
    for (const meta of leerMetas(this.datos.config)) {
      if (meta.ultimo && meta.ultimo.n === this.datos.movimientos.length) return { meta, ultimo: meta.ultimo };
    }
    return null;
  }

  /** Quita la marca del último aporte: «deshacer» vuelve a hablar de movimientos. */
  private async olvidarUltimaMeta(): Promise<void> {
    const metas = leerMetas(this.datos.config);
    if (!metas.some(x => x.ultimo)) return;
    for (const x of metas) delete x.ultimo;
    await this.repo.setConfig('metas', JSON.stringify(metas));
  }

  /** «Deshacer aporte»: revierte solo ese aporte a la meta, una sola vez. */
  private async deshacerAporte(token: string): Promise<Salida[]> {
    const metas = leerMetas(this.datos.config);
    const meta = metas.find(x => x.ultimo?.id === token);
    if (!meta?.ultimo) return [{ texto: 'Ese aporte ya no se puede deshacer desde aquí. Si hace falta, saca la plata: «saqué 20000 de la meta moto».' }];
    const { m } = meta.ultimo;
    meta.apartado = Math.max(0, meta.apartado - m);
    const aportes = meta.aportes ?? [];
    if (aportes.at(-1)?.m === m) meta.aportes = aportes.slice(0, -1);
    delete meta.ultimo;
    await this.repo.setConfig('metas', JSON.stringify(metas));
    return [{ texto: textoAvance(meta, m > 0 ? `↩️ Deshice el aporte de ${formatear(m)} a` : `↩️ Devolví los ${formatear(-m)} que sacaste de`) }];
  }

  private async quitarMeta(nombre: string): Promise<Salida[]> {
    const metas = leerMetas(this.datos.config);
    const meta = metas.find(x => limpiar(x.nombre) === limpiar(nombre));
    if (!meta) return [{ texto: `No tengo una meta «${nombre}».` }];
    await this.repo.setConfig('metas', JSON.stringify(metas.filter(x => x !== meta)));
    return [{ texto: `Quité la meta ${meta.nombre}${meta.apartado ? ` (tenía ${formatear(meta.apartado)} apartados, la plata sigue en tus cuentas)` : ''}.` }];
  }

  // ---------------------------------------------------------------- gastos que se repiten

  /** «mensual|5||internet 60000»: la frecuencia, el día, el mes (solo anual) y lo que se escribiría para registrarlo. */
  private async agregarRecurrente(arg: string): Promise<Salida[]> {
    const [frecuencia, diaTexto, mesTexto, ...resto] = arg.split('|');
    const frase = resto.join('|').trim();
    const ejemplo = EJEMPLOS_RECURRENTES[frecuencia as Frecuencia] ?? EJEMPLOS_RECURRENTES.mensual;
    if (!diaTexto || !frase) return [{ texto: frecuencia === 'semanal' ? `Falta el día de la semana y el gasto. ${ejemplo}` : `Falta el día y el gasto. ${ejemplo}` }];
    const dia = Number(diaTexto);
    const tope = frecuencia === 'quincenal' ? 13 : frecuencia === 'semanal' ? 7 : 28;
    if (!(dia >= 1 && dia <= tope)) return [{ texto: frecuencia === 'quincenal' ? `El día de la primera quincena va de 1 a 13 (la segunda cae 15 días después). ${ejemplo}` : `El día tiene que ir de 1 a 28 (así sirve para todos los meses). ${ejemplo}` }];
    const mes = Number(mesTexto);
    if (frecuencia === 'anual' && !(mes >= 1 && mes <= 12)) return [{ texto: `Falta el mes. ${ejemplo}` }];
    const res = interpretar(frase, this.ctx);
    if (res.clase !== 'movimiento' || res.propuesta.tipo !== 'gasto') return [{ texto: `No entendí ese gasto. ${ejemplo}` }];
    const monto = res.propuesta.monto;
    const nuevo: Recurrente = { dia, frase, concepto: res.propuesta.concepto, monto, ...(frecuencia === 'mensual' ? {} : { frecuencia: frecuencia as Frecuencia }), ...(frecuencia === 'anual' ? { mes } : {}) };
    const otros = leerRecurrentes(this.datos.config).filter(r => limpiar(r.concepto) !== limpiar(nuevo.concepto));
    await this.repo.setConfig('recurrentes', JSON.stringify([...otros, nuevo].slice(0, 30)));
    return [{ texto: `🔁 ${describirFrecuencia(nuevo).replace(/^./, c => c.toUpperCase())}: ${nuevo.concepto} ${formatear(monto)}. Te aviso dos días antes y hasta que lo anotes. Para anotarlo escribe «${frase}».` }];
  }

  /** «galletas|200»: dice cuántas hay (o, con `sumar`, cuántas llegaron). Desde ese momento se les restan las ventas. */
  private async fijarExistencias(arg: string, sumar: boolean): Promise<Salida[]> {
    const [nombre, n] = arg.split('|');
    const cantidad = Number(n);
    const catalogo = leerCatalogo({ config: this.datos.config });
    const producto = productoPorNombre(catalogo, nombre);
    if (!catalogo || !producto) return [{ texto: `No encuentro «${nombre}» en tu catálogo. Escribe «existencias» para ver los que llevan cuenta.` }];
    if (!Number.isInteger(cantidad) || cantidad < 0 || cantidad > 1_000_000) return [{ texto: 'La cantidad no es válida.' }];
    const quedan = existenciasDe(producto, this.datos.movimientos) ?? 0;
    const total = sumar ? quedan + cantidad : cantidad;
    await this.repo.setConfig('catalogo', JSON.stringify(conConteo(catalogo, producto, total, aLocal(this.ctx.ahora))));
    const unidades = total === 1 ? 'unidad' : 'unidades';
    return [{ texto: sumar ? `📦 Sumé ${cantidad}: ahora hay ${total} ${unidades} de ${producto.nombre}.` : `📦 Quedó anotado: ${total} ${unidades} de ${producto.nombre}. Cada venta las va restando.` }];
  }

  /** Responde a la pregunta «¿Pauso X desde...?»: aplica o descarta la pausa programada que quedó esperando. */
  private async resolverPausaPendiente(aplicar: boolean): Promise<Salida[]> {
    const guardada = this.datos.config.pausa_fijo_pendiente;
    await this.repo.setConfig('pausa_fijo_pendiente', '');
    if (!aplicar) return [{ texto: 'Listo, no cambié nada.' }];
    try {
      const { concepto, desde, hasta } = JSON.parse(guardada ?? '') as { concepto: string; desde: string; hasta?: string };
      const lista = leerRecurrentes(this.datos.config);
      const r = lista.find(x => x.concepto === concepto);
      if (!r) return [{ texto: `Ya no tengo el pago fijo «${concepto}»; no cambié nada.` }];
      const cambiado: Recurrente = { ...r, pausaDesde: desde };
      if (hasta) cambiado.pausaHasta = hasta; else delete cambiado.pausaHasta;
      await this.repo.setConfig('recurrentes', JSON.stringify(lista.map(x => (x === r ? cambiado : x))));
      return [{ texto: `Quedó: ${concepto} en pausa desde el ${diaCorto(desde)}${hasta ? ` y vuelve a contar el ${diaCorto(hasta)}` : ' hasta que lo reanudes'}.` }];
    } catch { return [{ texto: 'No pude leer esa pausa; no cambié nada.' }]; }
  }

  /** «claude|2026-12-21»: pausa, reanuda o termina un pago fijo que ya existe, y deja el resto como estaba. */
  private async cambiarFijo(arg: string, accion: 'pausar' | 'reanudar' | 'fin'): Promise<Salida[]> {
    const [texto, fechaIso = ''] = arg.split('|');
    const lista = leerRecurrentes(this.datos.config);
    const clave = limpiar(texto);
    const exactos = lista.filter(r => limpiar(r.concepto) === clave);
    const hallados = exactos.length ? exactos : lista.filter(r => limpiar(r.concepto).includes(clave) || limpiar(r.frase).includes(clave));
    if (!hallados.length) return [{ texto: `No tengo un pago fijo con «${texto}». Escribe «recurrentes» para verlos.` }];
    if (hallados.length > 1) return [{ texto: `Precisa cuál: ${hallados.map(r => r.concepto).join(', ')}. Escríbelo con más palabras del nombre.` }];
    const r = hallados[0];
    let cambiado: Recurrente;
    let respuesta: string;
    if (accion === 'pausar' && fechaIso) {
      // pausa con fechas: se pregunta antes de tocar nada; el «ok» la aplica (ver aplicarPausaPendiente)
      const hoy = aLocal(this.ctx.ahora).slice(0, 10);
      const p = leerPausa(fechaIso, hoy);
      if (!p) return [{ texto: `No entendí hasta cuándo pausar ${r.concepto}. Dime por ejemplo «pausa ${texto} desde el próximo mes» o «pausa ${texto} por dos meses».` }];
      await this.repo.setConfig('pausa_fijo_pendiente', JSON.stringify({ concepto: r.concepto, desde: p.desde, ...(p.hasta ? { hasta: p.hasta } : {}) }));
      const cuando = `desde el ${diaCorto(p.desde)}${p.hasta ? ` hasta el ${diaCorto(p.hasta)} (ese día vuelve a contar)` : ' sin fecha de regreso'}`;
      return [{
        texto: `${p.aviso ? `${p.aviso}\n` : ''}¿Pauso ${r.concepto} ${cuando}? ${p.desde > hoy ? 'Hasta entonces sigue activo.' : 'No lo cuento ni lo aviso en ese tiempo.'}`,
        botones: [{ id: 'ok', titulo: '✅ Confirmar' }, { id: 'no', titulo: '❌ Cancelar' }],
      }];
    }
    if (accion === 'pausar') {
      cambiado = { ...r, pausado: true };
      respuesta = `Pausé: ${r.concepto}. No lo cuento ni lo aviso hasta que lo reanudes con «reanudar recurrente ${texto}».`;
    } else if (accion === 'reanudar') {
      cambiado = { ...r };
      delete cambiado.pausado;
      delete cambiado.pausaDesde;
      delete cambiado.pausaHasta;
      respuesta = `Reanudé: ${r.concepto}.`;
    } else {
      if (fechaIso === 'mala') return [{ texto: 'Esa fecha no existe. Escríbela así: «fin recurrente claude 21/12/2026».' }];
      const fin = fechaIso || aLocal(this.ctx.ahora).slice(0, 10);
      cambiado = { ...r, fin };
      respuesta = `Listo: ${r.concepto} queda hasta el ${diaCorto(fin)}.`;
    }
    await this.repo.setConfig('recurrentes', JSON.stringify(lista.map(x => (x === r ? cambiado : x))));
    return [{ texto: respuesta }];
  }

  // ---------------------------------------------------------------- personas desde el chat

  /** El grupo con el que se guarda una persona nueva: el que le toca por el nombre si esta instalación lo tiene; si no, el primero. */
  private grupoNuevo(nombre: string): { id: string; nombre: string } {
    const grupos = gruposDe(this.ctx);
    const defecto = grupoPorDefecto(nombre);
    return grupos.find(g => g.id === defecto) ?? grupos[0] ?? { id: defecto, nombre: defecto };
  }

  private async agregarPersona(arg: string): Promise<Salida[]> {
    const clave = limpiar(arg);
    if (!clave) return [{ texto: 'Dime el nombre: «agregar persona Sofia».' }];
    const nombre = titulo(clave);
    const ya = this.ctx.cuentas.find(c => c.tipo === 'persona' && c.clave === clave);
    if (ya) return [{ texto: `Ya tengo a ${ya.nombre}.` }];
    const grupo = this.grupoNuevo(nombre);
    await this.repo.guardarCuenta({ id: idPersona(nombre), nombre, clave, tipo: 'persona', moneda: 'COP', grupo: grupo.id });
    return [{ texto: `Listo: ${nombre} quedó en tu directorio (grupo ${grupo.nombre}).` }];
  }

  private async renombrarPersona(arg: string): Promise<Salida[]> {
    const [viejo, nuevo] = arg.split('|').map(limpiar);
    const personas = this.ctx.cuentas.filter(c => c.tipo === 'persona');
    const p = personas.find(c => c.clave === viejo);
    if (!p) return [{ texto: `No tengo a ${titulo(viejo)}. Escribe «agregar persona ${titulo(viejo)}» para crearla.` }];
    if (!nuevo) return [{ texto: 'Dime el nombre nuevo: «renombrar persona Sofia a Sofi».' }];
    const otra = personas.find(c => c.clave === nuevo && c.id !== p.id);
    if (otra) return [{ texto: `Ya tengo a ${otra.nombre}. Si son la misma persona, usa «es un apodo de...» al anotar un movimiento.` }];
    // el id no cambia: los movimientos viejos siguen apuntando a la misma cuenta
    await this.repo.guardarCuenta({ ...p, nombre: titulo(nuevo), clave: nuevo });
    return [{ texto: `Listo: ${p.nombre} ahora es ${titulo(nuevo)}.` }];
  }

  /** Si el texto es solo el nombre de una persona que ya tienes, su tarjeta; si hay varias posibles, pregunta cuál. */
  private tarjetaDePersona(texto: string): Salida[] | null {
    const clave = limpiar(texto);
    if (!clave || /\d/.test(clave) || clave.split(' ').length > 3) return null;
    const personas = this.ctx.cuentas.filter(c => c.tipo === 'persona');
    const apodos = apodosDePersonas(this.ctx);
    const exacta = personas.find(p => p.clave === clave) ?? personas.find(p => apodos[p.id]?.includes(clave));
    if (exacta) return this.estadoDePersona(exacta);
    if (clave.includes(' ')) return null;
    const mismos = personas.filter(p => p.clave.split(' ')[0] === clave);
    if (mismos.length === 1) return this.estadoDePersona(mismos[0]);
    if (mismos.length > 1) {
      return [{ texto: `¿Cuál ${titulo(clave)}?`, botones: [...mismos.map(p => ({ id: p.id, titulo: p.nombre })), { id: 'nada', titulo: 'Ninguno' }] }];
    }
    return null;
  }

  private estadoDePersona(p: Cuenta): Salida[] {
    const apertura = this.ctx.config.fecha_apertura ?? '2000-01-01 00:00:00';
    const filas = deudasPorPersona(this.datos.movimientos, this.ctx.cuentas, this.datos.compromisos, apertura).filter(d => d.persona.id === p.id);
    const partes = filas.map(d => `${d.saldo > 0 ? 'te debe' : 'le debes'} ${formatear(Math.abs(d.saldo), d.moneda)}`);
    const n = p.nombre;
    return [{
      texto: `${n}: ${partes.length ? partes.join(' y ') : 'sin pendientes'}. ¿Qué quieres anotar?`,
      botones: [
        { id: `ia:=¿Cuánto le prestaste a ${n}? Escríbelo así: «le presté 50k a ${n}».`, titulo: 'Le presté' },
        { id: `ia:=¿Cuánto fue el gasto compartido con ${n}? Escríbelo así: «almuerzo 40k con ${n}».`, titulo: 'Gasto compartido' },
        { id: `ia:=¿Cuánto abonaste o te abonó ${n}? Escríbelo así: «pagué 20k a ${n}» o «${n} me pagó 20k».`, titulo: 'Abono' },
      ],
    }];
  }

  private async quitarRecurrente(texto: string): Promise<Salida[]> {
    const lista = leerRecurrentes(this.datos.config);
    const clave = limpiar(texto);
    const quitados = lista.filter(r => limpiar(r.concepto).includes(clave) || limpiar(r.frase).includes(clave));
    if (!quitados.length) return [{ texto: `No tengo un gasto que se repita con «${texto}». Escribe «recurrentes» para verlos.` }];
    await this.repo.setConfig('recurrentes', JSON.stringify(lista.filter(r => !quitados.includes(r))));
    return [{ texto: `Quité: ${quitados.map(r => r.concepto).join(', ')}.` }];
  }

  // ---------------------------------------------------------------- topes

  private async fijarTope(categoria: string, monto: string): Promise<Salida[]> {
    const cat = this.ctx.cuentas.find(c => c.tipo === 'categoria' && (c.clave === categoria || c.clave.startsWith(categoria)));
    const m = hallarMontos(monto)[0];
    if (!cat || !m) return [{ texto: 'No entendí. Ejemplo: «tope mecato 60000».' }];
    if (!(m.valor > 0) || m.valor > 2_000_000_000) return [{ texto: `El tope tiene que ser mayor que cero. Para quitarlo escribe «quitar tope ${cat.clave}».` }];
    await this.repo.setPresupuesto(cat.id, aMinor(m.valor, 'COP'));
    return [{ texto: `📊 Tope de ${cat.nombre}: ${formatear(aMinor(m.valor, 'COP'))} al mes. Lo verás en las tarjetas de Saldos y Resumen.` }];
  }

  private async quitarTope(categoria: string): Promise<Salida[]> {
    const cat = this.ctx.cuentas.find(c => c.tipo === 'categoria' && (c.clave === categoria || c.clave.startsWith(categoria)));
    if (!cat) return [{ texto: 'No conozco esa categoría.' }];
    await this.repo.setPresupuesto(cat.id, null);
    return [{ texto: `Quité el tope de ${cat.nombre}.` }];
  }
}
