/**
 * El bot: recibe un mensaje o un botón y devuelve las respuestas a mostrar.
 *
 * Corre dentro de la app (también sin conexión) con su copia local de los datos. No sabe
 * nada de redes: solo usa un `Repo`.
 *
 * Flujo: mensaje -> tarjeta "Entendí: ..." -> [Confirmar] [Editar] [Cancelar]. Nada se guarda
 * hasta confirmar. Tras confirmar quedan [Editar] [Deshacer]. El bot nunca borra: solo anula.
 */
import { calcularSaldos, compromisosSaldados, gastoHabitual } from './consultas.ts';
import { construirMovimiento } from './asientos.ts';
import { ejemploDeCuenta } from './entidades.ts';
import { AVISO_APERTURA, AVISO_FALTA, faltaPlata, movimientosQueSePierden, quedaNegativoSin, type Falta } from './guardas.ts';
import { aLocal, deLocal, describirDia, indiceMes, nombreMes } from './fechas.ts';
import { billetesSugeridos } from './efectivo.ts';
import {
  alertaPresupuesto, pagoDe, resumenGuardado, sacaEfectivo, tarjeta, textoAyuda, textoCategoria, textoDeudas,
  textoEvento, textoResumen, textoSaldo, textoUltimos, textoVentas,
} from './mensajes.ts';
import { textoJornales } from './trabajadores.ts';
import { textoRevision } from './revision.ts';
import { aplicarCambio, interpretar, resolverFaltante, type Propuesta } from './parser.ts';
import { hallarMontos, aMinor, formatear } from './dinero.ts';
import { contextoDe, type Datos, type Pendiente, type Repo } from './repo.ts';
import { dividirLinea } from './lineas.ts';
import { descendientes, leerSubcategorias, MAX_NIVELES, puedeIrDentro } from './subcategorias.ts';
import { leerMetas, textoAvance, textoMetas, type Meta } from './metas.ts';
import { leerRecurrentes, type Recurrente } from './recurrentes.ts';
import { limpiar, titulo } from './texto.ts';
import type { Contexto, Movimiento } from './tipos.ts';

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

function textoRecurrentes(lista: Recurrente[]): string {
  return lista.length
    ? ['🔁 Gastos que se repiten cada mes:', ...[...lista].sort((a, b) => a.dia - b.dia).map(r => `• ${r.concepto} ${formatear(r.monto)} (el ${r.dia})`), '', 'Para quitar uno: «quitar recurrente internet».'].join('\n')
    : '🔁 No hay gastos que se repitan. Agrega uno así: «cada mes el 5 internet 60000».';
}

function textoLista(lista: string[]): string {
  return lista.length
    ? ['🛒 Lista de compras:', ...lista.map(x => `• ${x}`), '', 'Cuando compres algo, dime «compré arroz» y lo tacho.'].join('\n')
    : 'La lista de compras está vacía. Para agregar: «falta arroz y sal».';
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
    if (id === 'ok') return this.confirmar();
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
    if (id.startsWith('lista+:')) return this.agregarALista(id.slice(7));
    // una frase que la IA entendió cuando volvió el internet: se trata como si se acabara de escribir
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

    // Topes mensuales: «tope mecato 60000» / «quitar tope mecato»
    const tope = t.match(/^tope ([a-z ]+?) (\d[\d.,]*\s?(?:k|mil)?)$/);
    if (tope) return this.fijarTope(tope[1], tope[2]);
    const quitar = t.match(/^(?:quitar|sin) tope ([a-z ]+)$/);
    if (quitar) return this.quitarTope(quitar[1]);

    const p = this.pend;

    // 1) Estaba esperando una respuesta (categoría, lugar, persona)
    if (p && p.propuesta.faltantes.length) {
      const r = resolverFaltante(p.propuesta, texto, this.ctx);
      if ('error' in r) {
        const nuevo = interpretar(texto, this.ctx);
        if (nuevo.clase === 'error') return [{ texto: r.error, botones: [{ id: 'no', titulo: '❌ Cancelar' }] }];
        // si escribió otra cosa completa, se procesa como mensaje nuevo (abajo)
      } else {
        if (r.aprende) await this.repo.guardarAprendido(r.aprende.palabra, { categoriaId: r.aprende.categoriaId });
        if (r.aprende) this.ctx.aprendido[r.aprende.palabra] = { categoriaId: r.aprende.categoriaId };
        return this.mostrar({ ...p, propuesta: r.propuesta });
      }
    }

    // 2) Hay una tarjeta sin confirmar: ¿el texto es una corrección? («monto 6000», «nequi»,
    //    «vuelto 5k y 500 monedas», «ayer»...). Solo se acepta si TODO el texto es una corrección,
    //    así un gasto nuevo nunca se confunde con una.
    if (p) {
      const cambio = aplicarCambio(p.propuesta, texto, this.ctx);
      if (cambio) return this.mostrar({ ...p, propuesta: cambio });
    }

    // 3) Varios movimientos en un mensaje: se van mostrando de a uno
    const partes = dividirLinea(texto);
    if (partes.length > 1 && !p?.editando) return this.siguienteDe(partes, partes.length);

    // 4) Mensaje nuevo. Si estabas editando, el mensaje completo reemplaza la tarjeta y mantiene
    //    la referencia al movimiento original (que se anula solo al confirmar).
    const res = interpretar(texto, this.ctx);
    if (res.clase === 'comando') return this.comando(res.comando, res.arg);
    if (res.clase === 'error') {
      // Una línea sin plata («Jabón baño») parece algo por comprar: se ofrece anotarla en la lista.
      const limpio = texto.trim();
      if (res.mensaje.startsWith('Me falta el monto') && !/\d/.test(limpio) && limpio.split(/\s+/).length <= 5 && limpio.length <= 60) {
        return [{ texto: `${res.mensaje}
¿O es algo por comprar? Puedo anotarlo en la lista de compras: «${limpio}».`, botones: [{ id: `lista+:${limpio}`, titulo: 'Agregar a la lista' }, { id: 'nada', titulo: 'No' }] }];
      }
      return [{ texto: res.mensaje, noEntendido: true }];
    }
    const reemplazaId = p?.editando ? p.reemplazaId : undefined;
    return this.mostrar({ propuesta: res.propuesta, editando: Boolean(reemplazaId), reemplazaId });
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
        const n = total - restantes.length + 1;
        const salida = await this.mostrar({ propuesta: res.propuesta, editando: false, siguientes: resto, total });
        const cabeza = total > 1 ? `📋 Movimiento ${n} de ${total}` : '';
        salida[0].texto = [...avisos, cabeza].filter(Boolean).join('\n') + '\n' + salida[0].texto;
        return salida;
      }
      avisos.push(`No pude con «${texto}»: ${res.clase === 'error' ? res.mensaje : 'eso no es un movimiento'}`);
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
  private async mostrar(p: Pendiente): Promise<Salida[]> {
    p.id ??= crypto.randomUUID();
    const cerrado = this.avisoSiCerrado(p.propuesta.ocurridoEn, p.propuesta.concepto || 'Ese movimiento');
    if (cerrado) return [{ texto: cerrado }];
    this.avisarSiEsAtipico(p.propuesta);
    this.avisarSiSeRepite(p);
    const saldos = this.saldosPara(p);
    const faltas = this.avisarFaltaPlata(p, saldos);
    const pierde = this.avisarSegundoSaldoInicial(p);
    await this.repo.guardarPendiente(p);
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
        { id: 'edit', titulo: '✏️ Editar' },
        { id: 'ok', titulo: '⚠️ Guardar igual' },
        { id: 'no', titulo: '❌ Cancelar' },
        ...this.atajosDePago(p.propuesta), // «pagué con $10.000» suele ser justo lo que faltaba decir
      ];
      return [{ texto: prefijo + texto, botones }];
    }
    return [{ texto: prefijo + texto, botones: [...BOTONES_TARJETA, ...this.atajosDePago(p.propuesta)] }];
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
    if (p.reemplazaId) await this.repo.anularMovimiento(p.reemplazaId, aLocal(this.ctx.ahora));
    await this.repo.guardarMovimiento(hecho.movimiento, hecho.cuentasNuevas, hecho.compromisos);
    if (p.propuesta.tipo === 'apertura') await this.repo.setConfig('fecha_apertura', p.propuesta.ocurridoEn);
    await this.repo.guardarPendiente(null);

    // Con lo guardado: cierra deudas ya pagadas, calcula saldo y alerta de tope
    const d2 = await this.repo.cargar();
    const apertura2 = d2.config.fecha_apertura ?? '2000-01-01 00:00:00';
    const saldados = compromisosSaldados(d2.movimientos, d2.cuentas, d2.compromisos, apertura2);
    if (saldados.length) await this.repo.actualizarCompromisos(saldados);
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
    // Anular algo de lo que otros movimientos dependen (unas monedas que luego fueron a la alcancía)
    // dejaría una cuenta en negativo: se avisa antes y se deja anular igual si la persona insiste.
    const falta = aunqueQuedeNegativo || m.tipo === 'apertura' ? [] : quedaNegativoSin(this.datos.movimientos, this.ctx.cuentas, this.apertura, [id]);
    if (falta.length) {
      const l = falta.map(f => `${f.nombre} quedaría en -${formatear(f.faltan, f.moneda)}`).join(' y ');
      return [{
        texto: `⚠️ Si anulas «${m.descripcion}», ${l}: hay movimientos posteriores que usaron esa plata. Anula primero lo que depende de esto, o anúlalo igual y revisa los saldos después.`,
        botones: [{ id: `undo!:${id}`, titulo: '↩️ Anular igual' }, { id: 'nada', titulo: 'No anular' }],
      }];
    }
    await this.repo.anularMovimiento(id, aLocal(this.ctx.ahora));
    return [{ texto: `↩️ Anulado: ${m.descripcion}. (No se borró: queda marcado como anulado.)` }];
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
    }
    const falta = forzar ? [] : quedaNegativoSin(this.datos.movimientos, this.ctx.cuentas, this.apertura, ms.map(m => m.id));
    if (falta.length) {
      return [{
        texto: `⚠️ Si anulas ${ms.length} movimientos, ${falta.map(f => `${f.nombre} quedaría en -${formatear(f.faltan, f.moneda)}`).join(' y ')}: hay otros que usaron esa plata. ¿Los anulo igual?`,
        botones: [{ id: `unds!:${ms.map(m => m.id).join(',')}`, titulo: '↩️ Anular igual' }, { id: 'nada', titulo: 'No anular' }],
      }];
    }
    for (const m of ms) await this.repo.anularMovimiento(m.id, aLocal(this.ctx.ahora));
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
      case 'ventas': return [{ texto: textoVentas(arg === 'semana' || arg === 'anio' ? arg : 'mes', movimientos, this.ctx) }];
      case 'semana': return [{ texto: textoResumen('semana', movimientos, this.ctx) }];
      case 'mes': return [{ texto: textoResumen('mes', movimientos, this.ctx) }];
      case 'anio': return [{ texto: textoResumen('anio', movimientos, this.ctx) }];
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
      case 'cierre_cerrar': return this.cerrarMes(arg ?? '');
      case 'cierre_abrir': { await this.repo.setConfig('cerrado_hasta', ''); return [{ texto: '🔓 Abrí todos los meses. Puedes anotar y corregir fechas de antes.' }]; }
      case 'cierre_ver': { const h = this.cerradoHasta(); return [{ texto: h ? `🔒 Cerrado hasta el ${describirDia(h)}. Para abrirlo escribe «abrir meses».` : 'No hay meses cerrados. Para cerrar uno: «cerrar mes octubre».' }]; }
      case 'subcategoria': return this.crearSubcategoria(arg ?? '');
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
        return m ? this.deshacer(m.id) : [{ texto: 'No hay nada que deshacer.' }];
      }
      case 'editar_ultimo': {
        const m = this.ultimoPropio();
        return m ? this.reabrir(m.id) : [{ texto: 'No hay nada que editar.' }];
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
    const nueva: Meta = { nombre: titulo(nombre.trim()), meta: aMinor(m.valor, 'COP'), apartado: metas.find(x => limpiar(x.nombre) === limpiar(nombre))?.apartado ?? 0 };
    await this.repo.setConfig('metas', JSON.stringify([...metas.filter(x => limpiar(x.nombre) !== limpiar(nombre)), nueva].slice(0, 20)));
    return [{ texto: `🎯 Meta ${nueva.nombre}: ${formatear(nueva.meta)}. Para apartar: «ahorré 50000 para ${limpiar(nombre)}».` }];
  }

  /** signo +1 aparta, -1 saca. «moto|50000». La plata no cambia de cuenta: solo se anota cuánto está apartado. */
  private async moverMeta(arg: string, signo: 1 | -1): Promise<Salida[]> {
    const [nombre, monto] = arg.split('|');
    const m = hallarMontos(monto ?? '')[0];
    const metas = leerMetas(this.datos.config);
    const meta = metas.find(x => limpiar(x.nombre) === limpiar(nombre ?? ''));
    if (!meta) return [{ texto: `No tengo una meta «${nombre?.trim()}». Escribe «metas» para verlas o «meta ${nombre?.trim()} 500000» para crearla.` }];
    if (!m || !(m.valor > 0)) return [{ texto: 'No entendí el monto. Ejemplo: «ahorré 50000 para moto».' }];
    const cantidad = aMinor(m.valor, 'COP');
    if (signo < 0 && cantidad > meta.apartado) return [{ texto: `Solo hay ${formatear(meta.apartado)} apartados en ${meta.nombre}.` }];
    meta.apartado += signo * cantidad;
    meta.aportes = [...(meta.aportes ?? []), { f: aLocal(this.ctx.ahora).slice(0, 10), m: signo * cantidad }].slice(-40);
    await this.repo.setConfig('metas', JSON.stringify(metas));
    return [{ texto: textoAvance(meta, signo > 0 ? `🎯 Apartaste ${formatear(cantidad)} para` : `🎯 Sacaste ${formatear(cantidad)} de`) }];
  }

  private async quitarMeta(nombre: string): Promise<Salida[]> {
    const metas = leerMetas(this.datos.config);
    const meta = metas.find(x => limpiar(x.nombre) === limpiar(nombre));
    if (!meta) return [{ texto: `No tengo una meta «${nombre}».` }];
    await this.repo.setConfig('metas', JSON.stringify(metas.filter(x => x !== meta)));
    return [{ texto: `Quité la meta ${meta.nombre}${meta.apartado ? ` (tenía ${formatear(meta.apartado)} apartados, la plata sigue en tus cuentas)` : ''}.` }];
  }

  // ---------------------------------------------------------------- gastos que se repiten

  /** «5|internet 60000»: el día y lo que se escribiría para registrarlo. */
  private async agregarRecurrente(arg: string): Promise<Salida[]> {
    const [diaTexto, frase] = [arg.split('|')[0], arg.split('|').slice(1).join('|').trim()];
    const ejemplo = 'Ejemplo: «cada mes el 5 internet 60000».';
    if (!diaTexto || !frase) return [{ texto: `Falta el día y el gasto. ${ejemplo}` }];
    const dia = Number(diaTexto);
    if (!(dia >= 1 && dia <= 28)) return [{ texto: `El día tiene que ir de 1 a 28 (así sirve para todos los meses). ${ejemplo}` }];
    const res = interpretar(frase, this.ctx);
    if (res.clase !== 'movimiento' || res.propuesta.tipo !== 'gasto') return [{ texto: `No entendí ese gasto. ${ejemplo}` }];
    const monto = res.propuesta.monto;
    const nuevo: Recurrente = { dia, frase, concepto: res.propuesta.concepto, monto };
    const otros = leerRecurrentes(this.datos.config).filter(r => limpiar(r.concepto) !== limpiar(nuevo.concepto));
    await this.repo.setConfig('recurrentes', JSON.stringify([...otros, nuevo].slice(0, 30)));
    return [{ texto: `🔁 Cada mes, el ${dia}: ${nuevo.concepto} ${formatear(monto)}. Te aviso dos días antes y hasta que lo anotes. Para anotarlo escribe «${frase}».` }];
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
    return [{ texto: `📊 Tope de ${cat.nombre}: ${formatear(aMinor(m.valor, 'COP'))} al mes. Te aviso cuando te acerques.` }];
  }

  private async quitarTope(categoria: string): Promise<Salida[]> {
    const cat = this.ctx.cuentas.find(c => c.tipo === 'categoria' && (c.clave === categoria || c.clave.startsWith(categoria)));
    if (!cat) return [{ texto: 'No conozco esa categoría.' }];
    await this.repo.setPresupuesto(cat.id, null);
    return [{ texto: `Quité el tope de ${cat.nombre}.` }];
  }
}
