/**
 * El chat: burbujas con entrada suave, la tarjeta «Entendí / Guardado», atajos en carrusel, la barra de
 * escritura con dictado por voz (ondas mientras escucha) y los avisos con botón de arriba.
 * La lógica es la de siempre: el bot corre dentro de la app y solo se pide ayuda a la IA si no entendió.
 */
import { ArrowUp, CalendarClock, Camera, HardHat, HelpCircle, Images, Mic, Plus, ScanLine, SlidersHorizontal, Store } from 'lucide-preact';
import { useEffect, useRef, useState } from 'preact/hooks';
import {
  aLocal, atajosRapidos, calcularAlertas, formatear, fraseDeOCR, limpiar, hayTrabajadores, interpretar, normalizarDictado, procesar, vendeProductos, type Boton,
} from '../../../../../packages/core/src/index.ts';
import { leerComprobante } from '../../services/ocr.ts';
import { app, hayServidor } from '../../services/estado.ts';
import { atenderColaIA, encolarFraseIA, pedirAyudaIA } from '../../services/ia.ts';
import { sincronizar } from '../../services/sincronizacion.ts';
import { escribir, leer } from '../../services/almacen.ts';
import { parsearCarta, quitarEmojis } from '../../lib/carta.ts';
import { celebrar } from '../../lib/efectos.ts';
import { accionInicial, chatPrellenado, imagenCompartida } from '../../state/nav.ts';
import { ctx as contexto, datos as datosSignal } from '../../state/store.ts';
import { atajosUsuario, barraOculta, cargarAtajos, editorAtajos, ocultarBarra } from '../../state/atajos.ts';
import { vibrar } from '../../lib/haptico.ts';
import { Ayuda, esAyuda, seEnvia } from './Ayuda.tsx';
import { PulsoChat } from './PulsoChat.tsx';
import { BotonesBot, Carta } from './Carta.tsx';
import { Insignia, T, visualDeNombre, type Icono } from '../../components/ui/iconos.tsx';
import { abrirOpciones } from '../../components/ui/Selector.tsx';

interface Burbuja { de: 'yo' | 'bot'; texto: string; botones?: Boton[] }

const BIENVENIDA = '¡Hola! Aquí me cuentas lo que gastaste o te llegó y yo lo anoto.\n1. Escribe como hablas, por ejemplo: «almuerzo 12000».\n2. Te muestro lo que entendí. Pulsa Confirmar y queda guardado.\n3. Si te equivocas, pulsa Editar o Deshacer.\n4. Tus saldos y resúmenes están en las pestañas de abajo.\nSi no sabes qué escribir, pulsa «Ayuda».';

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

/** A la frase le pone el día y la hora en que se escribió, si no los trae: así no queda con la hora de ahora. */
function fraseConCuando(frases: string[], cuando: string): string {
  const d = new Date(cuando);
  const h = d.getHours() % 12 || 12;
  const hora = `${h}:${String(d.getMinutes()).padStart(2, '0')} ${d.getHours() >= 12 ? 'pm' : 'am'}`;
  const otroDia = d.toDateString() !== new Date().toDateString();
  return frases.map(f => (/\b(ayer|hoy|anteayer|hace|lunes|martes|miercoles|jueves|viernes|sabado|domingo)\b|\d\/\d/i.test(f) ? f : `${f} ${otroDia ? `${d.getDate()}/${d.getMonth() + 1} ` : ''}${hora}`)).join('\n');
}

/** ¿Algo de lo que contestó el bot merece confeti? Una deuda saldada, una billetera que cuadra, una meta cumplida. */
function mereceConfeti(textos: string[]): boolean {
  const t = textos.join('\n');
  return /Deuda con .* saldada/.test(t) || (/Contar la plata/.test(t) && /\(cuadra\)|tienes \$[\d.]+ \(cuadra/.test(t)) || /\(100 %\)/.test(t) || /Llegaste a la meta/.test(t);
}

/** Las últimas burbujas entran una tras otra al abrir el chat; una burbuja nueva entra sola. `orden` es su lugar contando desde el final. */
function BurbujaVista({ b, ultima, orden, alPulsar, alEjemplo }: { b: Burbuja; ultima: boolean; orden: number; alPulsar: (x: Boton) => void; alEjemplo: (e: string) => void }) {
  const ref = useRef<HTMLDivElement>(null);
  const estilo = { '--i': Math.max(0, 5 - orden) } as Record<string, number>;
  const carta = b.de === 'bot' ? parsearCarta(b.texto) : null;
  const botones = b.botones?.length ? <BotonesBot botones={b.botones} activo={ultima} alPulsar={alPulsar} dentroDeCarta={Boolean(carta)} /> : null;
  if (b.de === 'bot' && esAyuda(b.texto)) return <div ref={ref} style={estilo} class="burbuja bot guia"><Ayuda texto={b.texto} alElegir={alEjemplo} /></div>;
  if (carta) return <div ref={ref} style={estilo} class={`burbuja bot carta ${ultima && b.botones?.length ? 'activa' : ''}`}><Carta datos={carta} hijos={botones} impacto={ultima} /></div>;
  return <div ref={ref} style={estilo} class={`burbuja ${b.de}`}><div class="texto">{quitarEmojis(b.texto)}</div>{botones}</div>;
}

export function Chat() {
  const [burbujas, setBurbujas] = useState<Burbuja[]>([]);
  const burbujasRef = useRef<Burbuja[]>([]);
  const [texto, setTexto] = useState('');
  const [oyendo, setOyendo] = useState(false);
  const [estadoVoz, setEstadoVoz] = useState('');
  const [pensando, setPensando] = useState(false);
  const enCurso = useRef(0);
  const [escaneando, setEscaneando] = useState(false);
  const fin = useRef<HTMLDivElement>(null);
  const turno = useRef<Promise<void>>(Promise.resolve());
  const rec = useRef<Reconocimiento | null>(null);
  const datos = datosSignal.value;
  const ctx = contexto.value;

  const poner = (lista: Burbuja[]) => { burbujasRef.current = lista; setBurbujas(lista); };
  const agregar = (...nuevas: Burbuja[]) => poner([...burbujasRef.current, ...nuevas].slice(-60));

  // al abrir: lo que había en el chat y el borrador que se estaba escribiendo
  useEffect(() => {
    void cargarAtajos();
    void (async () => {
      const guardadas = (await leer<Burbuja[]>('chat')) ?? [];
      poner(guardadas.length ? guardadas : [{ de: 'bot', texto: BIENVENIDA }]);
      const pre = chatPrellenado.peek();
      if (pre) {
        chatPrellenado.value = null;
        setTexto(pre.texto);
        if (pre.enviar) { setTexto(''); void enviar({ texto: pre.texto }, pre.texto); }
      } else setTexto((await leer<string>('borrador')) ?? '');
      void revisarCola();
      // lo que llegó desde fuera: un comprobante compartido o un acceso directo del ícono
      const compartida = imagenCompartida.peek();
      if (compartida) { imagenCompartida.value = null; void escanear(compartida); }
      const accion = accionInicial.peek();
      if (accion) {
        accionInicial.value = null;
        setTimeout(() => { if (accion === 'voz') alMicrofono(); else document.querySelector<HTMLInputElement>('#texto')?.focus(); }, 400);
      }
    })();
    const ante = () => { void revisarCola(); };
    window.addEventListener('online', ante, { once: true });
    return () => { rec.current?.stop(); window.removeEventListener('online', ante); };
  }, []);

  useEffect(() => { fin.current?.scrollIntoView({ block: 'end' }); }, [burbujas, pensando]);

  /** Frases que quedaron guardadas sin internet: si ya hay conexión, la IA las piensa y se ofrece anotarlas. */
  async function revisarCola() {
    const listas = await atenderColaIA();
    for (const l of listas) {
      agregar({
        de: 'bot',
        texto: `Cuando no había internet escribiste «${l.texto}». Ahora la entendí como: ${l.frases.map(x => `«${x}»`).join(' y ')}. ¿La anoto?`,
        botones: [{ id: `ia:${fraseConCuando(l.frases, l.cuando)}`, titulo: 'Anotar' }, { id: 'nada', titulo: 'No' }],
      });
    }
    if (listas.length) void escribir('chat', burbujasRef.current);
  }

  // Los mensajes se atienden de uno en uno (si escribes rápido, el orden de las respuestas se respeta).
  function enviar(entrada: { texto?: string; boton?: string }, mostrar?: string): Promise<void> {
    enCurso.current++; setPensando(true);
    turno.current = turno.current.then(async () => {
      if (mostrar) agregar({ de: 'yo', texto: mostrar });
      let salidas = await procesar(app.repo, entrada, new Date(), 'app');
      // Sin internet la IA no puede ayudar: la frase se guarda y se piensa cuando vuelva la conexión.
      if (entrada.texto && salidas.length === 1 && salidas[0].noEntendido && hayServidor() && navigator.onLine === false) {
        await encolarFraseIA(entrada.texto);
        salidas = [{ texto: `${salidas[0].texto}\nGuardé tu frase. Cuando vuelva el internet la pienso y te aviso aquí.` }];
      }
      // Si el bot no entendió y hay servidor, la IA reescribe la frase y el bot la vuelve a leer.
      if (entrada.texto && salidas.length === 1 && salidas[0].noEntendido && hayServidor() && navigator.onLine !== false) {
        agregar({ de: 'bot', texto: 'No lo entendí a la primera. Déjame pensarlo un momento...' });
        const ayuda = await pedirAyudaIA(entrada.texto);
        poner(burbujasRef.current.slice(0, -1));
        if (ayuda.frases.length) {
          const otra = await procesar(app.repo, { texto: ayuda.frases.join('\n') }, new Date(), 'app');
          if (!otra.some(x => x.noEntendido)) {
            agregar({ de: 'bot', texto: `Creo que quisiste decir: ${ayuda.frases.map(x => `«${x}»`).join(' y ')}. Revisa la tarjeta antes de confirmar.` });
            salidas = otra;
          }
        } else if (ayuda.error) {
          salidas = [{ texto: `${salidas[0].texto}\n(${ayuda.error})` }];
        }
      }
      agregar(...salidas.map(s => ({ de: 'bot' as const, texto: s.texto, botones: s.botones })));
      void escribir('chat', burbujasRef.current);
      if (mereceConfeti(salidas.map(s => s.texto))) { celebrar(); vibrar([18, 40, 18]); }
      void sincronizar();
    }).finally(() => { enCurso.current--; setPensando(enCurso.current > 0); });
    return turno.current;
  }

  /** Lee un comprobante con la IA y deja la tarjeta lista para confirmar con un toque. */
  async function escanear(foto: Blob) {
    setEscaneando(true);
    agregar({ de: 'yo', texto: 'Comprobante para leer' });
    const { lectura, error } = await leerComprobante(foto);
    setEscaneando(false);
    if (!lectura) { agregar({ de: 'bot', texto: error ?? 'No pude leerlo.' }); return; }
    const d = datosSignal.peek();
    // si la categoría sugerida existe en esta instalación, va primero para que el bot la reconozca
    const cat = d?.cuentas.find(c => c.tipo === 'categoria' && lectura.categoria && limpiar(c.nombre).includes(limpiar(lectura.categoria)));
    const frase = `${cat ? limpiar(cat.nombre) + ' ' : ''}${fraseDeOCR(lectura, aLocal(new Date()).slice(0, 10))}`;
    agregar({ de: 'bot', texto: `Leí: ${lectura.comercio || 'un pago'} por ${formatear(lectura.monto)}${lectura.fecha ? ' el ' + lectura.fecha : ''}. Revisa la tarjeta antes de confirmar.` });
    mandar(frase);
  }

  const alElegirImagen = (e: Event) => {
    const entrada = e.target as HTMLInputElement;
    const f = entrada.files?.[0];
    entrada.value = '';
    if (f) void escanear(f);
  };

  const alPulsar = (b: Boton) => { if (b.id === 'ok') vibrar(); void enviar({ boton: b.id }, b.titulo.replace(/^[\p{Extended_Pictographic}️‍\s]+/u, '').trim() || b.titulo); };
  const mandar = (t: string) => { void enviar({ texto: t }, t); };
  /** Un ejemplo de la guía: las consultas se envían; lo demás queda escrito para ponerle el monto. */
  const alEjemplo = (e: string) => {
    if (seEnvia(e)) { mandar(e); return; }
    setTexto(e); void escribir('borrador', e);
    document.querySelector<HTMLInputElement>('#texto')?.focus();
  };

  /** Un atajo propio: la plantilla deja el texto en el cuadro para ponerle monto y cuenta; la frase completa arma la tarjeta. */
  const alAtajo = (a: { frase: string; modo: 'plantilla' | 'frase' }) => {
    if (a.modo === 'frase') { mandar(a.frase); return; }
    const t = `${a.frase.trim()} `;
    setTexto(t); void escribir('borrador', t);
    const campo = document.querySelector<HTMLInputElement>('#texto');
    campo?.focus();
    requestAnimationFrame(() => campo?.setSelectionRange(t.length, t.length));
  };

  const alEnviar = (e: Event) => {
    e.preventDefault();
    const t = texto.trim();
    if (!t) return;
    setTexto('');
    void escribir('borrador', '');
    mandar(t);
  };

  // Dictado: lo que se oye pasa por normalizarDictado y, de las alternativas del reconocedor, se elige la primera
  // que el bot entienda. Nunca se envía solo: queda escrito para revisar y pulsar Enviar.
  const alMicrofono = () => {
    if (rec.current) { rec.current.stop(); return; }
    if (navigator.onLine === false) { setEstadoVoz(ERRORES_VOZ.network); return; }
    if (!ctx) return;
    // sin soporte (Firefox, Safari) el botón no existe, pero un acceso directo («?accion=voz») puede llegar hasta aquí
    if (!Reconocedor) { setEstadoVoz('Este navegador no permite dictar. Escríbelo.'); return; }
    const r = new Reconocedor();
    r.lang = 'es-CO'; r.interimResults = true; r.maxAlternatives = 5; r.continuous = false;
    rec.current = r;
    setOyendo(true);
    setEstadoVoz('Te escucho. Habla normal, como lo escribirías.');
    r.onresult = e => {
      const res = e.results[e.results.length - 1];
      const candidatas = Array.from({ length: res.length }, (_, k) => normalizarDictado(res[k].transcript)).filter(Boolean);
      const entendida = candidatas.find(t => interpretar(t, ctx).clase !== 'error');
      const elegida = entendida ?? candidatas[0] ?? '';
      setTexto(elegida);
      if (res.isFinal) {
        setEstadoVoz(entendida ? 'Revisa y pulsa Enviar.' : 'No estoy seguro de lo que dijiste. Corrígelo si hace falta y pulsa Enviar.');
        void escribir('borrador', elegida);
        document.querySelector<HTMLInputElement>('#texto')?.focus();
      }
    };
    r.onerror = e => setEstadoVoz(ERRORES_VOZ[e.error] ?? 'No pude escuchar. Escríbelo.');
    r.onend = () => { rec.current = null; setOyendo(false); };
    try { r.start(); } catch { rec.current = null; setOyendo(false); setEstadoVoz('No pude empezar a escuchar.'); }
  };

  const avisos = datos && ctx ? calcularAlertas(datos, ctx.ahora).filter(a => a.acciones?.length && (a.id === 'cierre-dia' || a.id === 'saldo-negativo')) : [];
  const rapidos = datos && ctx ? atajosRapidos(datos, ctx.ahora) : [];
  const propios = atajosUsuario.value;
  const oculta = barraOculta.value;
  const fijos: { orden: string; etiqueta: string; Icono: Icono; tema: keyof typeof T }[] = [{ orden: 'ayuda', etiqueta: 'Ayuda', Icono: HelpCircle, tema: 'coral' }];
  if (ctx && vendeProductos(ctx)) fijos.push({ orden: 'ventas', etiqueta: 'Ventas', Icono: Store, tema: 'cian' });
  if (datos && hayTrabajadores(datos.cuentas, datos.movimientos)) fijos.push({ orden: 'jornales', etiqueta: 'Jornales', Icono: HardHat, tema: 'lima' });

  const alAviso = (i: number, j: number) => {
    const accion = avisos[i]?.acciones?.[j];
    if (!accion) return;
    if (accion.enviar) mandar(accion.texto);
    else { setTexto(accion.texto); void escribir('borrador', accion.texto); document.querySelector<HTMLInputElement>('#texto')?.focus(); }
  };

  return (
    <>
      {avisos.map((a, i) => (
        <div key={i} class={`alerta mx-4 mt-3 ${a.nivel === 'urgente' ? 'urgente' : a.nivel === 'aviso' ? 'aviso' : ''}`}>
          {quitarEmojis(a.texto)}
          <div class="botones">{a.acciones!.map((x, j) => <button key={j} class="chip" data-aviso={`${i}.${j}`} onClick={() => alAviso(i, j)}>{x.titulo}</button>)}</div>
        </div>
      ))}
      <PulsoChat />
      <div class="chat flex flex-1 flex-col gap-2.5 overflow-y-auto p-4" id="chat">
        {burbujas.map((b, i) => <BurbujaVista key={`${i}-${b.texto.length}`} b={b} ultima={i === burbujas.length - 1} orden={burbujas.length - 1 - i} alPulsar={alPulsar} alEjemplo={alEjemplo} />)}
        {escaneando && <div class="burbuja bot" role="status"><span class="sub">Leyendo el comprobante...</span></div>}
        {pensando && <div class="burbuja bot pensando" role="status" aria-label="Pensando"><span /><span /><span /></div>}
        <div ref={fin} />
      </div>
      {oculta ? (
        <div class="atajos -mb-1 flex px-4 pb-2 pt-1">
          <button class="chip atajo shrink-0" id="atajos-mostrar" onClick={() => ocultarBarra(false)}><SlidersHorizontal size={16} />Mostrar atajos</button>
        </div>
      ) : (
        <div class="atajos -mb-1 flex gap-2 overflow-x-auto px-4 pb-2 pt-1 [scrollbar-width:none]">
          {fijos.map(({ orden, etiqueta, Icono, tema }) => <button key={orden} class="chip atajo shrink-0" data-atajo={orden} onClick={() => mandar(orden)}><Insignia v={{ Icono, ...T[tema] }} tam={26} redondo />{etiqueta}</button>)}
          {rapidos.map(a => (
            <button key={a.frase} class="chip atajo atajo-fijo shrink-0" data-atajo={a.frase} data-tipo={a.tipo} title="Pago fijo que ya toca" onClick={() => mandar(a.frase)}>
              <Insignia v={{ Icono: CalendarClock, ...T.ambar }} tam={26} redondo />{a.etiqueta}
            </button>
          ))}
          {propios.map(a => (
            <button key={a.id} class="chip atajo shrink-0" data-atajo={a.frase} data-tipo={a.modo} onClick={() => alAtajo(a)}>
              <Insignia v={visualDeNombre(a.frase)} tam={26} redondo />{a.etiqueta}
            </button>
          ))}
          <button class="chip atajo shrink-0" id="atajo-mas" aria-label="Agregar o cambiar mis botones rápidos" title="Mis botones rápidos" onClick={() => { editorAtajos.value = true; }}><Plus size={18} /></button>
        </div>
      )}
      <form id="form" class="entrada vidrio mx-3 mb-1 rounded-[1.4rem] p-2 ring-1 ring-anillo" onSubmit={alEnviar}>
        <input id="texto" type="text" autocomplete="off" autocapitalize="sentences" placeholder="Ej.: mecato 5000" aria-label="Escribe lo que pasó" class="!bg-transparent !shadow-none" value={texto}
          onInput={e => { const v = (e.target as HTMLInputElement).value; setTexto(v); void escribir('borrador', v); }} />
        {/* Android no ofrece cámara y galería en la misma lista: con «capture» solo abre la cámara y sin él solo la galería. Por eso hay dos entradas y una hoja que pregunta cuál. */}
        <input type="file" id="archivoEscanear" accept="image/*" hidden onChange={alElegirImagen} />
        <input type="file" id="fotoEscanear" accept="image/*" capture="environment" hidden onChange={alElegirImagen} />
        <div class="ml-auto flex items-center gap-2">
        <button type="button" id="escanear" class={`secundario mic ${escaneando ? 'escaneando' : ''}`} aria-label="Leer un comprobante: cámara o galería" title="Leer comprobante" disabled={escaneando}
          onClick={e => abrirOpciones('Leer un comprobante', [
            { valor: 'camara', etiqueta: 'Tomar una foto', visual: { Icono: Camera, ...T.cian } },
            { valor: 'galeria', etiqueta: 'Elegir de la galería', visual: { Icono: Images, ...T.violeta } },
          ], v => document.querySelector<HTMLInputElement>(v === 'camara' ? '#fotoEscanear' : '#archivoEscanear')?.click(), e.currentTarget)}><ScanLine size={21} /></button>
        {Reconocedor && (
          <button type="button" id="mic" class={`secundario mic ${oyendo ? 'oyendo' : ''}`} aria-label={oyendo ? 'Dejar de escuchar' : 'Hablar'} aria-pressed={oyendo} onClick={alMicrofono}>
            {oyendo ? <span class="ondas" aria-hidden="true"><span /><span /><span /><span /><span /></span> : <Mic size={21} />}
          </button>
        )}
        <button type="submit" class="primario !min-h-11 !w-11 !rounded-full !p-0" aria-label="Enviar" title="Enviar"><ArrowUp size={22} strokeWidth={2.4} /></button>
        </div>
      </form>
      <div id="vozEstado" class={`sub px-5 ${estadoVoz ? 'pb-1 pt-1' : 'h-0'}`} role="status" aria-live="polite">{estadoVoz}</div>
    </>
  );
}
