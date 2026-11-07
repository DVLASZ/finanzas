import { actualizarEstado } from './estado.ts';
import { $ } from './dom.ts';
import { atajosFrecuentes, calcularAlertas, interpretar, normalizarDictado, procesar, type Boton } from '../../../../packages/core/src/index.ts';
import { icono } from '../iconos.ts';
import { botonHtml, cartaHtml, esc } from '../carta.ts';
import { app, atenderColaIA, leerTodo, encolarFraseIA, hayServidor, pedirAyudaIA, sincronizar } from '../app.ts';
import { escribir, leer } from '../almacen.ts';


/** Los botones de abajo del chat. Saldos, deudas y resúmenes ya tienen su pantalla: aquí solo la ayuda. */
const ATAJOS: [string, string][] = [['ayuda', 'Ayuda']];

/** Lo mínimo del reconocimiento de voz del navegador (Chrome en el celular lo trae; necesita internet). */
interface Alternativa { transcript: string }
interface Resultado { isFinal: boolean; length: number; [i: number]: Alternativa }
interface Reconocimiento {
  lang: string; interimResults: boolean; maxAlternatives: number; continuous: boolean;
  onresult: ((e: { results: ArrayLike<Resultado> }) => void) | null;
  onerror: ((e: { error: string }) => void) | null;
  onend: (() => void) | null;
  start(): void; stop(): void;
}
const Reconocedor = (window as unknown as { SpeechRecognition?: new () => Reconocimiento; webkitSpeechRecognition?: new () => Reconocimiento })
  .SpeechRecognition ?? (window as unknown as { webkitSpeechRecognition?: new () => Reconocimiento }).webkitSpeechRecognition;

const ERRORES_VOZ: Record<string, string> = {
  'not-allowed': 'No me dejaron usar el micrófono. Permítelo en los ajustes del navegador.',
  'service-not-allowed': 'No me dejaron usar el micrófono. Permítelo en los ajustes del navegador.',
  'no-speech': 'No te oí. Toca el micrófono y habla otra vez.',
  'audio-capture': 'No encuentro el micrófono.',
  network: 'Dictar necesita internet. Escríbelo.',
};

interface Burbuja { de: 'yo' | 'bot'; texto: string; botones?: Boton[] }
let burbujas: Burbuja[] = [];
let prellenado = '';
let mandarAlAbrir = false;

/** Deja un texto escrito en el cuadro del chat (para "Registrar pago" desde Deudas). Con `enviar`, además lo manda (queda una tarjeta por confirmar). */
export function prellenarChat(texto: string, enviar = false): void { prellenado = texto; mandarAlAbrir = enviar; }

export async function vistaChat(cont: HTMLElement): Promise<void> {
  if (!burbujas.length) {
    burbujas = (await leer<Burbuja[]>('chat')) ?? [];
    if (!burbujas.length) {
      burbujas = [{ de: 'bot', texto: '👋 ¡Hola! Aquí me cuentas lo que gastaste o te llegó y yo lo anoto.\n1. Escribe como hablas, por ejemplo: «almuerzo 12000».\n2. Te muestro lo que entendí. Pulsa Confirmar y queda guardado.\n3. Si te equivocas, pulsa Editar o Deshacer.\n4. Tus saldos y resúmenes están en las pestañas de abajo.\nSi no sabes qué escribir, pulsa «Ayuda».' }];
    }
  }
  // Avisos con botón (cierre del día, cuenta en negativo) y atajos con lo que más se escribe
  const { datos, ctx } = await leerTodo();
  const avisos = calcularAlertas(datos, ctx.ahora).filter(a => a.acciones?.length && (a.id === 'cierre-dia' || a.id === 'saldo-negativo'));
  const frecuentes = atajosFrecuentes(datos.movimientos, ctx.ahora);
  cont.innerHTML = `
    ${avisos.map((a, i) => `<div class="alerta ${a.nivel}">${esc(a.texto)}<div class="botones">${a.acciones!.map((x, j) => `<button class="chip" data-aviso="${i}.${j}">${esc(x.titulo)}</button>`).join('')}</div></div>`).join('')}
    <div class="chat" id="chat"></div>
    <div class="atajos">${ATAJOS.map(([orden, etiqueta]) => `<button class="chip" data-atajo="${orden}">${etiqueta}</button>`).join('')}${frecuentes.map(f => `<button class="chip" data-atajo="${esc(f)}">${esc(f)}</button>`).join('')}</div>
    <form class="entrada" id="form">
      <input id="texto" type="text" autocomplete="off" autocapitalize="sentences" placeholder="Ej.: almuerzo 12000" aria-label="Escribe lo que pasó" />
      ${Reconocedor ? `<button type="button" id="mic" class="secundario mic" aria-label="Hablar" aria-pressed="false">${icono('mic')}</button>` : ''}
      <button type="submit" class="primario" aria-label="Enviar">Enviar</button>
    </form>
    <div id="vozEstado" class="sub voz-estado" role="status" aria-live="polite"></div>`;
  const caja = $<HTMLElement>(cont, '#chat');
  const input = $<HTMLInputElement>(cont, '#texto');
  // Lo que estabas escribiendo se guarda: si cambias de pestaña por error, al volver sigue ahí.
  input.value = prellenado || (await leer<string>('borrador')) || '';
  prellenado = '';
  input.addEventListener('input', () => { void escribir('borrador', input.value); });

  const dibujar = () => {
    caja.innerHTML = burbujas.map((b, i) => {
      const ultima = i === burbujas.length - 1;
      const botones = b.botones?.length ? `<div class="botones">${b.botones.map(x => botonHtml(x, ultima)).join('')}</div>` : '';
      const carta = b.de === 'bot' ? cartaHtml(b.texto, botones) : null;
      if (carta) return `<div class="burbuja bot carta">${carta}</div>`;
      return `<div class="burbuja ${b.de}"><div class="texto">${esc(b.texto)}</div>${botones}</div>`;
    }).join('');
    caja.scrollTop = caja.scrollHeight;
  };

  // Los mensajes se atienden de uno en uno (si escribes rápido, el orden de las respuestas se respeta).
  let turno: Promise<void> = Promise.resolve();
  const enviar = (entrada: { texto?: string; boton?: string }, mostrar?: string): Promise<void> => {
    turno = turno.then(async () => {
      if (mostrar) burbujas.push({ de: 'yo', texto: mostrar });
      dibujar();
      let salidas = await procesar(app.repo, entrada, new Date(), 'app');
      // Sin internet la IA no puede ayudar: la frase se guarda y se piensa cuando vuelva la conexión.
      if (entrada.texto && salidas.length === 1 && salidas[0].noEntendido && hayServidor() && navigator.onLine === false) {
        await encolarFraseIA(entrada.texto);
        salidas = [{ texto: `${salidas[0].texto}
Guardé tu frase. Cuando vuelva el internet la pienso y te aviso aquí.` }];
      }
      // Si el bot no entendió y hay servidor, la IA reescribe la frase y el bot la vuelve a leer.
      if (entrada.texto && salidas.length === 1 && salidas[0].noEntendido && hayServidor() && navigator.onLine !== false) {
        burbujas.push({ de: 'bot', texto: '🤔 No lo entendí a la primera. Déjame pensarlo un momento...' });
        dibujar();
        const ayuda = await pedirAyudaIA(entrada.texto);
        burbujas.pop();
        if (ayuda.frases.length) {
          const otra = await procesar(app.repo, { texto: ayuda.frases.join('\n') }, new Date(), 'app');
          if (!otra.some(x => x.noEntendido)) {
            burbujas.push({ de: 'bot', texto: `Creo que quisiste decir: ${ayuda.frases.map(x => `«${x}»`).join(' y ')}. Revisa la tarjeta antes de confirmar.` });
            salidas = otra;
          }
        } else if (ayuda.error) {
          salidas = [{ texto: `${salidas[0].texto}\n(${ayuda.error})` }];
        }
      }
      for (const s of salidas) burbujas.push({ de: 'bot', texto: s.texto, botones: s.botones });
      burbujas = burbujas.slice(-60);
      void escribir('chat', burbujas);
      dibujar();
      void sincronizar().then(() => actualizarEstado());
    });
    return turno;
  };

  $<HTMLFormElement>(cont, '#form').addEventListener('submit', e => {
    e.preventDefault();
    const t = input.value.trim();
    if (!t) return;
    input.value = '';
    void escribir('borrador', '');
    void enviar({ texto: t }, t);
  });
  cont.addEventListener('click', e => {
    const aviso = (e.target as HTMLElement).closest<HTMLElement>('[data-aviso]');
    if (aviso) {
      const [i, j] = aviso.dataset.aviso!.split('.').map(Number);
      const accion = avisos[i]?.acciones?.[j];
      if (!accion) return;
      if (accion.enviar) void enviar({ texto: accion.texto }, accion.texto);
      else { input.value = accion.texto; input.focus(); void escribir('borrador', input.value); }
      return;
    }
    const el = (e.target as HTMLElement).closest<HTMLElement>('[data-boton],[data-atajo]');
    if (!el || (el as HTMLButtonElement).disabled) return;
    if (el.dataset.boton) void enviar({ boton: el.dataset.boton }, el.textContent ?? '');
    else if (el.dataset.atajo) void enviar({ texto: el.dataset.atajo }, el.textContent ?? el.dataset.atajo);
  });
  // Dictado: lo que se oye pasa por normalizarDictado y, de las alternativas que da el reconocedor, se
  // elige la primera que el bot entienda. Nunca se envía solo: queda escrito para revisar y pulsar Enviar.
  const mic = cont.querySelector<HTMLButtonElement>('#mic');
  const estadoVoz = $<HTMLElement>(cont, '#vozEstado');
  let oyendo: Reconocimiento | null = null;
  mic?.addEventListener('click', () => {
    if (oyendo) { oyendo.stop(); return; }
    if (navigator.onLine === false) { estadoVoz.textContent = ERRORES_VOZ.network; return; }
    const r = new Reconocedor!();
    r.lang = 'es-CO'; r.interimResults = true; r.maxAlternatives = 5; r.continuous = false;
    oyendo = r;
    mic.setAttribute('aria-pressed', 'true');
    mic.classList.add('oyendo');
    estadoVoz.textContent = 'Te escucho. Habla normal, como lo escribirías.';
    r.onresult = e => {
      const res = e.results[e.results.length - 1];
      const candidatas = Array.from({ length: res.length }, (_, k) => normalizarDictado(res[k].transcript)).filter(Boolean);
      const entendida = candidatas.find(t => interpretar(t, ctx).clase !== 'error');
      input.value = entendida ?? candidatas[0] ?? '';
      if (res.isFinal) {
        estadoVoz.textContent = entendida ? 'Revisa y pulsa Enviar.' : 'No estoy seguro de lo que dijiste. Corrígelo si hace falta y pulsa Enviar.';
        void escribir('borrador', input.value);
        input.focus();
      }
    };
    r.onerror = e => { estadoVoz.textContent = ERRORES_VOZ[e.error] ?? 'No pude escuchar. Escríbelo.'; };
    r.onend = () => { oyendo = null; mic.setAttribute('aria-pressed', 'false'); mic.classList.remove('oyendo'); };
    try { r.start(); } catch { oyendo = null; estadoVoz.textContent = 'No pude empezar a escuchar.'; mic.classList.remove('oyendo'); }
  });

  dibujar();
  if (mandarAlAbrir && input.value) { const t = input.value; input.value = ''; mandarAlAbrir = false; void enviar({ texto: t }, t); }

  // Frases que quedaron guardadas sin internet: si ya hay conexión, la IA las piensa y se ofrece anotarlas.
  const revisarCola = async () => {
    const listas = await atenderColaIA();
    for (const l of listas) {
      const cuando = fraseConCuando(l.frases, l.cuando);
      burbujas.push({
        de: 'bot',
        texto: `Cuando no había internet escribiste «${l.texto}». Ahora la entendí como: ${l.frases.map(x => `«${x}»`).join(' y ')}. ¿La anoto?`,
        botones: [{ id: `ia:${cuando}`, titulo: 'Anotar' }, { id: 'nada', titulo: 'No' }],
      });
    }
    if (listas.length) { void escribir('chat', burbujas); dibujar(); }
  };
  void revisarCola();
  window.addEventListener('online', () => { if (document.getElementById('chat')) void revisarCola(); }, { once: true });
}

/** A la frase le pone el día y la hora en que se escribió, si no los trae: así no queda con la hora de ahora. */
function fraseConCuando(frases: string[], cuando: string): string {
  const d = new Date(cuando);
  const h = d.getHours() % 12 || 12;
  const hora = `${h}:${String(d.getMinutes()).padStart(2, '0')} ${d.getHours() >= 12 ? 'pm' : 'am'}`;
  const hoy = new Date();
  const otroDia = d.toDateString() !== hoy.toDateString();
  return frases.map(f => (/\b(ayer|hoy|anteayer|hace|lunes|martes|miercoles|jueves|viernes|sabado|domingo)\b|\d\/\d/i.test(f) ? f : `${f} ${otroDia ? `${d.getDate()}/${d.getMonth() + 1} ` : ''}${hora}`)).join('\n');
}
