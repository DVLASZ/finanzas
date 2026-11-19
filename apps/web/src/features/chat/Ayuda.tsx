/**
 * La ayuda como un asistente por temas: primero una pregunta corta y los temas como botones; solo al tocar uno se
 * despliegan sus ejemplos (con un ícono por tipo), y se puede volver a los temas. Los ejemplos salen del texto que
 * devuelve el bot, así siguen las cuentas de cada instalación; los temas que el bot no menciona (pagos fijos, metas)
 * llevan ejemplos propios, los mismos de docs/BOT.md. Al tocar un ejemplo se escribe en el cuadro del chat; las
 * consultas («saldo», «deudas») se envían directo.
 */
import {
  ArrowLeft, ArrowLeftRight, ArrowUpRight, Banknote, BarChart3, Bus, CalendarClock, CalendarDays, DollarSign, HandCoins, Info, Pencil, Receipt,
  Rocket, ScanLine, Scale, ShoppingBasket, Sparkles, Store, Tag, Target, TrendingUp, Undo2, Users,
} from 'lucide-preact';
import { useEffect, useRef, useState } from 'preact/hooks';
import { quitarEmojis } from '../../lib/carta.ts';
import { entrar } from '../../lib/efectos.ts';
import { Insignia, T, type Icono, type Visual } from '../../components/ui/iconos.tsx';
import { ctx as contexto } from '../../state/store.ts';
import { ayudaGuiada, type RespuestaDeAyuda } from '../../../../../packages/core/src/index.ts';

/** El texto que devuelve el bot para «ayuda» (empieza siempre igual). */
export const esAyuda = (t: string): boolean => t.startsWith('👋 Cuéntame');

/** Estos ejemplos no llevan monto: se envían al tocarlos. Los demás se escriben en el cuadro para completarlos. */
const CONSULTAS = new Set(['saldo', 'deudas', 'semana', 'mes', 'últimos', 'ultimos', 'lista', 'deshacer', 'ayuda', 'editar último', 'editar ultimo']);
export const seEnvia = (ejemplo: string): boolean => CONSULTAS.has(ejemplo.trim().toLowerCase());

type Parte = { texto: string } | { ejemplo: string };

function partir(linea: string): Parte[] {
  const partes: Parte[] = [];
  let resto = linea.replace(/^•\s*/, '');
  for (let m = /«([^»]+)»/.exec(resto); m; m = /«([^»]+)»/.exec(resto)) {
    const antes = resto.slice(0, m.index).replace(/^[\s:·]+|[\s:·]+$/g, '');
    if (antes) partes.push({ texto: antes });
    partes.push({ ejemplo: m[1] });
    resto = resto.slice(m.index + m[0].length);
  }
  const fin = resto.replace(/^[\s:·]+|[\s:·]+$/g, '');
  if (fin) partes.push({ texto: fin });
  return partes;
}

/** Ícono y color según de qué trata el ejemplo. */
function visualDe(linea: string): Visual {
  const t = linea.toLowerCase();
  const v = (Icono: Icono, tema: keyof typeof T): Visual => ({ Icono, ...T[tema] });
  if (/vendí/.test(t)) return v(Store, 'cian');
  if (/gasto entre varios|por ivan/.test(t)) return v(Users, 'violeta');
  if (/agrupar|#/.test(t)) return v(Tag, 'rosa');
  if (/taxi|bus/.test(t)) return v(Bus, 'cian');
  if (/billete|vuelto/.test(t)) return v(Banknote, 'esmeralda');
  if (/dólares|usd/.test(t)) return v(DollarSign, 'lima');
  if (/arqueo|cuadre/.test(t)) return v(Scale, 'azul');
  if (/pasar plata|cambio \d/.test(t)) return v(ArrowLeftRight, 'azul');
  if (/cada mes|cada quincena|cada lunes/.test(t)) return v(CalendarClock, 'ambar');
  if (/meta|ahorré|saqué/.test(t)) return v(Target, 'esmeralda');
  if (/otro día|ayer/.test(t)) return v(CalendarDays, 'ambar');
  if (/deshacer|equivoc|editar/.test(t)) return v(Undo2, 'coral');
  if (/presté|prestaron|pagué|pagaron|debía|le debo/.test(t)) return v(HandCoins, 'ambar');
  if (/me llegó|ingreso/.test(t)) return v(TrendingUp, 'esmeralda');
  if (/comprar|lista/.test(t)) return v(ShoppingBasket, 'rosa');
  if (/saldo|deudas|semana|mes|últimos/.test(t)) return v(BarChart3, 'azul');
  return v(Receipt, 'coral');
}

interface Tema { id: string; titulo: string; Icono: Icono; tono: keyof typeof T; lineas: string[]; nota?: string; escaner?: boolean }

/** Reparte las líneas de la ayuda del bot por tema y agrega los temas con ejemplos propios. `cuenta` es una cuenta real de la app (Nequi, Bancolombia...). */
export function temasDe(texto: string, cuenta = 'nequi'): Tema[] {
  const lineas = quitarEmojis(texto).split('\n').map(l => l.trim());
  const puntos = lineas.filter(l => l.startsWith('•'));
  const nota = lineas.find(l => /^Si te equivocas/.test(l));
  const dividir = (re: RegExp) => puntos.filter(l => re.test(l.toLowerCase()));
  const prestamos = dividir(/presté|prestaron|pagué|pagaron|debía|le debo/);
  const compartidos = dividir(/entre varios|#/);
  const saldos = dividir(/«saldo»|«semana»|arqueo|cambio|dólares|usd/);
  const aparte = new Set([...prestamos, ...compartidos, ...saldos]);
  const primero = /«([^»]+)»/.exec(puntos.find(l => /^•\s*Gast/.test(l)) ?? '')?.[1] ?? 'almuerzo 12000';
  return [
    {
      id: 'inicio', titulo: 'Empezar: recorrido de 4 pasos', Icono: Rocket, tono: 'cian',
      lineas: [`• Paso 1, escribe lo que gastaste como hablas: «${primero}»`, `• Paso 2, di con qué pagaste: «${primero} ${cuenta}»`, '• Paso 3, mira la tarjeta y pulsa Confirmar. Si algo está mal, pulsa Editar.', '• Paso 4, mira cómo vas: «saldo»'],
      nota: 'Nada se guarda hasta que pulsas Confirmar, y todo se puede deshacer.',
    },
    { id: 'anotar', titulo: 'Anotar gastos e ingresos', Icono: Receipt, tono: 'coral', lineas: puntos.filter(l => !aparte.has(l)) },
    { id: 'deudas', titulo: 'Préstamos y deudas', Icono: HandCoins, tono: 'ambar', lineas: [...prestamos, '• Ver quién te debe y a quién le debes: «deudas»'] },
    { id: 'compartidos', titulo: 'Compartidos', Icono: Users, tono: 'violeta', lineas: compartidos },
    {
      id: 'fijos', titulo: 'Pagos fijos y metas', Icono: CalendarClock, tono: 'esmeralda',
      lineas: ['• Un pago que se repite: «cada mes el 5 internet 60000»', '• Una meta de ahorro: «meta moto 2000000»', '• Apartar para la meta: «ahorré 50000 para moto»'],
      nota: 'Los pagos fijos te avisan cuando toca pagarlos, y quedan como un botón en el chat.',
    },
    { id: 'escanear', titulo: 'Escanear recibos', Icono: ScanLine, tono: 'cian', lineas: [], escaner: true, nota: 'Toca el botón del escáner junto al micrófono, toma la foto o elige una de la galería, y yo dejo la tarjeta lista para que la confirmes.' },
    {
      id: 'editar', titulo: 'Editar o anular', Icono: Pencil, tono: 'rosa',
      lineas: ['• Anular lo último: «deshacer»', '• Corregir lo último: «editar último»'],
      nota: nota ?? 'Si te equivocas, escribe «deshacer». Nada se borra: lo que deshaces queda marcado como anulado.',
    },
    { id: 'saldos', titulo: 'Saldos y cuadres', Icono: Scale, tono: 'azul', lineas: saldos },
  ].filter(t => t.lineas.length || t.escaner);
}

export function Ayuda({ texto, alElegir }: { texto: string; alElegir: (ejemplo: string) => void }) {
  const ctx = contexto.value;
  // una cuenta de verdad de esta app para los ejemplos (Nequi, Bancolombia...): no una inventada
  const cuenta = ctx?.cuentas.find(c => c.tipo === 'dinero' && c.id !== 'efectivo' && c.id !== 'monedas' && c.moneda === 'COP')?.clave ?? 'efectivo';
  const temas = temasDe(texto, cuenta);
  const [abierto, setAbierto] = useState<string | null>(null);
  const [duda, setDuda] = useState('');
  const [respuesta, setRespuesta] = useState<RespuestaDeAyuda | null | undefined>(undefined);
  const preguntar = (e: Event) => { e.preventDefault(); if (ctx && duda.trim()) setRespuesta(ayudaGuiada(duda, ctx)); };
  const tema = temas.find(t => t.id === abierto);
  const cuerpo = useRef<HTMLDivElement>(null);
  const chips = useRef<HTMLDivElement>(null);
  useEffect(() => { const el = tema ? cuerpo.current : chips.current; if (el) entrar(el); }, [abierto]);

  return (
    <div class="ayuda">
      <div class="ayuda-cab"><Sparkles size={18} /><b>Guía rápida</b></div>
      {!tema && <>
        <p class="sub !m-0 px-0.5">Cuéntame lo que pasó, como se lo contarías a alguien. ¿Sobre qué quieres saber?</p>
        <form class="ayuda-pregunta" id="ayuda-pregunta" onSubmit={preguntar}>
          <label class="etiqueta" for="ayuda-duda">Pregúntale cómo decirlo</label>
          <div class="ayuda-duda-fila">
            <input id="ayuda-duda" type="text" value={duda} placeholder="Ej: cómo anoto que presté plata" autocomplete="off" onInput={e => { setDuda((e.target as HTMLInputElement).value); setRespuesta(undefined); }} />
            <button type="submit" class="chip" id="ayuda-preguntar">Preguntar</button>
          </div>
          {respuesta && (
            <div class="ayuda-respuesta" id="ayuda-respuesta" role="status">
              <span class="ayuda-texto">{respuesta.explicacion}</span>
              <button type="button" class="ejemplo" data-ejemplo={respuesta.ejemplo} onClick={() => alElegir(respuesta.ejemplo)}>{respuesta.ejemplo}<ArrowUpRight size={14} aria-hidden="true" /></button>
              <button type="button" class="probar" id="ayuda-usar" onClick={() => alElegir(respuesta.ejemplo)}>Usar este ejemplo</button>
            </div>
          )}
          {respuesta === null && <p class="sub !m-0" id="ayuda-sin">No supe de qué hablas. Prueba con una palabra: préstamo, deuda, cajero, ingreso, meta, compartido.</p>}
        </form>
        <div ref={chips} class="ayuda-temas" id="ayuda-temas">
          {temas.map((t, i) => (
            <button key={t.id} type="button" class="chip ayuda-tema" data-tema={t.id} style={{ animationDelay: `${i * 45}ms` }} onClick={() => setAbierto(t.id)}>
              <Insignia v={{ Icono: t.Icono, ...T[t.tono] }} tam={28} redondo />{t.titulo}
            </button>
          ))}
        </div>
      </>}
      {tema && (
        <div ref={cuerpo} class="ayuda-detalle" id="ayuda-detalle" data-tema={tema.id}>
          <div class="flex items-center gap-2">
            <button type="button" class="chip !min-h-9 !px-3" id="ayuda-volver" aria-label="Volver a los temas" onClick={() => setAbierto(null)}><ArrowLeft size={16} />Temas</button>
            <h4 class="!m-0 min-w-0 flex-1 text-[.95rem] font-bold">{tema.titulo}</h4>
          </div>
          {tema.lineas.length > 0 && (
            <section class="ayuda-bloque">
              <p class="sub !m-0">Toca «Probar en el chat»: la frase queda escrita para que la cambies y la confirmes.</p>
              {tema.lineas.map(l => (
                <div key={l} class="ayuda-fila">
                  <Insignia v={visualDe(l)} tam={34} />
                  <div class="ayuda-partes">
                    {partir(l).filter(p => 'ejemplo' in p).length === 1 && <button type="button" class="probar" data-probar={(partir(l).find(p => 'ejemplo' in p) as { ejemplo: string }).ejemplo} onClick={() => alElegir((partir(l).find(p => 'ejemplo' in p) as { ejemplo: string }).ejemplo)}>Probar en el chat</button>}
                    {partir(l).map((p, j) => 'ejemplo' in p
                      ? <button key={j} type="button" class="ejemplo" data-ejemplo={p.ejemplo} onClick={() => alElegir(p.ejemplo)}>{p.ejemplo}<ArrowUpRight size={14} aria-hidden="true" /></button>
                      : <span key={j} class="ayuda-texto">{p.texto}</span>)}
                  </div>
                </div>
              ))}
            </section>
          )}
          {tema.nota && <div class="callout"><span class="callout-ico"><Info size={16} /></span><span class="callout-txt">{tema.nota}</span></div>}
          {tema.escaner && <button type="button" class="primario self-start" id="ayuda-escanear" onClick={() => document.querySelector<HTMLButtonElement>('#escanear')?.click()}><ScanLine size={18} />Abrir el escáner</button>}
        </div>
      )}
    </div>
  );
}
