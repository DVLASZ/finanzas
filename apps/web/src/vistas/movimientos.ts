import { $ } from './dom.ts';
import { fechaAtras } from './resumen.ts';
import { conSubcategorias, describirDia, leerSubcategorias, describirFecha, formatear, limpiar, nombreMes, rangoPeriodo, type Cuenta, type Movimiento } from '../../../../packages/core/src/index.ts';
import { app, bajarFoto, borrarFotoEnServidor, leerTodo, sincronizar, subirFoto } from '../app.ts';
import { esc } from '../carta.ts';
import { escribir, leer } from '../almacen.ts';

/** Baja la foto a 1000 px de lado largo y la guarda como JPEG: un recibo no necesita más y así pesa poco (unos 100 KB). */
async function reducirFoto(archivo: File): Promise<Blob> {
  const bmp = await createImageBitmap(archivo);
  const escala = Math.min(1, 1000 / Math.max(bmp.width, bmp.height));
  const lienzo = document.createElement('canvas');
  lienzo.width = Math.round(bmp.width * escala);
  lienzo.height = Math.round(bmp.height * escala);
  lienzo.getContext('2d')!.drawImage(bmp, 0, 0, lienzo.width, lienzo.height);
  return new Promise((ok, mal) => lienzo.toBlob(b => (b ? ok(b) : mal(new Error('no se pudo'))), 'image/jpeg', 0.7));
}

type Periodo = 'todo' | 'semana' | 'mes' | 'anio';
type Tipo = 'todos' | 'gastos' | 'ingresos' | 'transferencias' | 'deudas';

/** Lo que se eligió en los filtros. Se recuerda entre visitas para no tener que volver a ponerlo. */
interface Filtros { periodo: Periodo; atras: number; tipo: Tipo; categoria: string; cuenta: string; persona: string }
const FILTROS_INICIALES: Filtros = { periodo: 'mes', atras: 0, tipo: 'todos', categoria: '', cuenta: '', persona: '' };
const CLAVE_FILTROS = 'filtros_movimientos';

const TIPOS: [Tipo, string][] = [['todos', 'Todos'], ['gastos', 'Gastos'], ['ingresos', 'Ingresos'], ['transferencias', 'Transferencias'], ['deudas', 'Deudas']];
const DE_TIPO: Record<Tipo, string[]> = {
  todos: [],
  gastos: ['gasto', 'compartido'],
  ingresos: ['ingreso'],
  transferencias: ['transferencia', 'cambio_moneda'],
  deudas: ['prestamo', 'deuda', 'pago'],
};

function leerFiltros(): Filtros {
  try { return { ...FILTROS_INICIALES, ...JSON.parse(localStorage.getItem(CLAVE_FILTROS) ?? '{}') }; } catch { return { ...FILTROS_INICIALES }; }
}
function guardarFiltros(f: Filtros): void {
  try { localStorage.setItem(CLAVE_FILTROS, JSON.stringify(f)); } catch { /* sin almacenamiento: no se recuerda y ya */ }
}

/** Qué monto mostrar para un movimiento y de qué tipo es (gasto, ingreso, neutro). */
function montoVisible(m: Movimiento, cuentas: Cuenta[]): { texto: string; clase: 'mal' | 'bien' | 'neutro' } {
  if (m.tipo === 'apertura') return { texto: '', clase: 'neutro' }; // fija saldos, no es un monto
  const tipoDe = (id: string) => cuentas.find(c => c.id === id)?.tipo;
  const cop = (f: (t: string | undefined) => boolean) => m.asientos.filter(a => a.moneda === 'COP' && f(tipoDe(a.cuentaId))).reduce((s, a) => s + a.monto, 0);
  const gasto = cop(t => t === 'categoria');
  if (gasto !== 0) return { texto: formatear(gasto), clase: gasto > 0 ? 'mal' : 'bien' };
  const ingreso = -cop(t => t === 'fuente');
  if (ingreso !== 0) return { texto: '+' + formatear(ingreso), clase: 'bien' };
  const mayor = [...m.asientos].filter(a => tipoDe(a.cuentaId) !== 'sistema').sort((a, b) => Math.abs(b.monto) - Math.abs(a.monto))[0];
  return mayor ? { texto: formatear(Math.abs(mayor.monto), mayor.moneda), clase: 'neutro' } : { texto: '', clase: 'neutro' };
}

export async function vistaMovimientos(cont: HTMLElement): Promise<void> {
  const { datos, ctx } = await leerTodo();
  let limite = 60;
  let busqueda = '';
  let verAnulados = false;
  const f = leerFiltros();

  const nombre = (id: string) => datos.cuentas.find(c => c.id === id)?.nombre ?? id;
  const tocan = (m: Movimiento, id: string) => m.asientos.some(a => a.cuentaId === id);
  const rango = () => (f.periodo === 'todo' ? null : rangoPeriodo(f.periodo, fechaAtras(ctx.ahora, f.periodo, f.atras)));
  const tituloPeriodo = (): string => {
    const r = rango();
    if (!r) return 'Todo el tiempo';
    return f.periodo === 'mes' ? `${nombreMes(r.desde)} ${r.desde.slice(0, 4)}` : f.periodo === 'anio' ? `Año ${r.desde.slice(0, 4)}` : `Semana del ${describirDia(r.desde.slice(0, 10))}`;
  };

  /** Los movimientos que pasan todos los filtros, de lo más nuevo a lo más viejo. */
  const filtrados = (): Movimiento[] => {
    const q = limpiar(busqueda);
    const r = rango();
    return datos.movimientos
      .filter(m => (verAnulados || m.estado === 'ok')
        && (!r || (m.ocurridoEn >= r.desde && m.ocurridoEn < r.hasta))
        && (f.tipo === 'todos' || DE_TIPO[f.tipo].includes(m.tipo))
        && (!f.categoria || conSubcategorias(datos.config, f.categoria).some(id => tocan(m, id)))
        && (!f.cuenta || tocan(m, f.cuenta))
        && (!f.persona || tocan(m, f.persona))
        && (!q || limpiar(`${m.descripcion} ${m.etiqueta ?? ''} ${m.lugarDesde ?? ''} ${m.lugarHasta ?? ''}`).includes(q)))
      .sort((a, b) => b.ocurridoEn.localeCompare(a.ocurridoEn));
  };

  /** Totales de lo que se está viendo (sin anulados) y en qué categorías se fue. */
  const resumen = (lista: Movimiento[]) => {
    let gastos = 0, ingresos = 0;
    const porCat = new Map<string, number>();
    for (const m of lista) {
      if (m.estado !== 'ok') continue;
      for (const a of m.asientos) {
        const c = datos.cuentas.find(x => x.id === a.cuentaId);
        if (a.moneda !== 'COP' || !c) continue;
        if (c.tipo === 'categoria') { gastos += a.monto; porCat.set(c.id, (porCat.get(c.id) ?? 0) + a.monto); }
        else if (c.tipo === 'fuente') ingresos -= a.monto;
      }
    }
    return { gastos, ingresos, desglose: [...porCat.entries()].filter(([, v]) => v !== 0).sort((a, b) => b[1] - a[1]) };
  };

  const dibujar = () => {
    guardarFiltros(f);
    const lista = filtrados();
    const r = resumen(lista);
    const filas = lista.slice(0, limite).map(m => {
      const v = montoVisible(m, datos.cuentas);
      const cats = m.asientos.map(a => datos.cuentas.find(c => c.id === a.cuentaId)).filter((c): c is Cuenta => Boolean(c));
      const categoria = cats.find(c => c.tipo === 'categoria')?.nombre ?? m.tipo;
      const cuenta = cats.find(c => c.tipo === 'dinero')?.nombre ?? '';
      const ruta = m.lugarDesde || m.lugarHasta ? ` · ${esc(m.lugarDesde ?? '?')} → ${esc(m.lugarHasta ?? '?')}` : '';
      return `<li class="fila ${m.estado === 'anulado' ? 'anulado' : ''}" data-id="${esc(m.id)}">
        <div><div class="titulo">${esc(m.descripcion)}${m.etiqueta ? ` <span class="etiq">#${esc(m.etiqueta)}</span>` : ''}</div>
        <div class="sub">${esc(categoria)}${cuenta ? ' · ' + esc(cuenta) : ''}${ruta} · ${esc(describirFecha(m.ocurridoEn, ctx.ahora, m.sinHora))}</div></div>
        <div class="monto ${v.clase}">${esc(v.texto)}</div></li>`;
    }).join('');
    $<HTMLElement>(cont, '#lista').innerHTML = filas || '<li class="vacio">No hay movimientos con estos filtros.</li>';
    $<HTMLElement>(cont, '#mas').hidden = lista.length <= limite;
    $<HTMLElement>(cont, '#cuenta').innerHTML = `${lista.length} movimientos · Gastos <b>${esc(formatear(r.gastos))}</b> · Ingresos <b>${esc(formatear(r.ingresos))}</b>`;
    $<HTMLElement>(cont, '#desglose').innerHTML = r.desglose.length
      ? `<summary>Desglose por categoría</summary>${r.desglose.map(([id, v]) => `<div class="barra-fila"><span>${esc(nombre(id))}</span><span class="barra-fondo"><span class="barra-relleno" style="width:${Math.max(2, Math.round((Math.abs(v) / Math.abs(r.desglose[0][1] || 1)) * 100))}%"></span></span><span>${esc(formatear(v))}</span></div>`).join('')}`
      : '';
    $<HTMLElement>(cont, '#desglose').hidden = !r.desglose.length;
    $<HTMLElement>(cont, '#titulo-periodo').textContent = tituloPeriodo();
    $<HTMLButtonElement>(cont, '#siguiente').disabled = f.periodo === 'todo' || f.atras === 0;
    $<HTMLElement>(cont, '#nav-periodo').hidden = f.periodo === 'todo';
    for (const b of cont.querySelectorAll<HTMLButtonElement>('[data-periodo]')) b.classList.toggle('activa', b.dataset.periodo === f.periodo);
    for (const b of cont.querySelectorAll<HTMLButtonElement>('[data-tipo]')) b.setAttribute('aria-pressed', String(b.dataset.tipo === f.tipo));
    const hayFiltros = f.tipo !== 'todos' || f.categoria || f.cuenta || f.persona || busqueda;
    $<HTMLButtonElement>(cont, '#limpiar').hidden = !hayFiltros;
  };

  // Las listas de los selects: solo lo que de verdad aparece en algún movimiento.
  const usadas = (tipo: Cuenta['tipo']) => {
    const ids = new Set(datos.movimientos.flatMap(m => m.asientos.map(a => a.cuentaId)));
    for (const padre of Object.values(leerSubcategorias(datos.config))) ids.add(padre); // la de arriba también se puede elegir
    return datos.cuentas.filter(c => c.tipo === tipo && ids.has(c.id)).sort((a, b) => a.nombre.localeCompare(b.nombre, 'es'));
  };
  const opciones = (cs: Cuenta[], vacio: string, actual: string) =>
    `<option value="">${vacio}</option>${cs.map(c => `<option value="${esc(c.id)}"${c.id === actual ? ' selected' : ''}>${esc(c.nombre)}</option>`).join('')}`;

  cont.innerHTML = `
    <div class="pestanas" role="group" aria-label="Periodo">
      ${([['todo', 'Todo'], ['semana', 'Semana'], ['mes', 'Mes'], ['anio', 'Año']] as const).map(([p, t]) => `<button class="pestana" data-periodo="${p}">${t}</button>`).join('')}
    </div>
    <div class="periodo" id="nav-periodo">
      <button class="chip" id="anterior" aria-label="Ver el periodo anterior">‹ Anterior</button>
      <strong id="titulo-periodo"></strong>
      <button class="chip" id="siguiente" aria-label="Ver el periodo siguiente">Siguiente ›</button>
    </div>
    <div class="pestanas filtro-tipos" role="group" aria-label="Tipo">
      ${TIPOS.map(([t, e]) => `<button class="chip" data-tipo="${t}" aria-pressed="false">${e}</button>`).join('')}
    </div>
    <div class="barra filtros">
      <select id="f-categoria" aria-label="Categoría">${opciones(usadas('categoria'), 'Todas las categorías', f.categoria)}</select>
      <select id="f-cuenta" aria-label="Cuenta">${opciones(usadas('dinero'), 'Todas las cuentas', f.cuenta)}</select>
      <select id="f-persona" aria-label="Persona">${opciones(usadas('persona'), 'Todas las personas', f.persona)}</select>
    </div>
    <div class="barra">
      <input id="buscar" type="search" placeholder="Buscar (concepto, #evento, lugar)" aria-label="Buscar" />
      <label class="check"><input type="checkbox" id="anulados" /> anulados</label>
      <button class="chip" id="limpiar" hidden>Quitar filtros</button>
    </div>
    <div class="sub" id="cuenta"></div>
    <details class="desglose" id="desglose" hidden></details>
    <ul class="lista" id="lista"></ul>
    <button class="secundario" id="mas" hidden>Ver más</button>
    <dialog id="detalle"></dialog>`;

  const cambiar = () => { limite = 60; dibujar(); };
  cont.querySelectorAll<HTMLButtonElement>('[data-periodo]').forEach(b => b.addEventListener('click', () => { f.periodo = b.dataset.periodo as Periodo; f.atras = 0; cambiar(); }));
  cont.querySelectorAll<HTMLButtonElement>('[data-tipo]').forEach(b => b.addEventListener('click', () => { f.tipo = b.dataset.tipo as Tipo; cambiar(); }));
  $<HTMLElement>(cont, '#anterior').addEventListener('click', () => { f.atras++; cambiar(); });
  $<HTMLElement>(cont, '#siguiente').addEventListener('click', () => { f.atras = Math.max(0, f.atras - 1); cambiar(); });
  for (const [id, campo] of [['#f-categoria', 'categoria'], ['#f-cuenta', 'cuenta'], ['#f-persona', 'persona']] as const) {
    $<HTMLSelectElement>(cont, id).addEventListener('change', e => { f[campo] = (e.target as HTMLSelectElement).value; cambiar(); });
  }
  $<HTMLButtonElement>(cont, '#limpiar').addEventListener('click', () => {
    Object.assign(f, { tipo: 'todos', categoria: '', cuenta: '', persona: '' });
    busqueda = '';
    $<HTMLInputElement>(cont, '#buscar').value = '';
    for (const id of ['#f-categoria', '#f-cuenta', '#f-persona']) $<HTMLSelectElement>(cont, id).value = '';
    cambiar();
  });
  $<HTMLInputElement>(cont, '#buscar').addEventListener('input', e => { busqueda = (e.target as HTMLInputElement).value; cambiar(); });
  $<HTMLInputElement>(cont, '#anulados').addEventListener('change', e => { verAnulados = (e.target as HTMLInputElement).checked; dibujar(); });
  $<HTMLElement>(cont, '#mas').addEventListener('click', () => { limite += 60; dibujar(); });
  $<HTMLElement>(cont, '#lista').addEventListener('click', e => {
    const li = (e.target as HTMLElement).closest<HTMLElement>('li[data-id]');
    const m = datos.movimientos.find(x => x.id === li?.dataset.id);
    if (!m) return;
    const dlg = $<HTMLDialogElement>(cont, '#detalle');
    dlg.innerHTML = `
      <h3>${esc(m.descripcion)}</h3>
      <p class="sub">${esc(describirFecha(m.ocurridoEn, ctx.ahora, m.sinHora))} · ${esc(m.tipo)} · ${esc(m.origen)}${m.estado === 'anulado' ? ' · ANULADO' : ''}</p>
      ${m.mensajeOriginal ? `<p class="sub">Escribiste: «${esc(m.mensajeOriginal)}»</p>` : ''}
      <ul class="asientos">${m.asientos.map(a => `<li><span>${esc(nombre(a.cuentaId))}</span><span>${formatear(a.monto, a.moneda)}</span></li>`).join('')}</ul>
      <div id="recibo" class="recibo"></div>
      <div class="acciones">
        <label class="secundario archivo">Tomar foto<input type="file" id="fotoCamara" accept="image/*" capture="environment" hidden /></label>
        <label class="secundario archivo">Subir imagen<input type="file" id="fotoArchivo" accept="image/*" hidden /></label>
        ${m.estado === 'ok' ? '<button class="peligro" id="anular">Anular</button>' : ''}
        <button class="secundario" id="cerrar">Cerrar</button>
      </div>`;
    dlg.showModal();
    // La foto se guarda en este aparato y, con internet, también en el servidor: así se ve desde otro celular.
    // Si al tomarla no había internet, se sube la próxima vez que se abra este movimiento.
    const clave = `recibo:${m.id}`;
    const claveSubida = `recibo-subido:${m.id}`;
    const verRecibo = async () => {
      const caja = $<HTMLElement>(dlg, '#recibo');
      let foto = await leer<Blob>(clave);
      if (foto && !(await leer<boolean>(claveSubida))) { if (await subirFoto(m.id, foto)) await escribir(claveSubida, true); }
      if (!foto) {
        foto = (await bajarFoto(m.id)) ?? undefined;
        if (foto) { await escribir(clave, foto); await escribir(claveSubida, true); }
      }
      if (!foto) { caja.innerHTML = ''; return; }
      const url = URL.createObjectURL(foto);
      caja.innerHTML = `<img src="${url}" alt="Foto del recibo" style="max-width:100%;border-radius:8px" /><button class="chip" id="quitarFoto">Quitar la foto</button>`;
      $<HTMLElement>(caja, '#quitarFoto').addEventListener('click', async () => {
        await escribir(clave, undefined); await escribir(claveSubida, undefined);
        void borrarFotoEnServidor(m.id);
        URL.revokeObjectURL(url); await verRecibo();
      });
    };
    void verRecibo();
    // la cámara y el archivo (una captura de pantalla, una foto de la galería) hacen lo mismo
    for (const id of ['#fotoCamara', '#fotoArchivo']) {
      $<HTMLInputElement>(dlg, id).addEventListener('change', async ev => {
        const entrada = ev.target as HTMLInputElement;
        const archivo = entrada.files?.[0];
        entrada.value = ''; // para poder elegir la misma imagen otra vez
        if (!archivo) return;
        try {
          const reducida = await reducirFoto(archivo);
          await escribir(clave, reducida);
          await escribir(claveSubida, undefined); // verRecibo la sube si hay internet
          await verRecibo();
        } catch { alert('No pude leer esa imagen.'); }
      });
    }
    $<HTMLElement>(dlg, '#cerrar').addEventListener('click', () => dlg.close());
    $<HTMLElement>(dlg, '#anular')?.addEventListener('click', async () => {
      if (!confirm(`¿Anular «${m.descripcion}»? No se borra: queda marcado como anulado.`)) return;
      await app.repo.anularMovimiento(m.id, new Date(Date.now() - 5 * 3600e3).toISOString().slice(0, 19).replace('T', ' '));
      dlg.close();
      void sincronizar();
      await vistaMovimientos(cont);
    });
  });
  dibujar();
}
