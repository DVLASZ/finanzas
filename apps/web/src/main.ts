/**
 * Arranque de la app: carga los datos del dispositivo, dibuja la pantalla elegida y sincroniza
 * cuando hay conexión. Se registra el service worker para que funcione sin internet.
 */
import { alternarTema, aplicar, actual } from './apariencia.ts';
import { hayTrabajadores, vendeProductos } from '../../../packages/core/src/index.ts';
import { app, iniciar, leerTodo, sincronizar } from './app.ts';
import { icono } from './iconos.ts';
import {
  actualizarEstado, prellenarChat, vistaAjustes, vistaCatalogo, vistaChat, vistaBuzon, vistaConciliar, vistaCuentas, vistaGuia, vistaDeudas, vistaLista, vistaMovimientos, vistaResumen, vistaSaldos, vistaTrabajadores, vistaRevision,
} from './vistas.ts';

type Pantalla = 'chat' | 'saldos' | 'movimientos' | 'resumen' | 'mas' | 'deudas' | 'ajustes' | 'lista' | 'catalogo' | 'cuentas' | 'guia' | 'conciliar' | 'buzon' | 'trabajadores' | 'revision';

/**
 * Las secciones de la barra de abajo. Solo hay 5 para que se lean grandes; lo demás vive en «Más».
 * Una sección nueva es una fila aquí (y su vista), no hay que tocar nada más.
 */
const BARRA: { id: Pantalla; icono: string; nombre: string }[] = [
  { id: 'chat', icono: 'chat', nombre: 'Chat' },
  { id: 'saldos', icono: 'saldos', nombre: 'Saldos' },
  { id: 'movimientos', icono: 'movs', nombre: 'Movimientos' },
  { id: 'resumen', icono: 'resumen', nombre: 'Resumen' },
  { id: 'mas', icono: 'mas', nombre: 'Más' },
];
/** Lo que se abre desde «Más». */
const EN_MAS: { id: Pantalla | 'ayuda'; icono: string; nombre: string; detalle: string; soloSiVende?: boolean; soloSiTrabajadores?: boolean }[] = [
  { id: 'revision', icono: 'check', nombre: 'Revisión del mes', detalle: 'Lo que conviene mirar: descuadres, cobros viejos' },
  { id: 'trabajadores', icono: 'persona', nombre: 'Pagos a trabajadores', detalle: 'Cuánto se pagó a cada uno', soloSiTrabajadores: true },
  { id: 'buzon', icono: 'deudas', nombre: 'Buzón', detalle: 'Avisos entre tus apps' },
  { id: 'conciliar', icono: 'saldos', nombre: 'Conciliar con el banco', detalle: 'Sube el extracto y ve qué falta anotar' },
  { id: 'guia', icono: 'ayuda', nombre: 'Primeros pasos', detalle: 'Cinco ejemplos para empezar' },
  { id: 'lista', icono: 'movs', nombre: 'Lista de compras', detalle: 'Lo que falta comprar' },
  { id: 'catalogo', icono: 'saldos', nombre: 'Productos y precios', detalle: 'Lo que vendes y cuánto cuesta', soloSiVende: true },
  { id: 'cuentas', icono: 'saldos', nombre: 'Categorías y personas', detalle: 'Crear, renombrar y poner topes' },
  { id: 'deudas', icono: 'deudas', nombre: 'Deudas y préstamos', detalle: 'Quién te debe y a quién le debes' },
  { id: 'ajustes', icono: 'ajustes', nombre: 'Ajustes', detalle: 'Letra, colores, copia de seguridad' },
  { id: 'ayuda', icono: 'ayuda', nombre: 'Ayuda', detalle: 'Cómo escribirme' },
];
/** Las pantallas que se abren desde «Más» y por eso tienen botón para volver. */
const INTERNAS: Pantalla[] = ['deudas', 'ajustes', 'lista', 'catalogo', 'cuentas', 'guia', 'conciliar', 'buzon', 'trabajadores', 'revision'];

const contenido = document.getElementById('contenido')!;
const nav = document.getElementById('nav')!;
let actualPantalla: Pantalla = 'chat';

async function vistaMas(cont: HTMLElement): Promise<void> {
  // Cada app muestra solo lo suyo: «Productos y precios» solo existe donde se vende.
  const { datos, ctx } = await leerTodo();
  const vende = vendeProductos(ctx);
  const conTrabajadores = hayTrabajadores(datos.cuentas, datos.movimientos);
  cont.innerHTML = `<h2 style="margin-top:0">Más</h2><div class="mas-lista">${EN_MAS.filter(x => (!x.soloSiVende || vende) && (!x.soloSiTrabajadores || conTrabajadores)).map(x =>
    `<button data-ir="${x.id}">${icono(x.icono)}<span><b>${x.nombre}</b><br><span class="sub">${x.detalle}</span></span></button>`).join('')}</div>`;
  cont.addEventListener('click', e => {
    const b = (e.target as HTMLElement).closest<HTMLElement>('[data-ir]');
    if (!b) return;
    if (b.dataset.ir === 'ayuda') { prellenarChat('ayuda'); void mostrar('chat'); } else void mostrar(b.dataset.ir as Pantalla);
  });
}

async function mostrar(p: Pantalla): Promise<void> {
  actualPantalla = p;
  const enBarra = INTERNAS.includes(p) ? 'mas' : p;
  nav.querySelectorAll<HTMLElement>('button').forEach(b => b.classList.toggle('activa', b.dataset.p === enBarra));
  contenido.className = `contenido pantalla-${p}`; // ojo: sin chocar con clases como «lista»
  contenido.replaceChildren();
  // Las pantallas internas llevan un botón grande para volver: no hay que adivinar que se sale tocando «Más».
  if (INTERNAS.includes(p)) {
    const volver = document.createElement('button');
    volver.className = 'volver';
    volver.innerHTML = `${icono('atras')}<span>Volver</span>`;
    volver.setAttribute('aria-label', 'Volver al menú Más');
    volver.addEventListener('click', () => void mostrar('mas'));
    contenido.append(volver);
  }
  const caja = document.createElement('div');
  contenido.append(caja);
  switch (p) {
    case 'chat': return vistaChat(caja);
    case 'saldos': return vistaSaldos(caja, () => void mostrar('chat'));
    case 'movimientos': return vistaMovimientos(caja);
    case 'resumen': return vistaResumen(caja);
    case 'mas': return vistaMas(caja);
    case 'deudas': return vistaDeudas(caja, () => void mostrar('chat'));
    case 'ajustes': return vistaAjustes(caja);
    case 'lista': return vistaLista(caja);
    case 'catalogo': return vistaCatalogo(caja);
    case 'cuentas': return vistaCuentas(caja);
    case 'buzon': return vistaBuzon(caja, () => void mostrar('chat'));
    case 'conciliar': return vistaConciliar(caja, () => void mostrar('chat'));
    case 'guia': return vistaGuia(caja, () => void mostrar('chat'));
    case 'trabajadores': return vistaTrabajadores(caja);
    case 'revision': return vistaRevision(caja, () => void mostrar('chat'));
  }
}

/** El botón de la cabecera: la luna si está claro, el sol si está oscuro. */
function pintarBotonTema(): void {
  const b = document.getElementById('cambiar-tema');
  if (b) b.innerHTML = icono(actual().oscuro ? 'sol' : 'luna');
}

async function arrancar(): Promise<void> {
  aplicar();
  pintarBotonTema();
  document.getElementById('cambiar-tema')?.addEventListener('click', () => { alternarTema(); pintarBotonTema(); });
  window.addEventListener('apariencia', pintarBotonTema);

  nav.innerHTML = BARRA.map(p => `<button data-p="${p.id}" aria-label="${p.nombre}">${icono(p.icono)}<span>${p.nombre}</span></button>`).join('');
  nav.addEventListener('click', e => {
    const b = (e.target as HTMLElement).closest<HTMLElement>('button[data-p]');
    if (b) void mostrar(b.dataset.p as Pantalla);
  });

  await iniciar();
  actualizarEstado();
  await mostrar('chat');

  // Sincroniza al abrir, al recuperar la conexión, al volver a la app y cada minuto.
  const sync = async () => {
    await sincronizar();
    actualizarEstado();
    if (actualPantalla === 'saldos' || actualPantalla === 'movimientos' || actualPantalla === 'resumen' || actualPantalla === 'deudas') await mostrar(actualPantalla);
  };
  void sync();
  window.addEventListener('online', () => void sync());
  window.addEventListener('offline', actualizarEstado);
  document.addEventListener('visibilitychange', () => { if (!document.hidden) void sync(); });
  setInterval(() => { if (!document.hidden && app.repo.cola.length) void sync(); }, 60_000);

  // Botón "Instalar app" (Chrome/Edge/Android)
  window.addEventListener('beforeinstallprompt', e => {
    e.preventDefault();
    (window as unknown as { __instalar: unknown }).__instalar = e;
  });

  // Funcionar sin conexión: el service worker guarda la app en el dispositivo.
  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('./sw.js').catch(err => console.warn('Sin service worker:', err));
  }
}

void arrancar();
