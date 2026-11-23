// Convierte docs/GUIA-USUARIO.md en un solo HTML autocontenido para abrir en el celular.
// Uso: node scripts/guia-html.mjs [--capturas <dir>] [--salida <ruta>] [--enlace <url>] [--clave <texto>]
// El HTML que se sube a git va siempre con enlace y clave vacios: esos datos se pasan
// solo al generar la copia que se manda por WhatsApp, y nunca quedan escritos en este script.
import { readFileSync, writeFileSync, existsSync, readdirSync, mkdirSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const RAIZ = resolve(dirname(fileURLToPath(import.meta.url)), "..");

// ---------- argumentos ----------
const args = process.argv.slice(2);
function opcion(nombre, defecto) {
  const i = args.indexOf("--" + nombre);
  return i >= 0 && args[i + 1] !== undefined ? args[i + 1] : defecto;
}
const ENTRADA = join(RAIZ, "docs", "GUIA-USUARIO.md");
const SALIDA = resolve(opcion("salida", join(RAIZ, "docs", "GUIA-USUARIO.html")));
const DIR_CAPTURAS = opcion("capturas", "");
const ENLACE = opcion("enlace", "");
const CLAVE = opcion("clave", "");

// ---------- utilidades ----------
const esc = (s) =>
  String(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");

// Sin tildes y en minusculas, para comparar titulos.
const norm = (s) => s.normalize("NFD").replace(/\p{M}/gu, "").toLowerCase().trim();

// Regla para el codigo en linea: se puede copiar si parece una frase del chat,
// es decir, tiene un espacio o mas de 3 letras, y no es una ruta (sin "/").
// Asi `5000`, `5k` o `+` quedan quietos y `recurrentes` o `5 mil` se copian.
function copiable(texto) {
  if (texto.includes("/")) return false;
  if (/\s/.test(texto)) return true;
  return (texto.match(/\p{L}/gu) || []).length > 3;
}

// Los ejemplos entre comillas angulares se copian, salvo respuestas de la app
// (llevan ":" o "¿") que no se le escriben al chat.
function ejemploCopiable(texto) {
  return !/[:¿?]/.test(texto);
}

// ---------- capturas ----------
const capturas = new Map();
if (DIR_CAPTURAS && existsSync(DIR_CAPTURAS)) {
  for (const f of readdirSync(DIR_CAPTURAS)) {
    if (f.toLowerCase().endsWith(".webp")) {
      capturas.set(f.toLowerCase(), readFileSync(join(DIR_CAPTURAS, f)).toString("base64"));
    }
  }
}

function figura(archivo, alt, pie) {
  const b64 = capturas.get(archivo);
  if (!b64) return "";
  return (
    '<figure class="fig"><img src="data:image/webp;base64,' + b64 +
    '" alt="' + esc(alt) + '"><figcaption>' + esc(pie) + "</figcaption></figure>"
  );
}

// [texto a buscar en el titulo, si debe ser igual, archivo, alt, pie] (puede haber varias figuras por titulo)
const FIGURAS = [
  ["anotar un gasto", false, [["chat-gasto.webp", "Chat con la tarjeta de un gasto antes de confirmar", "Así se ve la tarjeta antes de confirmar"]]],
  ["etiquetas", false, [["chat-etiqueta.webp", "Chat con un gasto que lleva una etiqueta con numeral", "Una etiqueta junta los gastos de un tema"]]],
  ["comprobantes y fotos", false, [["comprobante.webp", "Detalle de un movimiento con la foto de un comprobante", "La foto del recibo queda en el detalle"]]],
  ["pedir ayuda a la app", false, [["chat-ayuda.webp", "Chat respondiendo una pregunta de ayuda con botones de ejemplo", "La respuesta de ayuda trae ejemplos para tocar"]]],
  ["agregar una persona", false, [["personas.webp", "Pantalla de categorías y personas con el campo Nueva persona", "Aquí se agregan y se archivan las personas"]]],
  ["desde deudas y prestamos", false, [["deudas.webp", "Pantalla de deudas y préstamos con las listas Debes y Te deben", "Cada persona trae su botón para registrar un pago o un abono"]]],
  ["saldos", true, [["saldos.webp", "Pestaña Saldos con el disponible y el seguro para gastar hoy", "El resumen de tu plata hoy"]]],
  ["pagos fijos", false, [["pagos-fijos.webp", "Lista de pagos fijos con el formulario de nuevo pago fijo", "Los gastos que se repiten cada mes"]]],
  ["alcancias y metas", false, [["alcancias.webp", "Pantalla de alcancías con una meta de ahorro", "Cada alcancía muestra cuánto llevas de la meta"]]],
  ["arqueo y cuadre", false, [["arqueo.webp", "Contador de billetes para actualizar el efectivo", "El contador de billetes suma por ti"]]],
  ["movimientos y filtros", false, [["movimientos-filtros.webp", "Lista de movimientos con filtros de periodo, tipo y categoría", "Los filtros se pueden combinar"]]],
  ["resumen", true, [
    ["resumen.webp", "Pestaña Resumen con gráficas del periodo", "Cómo te fue en el periodo"],
    ["calor-dia.webp", "Calor del mes con cada día pintado según lo gastado", "Tocar un día abre sus movimientos"],
  ]],
  ["esconder los montos", false, [["ojo.webp", "Botón del ojo para esconder o mostrar los montos", "El ojo esconde las cifras con un toque"]]],
  ["temas y tamano de letra", false, [["letra.webp", "Ajustes de letra y colores con los temas y el tamaño", "Tema y tamaño de letra a tu gusto"]]],
];

function figurasPara(titulo) {
  const t = norm(titulo);
  for (const [buscar, exacto, lista] of FIGURAS) {
    if (exacto ? t === buscar : t.includes(buscar)) {
      return lista.map(([a, alt, pie]) => figura(a, alt, pie)).join("");
    }
  }
  return "";
}

// ---------- ilustraciones de instalacion ----------
const ORO = "#D4AF37";
const SVG_ANDROID =
  '<figure class="fig ilus"><svg viewBox="0 0 260 300" role="img" aria-label="Pantalla de Chrome en Android con los tres puntos arriba a la derecha y la opción Instalar aplicación">' +
  '<rect x="50" y="8" width="160" height="284" rx="22" fill="#121216" stroke="' + ORO + '" stroke-width="2"/>' +
  '<rect x="60" y="20" width="140" height="28" rx="8" fill="#1d1d24"/>' +
  '<rect x="68" y="30" width="70" height="8" rx="4" fill="#4a4a55"/>' +
  '<circle cx="186" cy="34" r="14" fill="none" stroke="' + ORO + '" stroke-width="2"/>' +
  '<circle cx="186" cy="28" r="2.6" fill="' + ORO + '"/><circle cx="186" cy="34" r="2.6" fill="' + ORO + '"/><circle cx="186" cy="40" r="2.6" fill="' + ORO + '"/>' +
  '<rect x="64" y="56" width="136" height="104" rx="8" fill="#1d1d24" stroke="' + ORO + '" stroke-opacity=".5"/>' +
  '<text x="74" y="78" font-size="11" fill="#9a9486" font-family="system-ui,sans-serif">Nueva pestaña</text>' +
  '<text x="74" y="100" font-size="11" fill="#9a9486" font-family="system-ui,sans-serif">Historial</text>' +
  '<rect x="68" y="112" width="128" height="26" rx="6" fill="' + ORO + '"/>' +
  '<text x="76" y="129" font-size="11" font-weight="700" fill="#0A0A0C" font-family="system-ui,sans-serif" textLength="112" lengthAdjust="spacingAndGlyphs">Instalar aplicación</text>' +
  '<text x="74" y="152" font-size="11" fill="#9a9486" font-family="system-ui,sans-serif">Ajustes</text>' +
  '<circle cx="222" cy="22" r="11" fill="' + ORO + '"/><text x="222" y="26.5" text-anchor="middle" font-size="13" font-weight="700" fill="#0A0A0C" font-family="system-ui,sans-serif">1</text>' +
  '<circle cx="34" cy="125" r="11" fill="' + ORO + '"/><text x="34" y="129.5" text-anchor="middle" font-size="13" font-weight="700" fill="#0A0A0C" font-family="system-ui,sans-serif">2</text>' +
  '<path d="M46 125 H64" stroke="' + ORO + '" stroke-width="2"/>' +
  "</svg><figcaption>1. Los tres puntos. 2. Instalar aplicación.</figcaption></figure>";

const SVG_IPHONE =
  '<figure class="fig ilus"><svg viewBox="0 0 260 300" role="img" aria-label="Pantalla de Safari en iPhone con el botón Compartir abajo y la opción Agregar a pantalla de inicio">' +
  '<rect x="50" y="8" width="160" height="284" rx="22" fill="#121216" stroke="' + ORO + '" stroke-width="2"/>' +
  '<rect x="64" y="24" width="132" height="8" rx="4" fill="#2a2a33"/>' +
  '<rect x="64" y="40" width="96" height="8" rx="4" fill="#2a2a33"/>' +
  '<rect x="58" y="86" width="144" height="136" rx="10" fill="#1d1d24" stroke="' + ORO + '" stroke-opacity=".5"/>' +
  '<text x="68" y="108" font-size="11" fill="#9a9486" font-family="system-ui,sans-serif">Copiar</text>' +
  '<rect x="62" y="120" width="136" height="38" rx="6" fill="' + ORO + '"/>' +
  '<text x="68" y="136" font-size="11" font-weight="700" fill="#0A0A0C" font-family="system-ui,sans-serif" textLength="124" lengthAdjust="spacingAndGlyphs">Agregar a pantalla</text>' +
  '<text x="68" y="150" font-size="11" font-weight="700" fill="#0A0A0C" font-family="system-ui,sans-serif" textLength="60" lengthAdjust="spacingAndGlyphs">de inicio</text>' +
  '<text x="68" y="182" font-size="11" fill="#9a9486" font-family="system-ui,sans-serif">Marcadores</text>' +
  '<rect x="60" y="250" width="140" height="34" rx="10" fill="#1d1d24"/>' +
  '<circle cx="130" cy="267" r="15" fill="none" stroke="' + ORO + '" stroke-width="2"/>' +
  '<rect x="123" y="264" width="14" height="11" rx="2" fill="none" stroke="' + ORO + '" stroke-width="2"/>' +
  '<path d="M130 268 V256 M126 260 L130 256 L134 260" fill="none" stroke="' + ORO + '" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>' +
  '<circle cx="34" cy="267" r="11" fill="' + ORO + '"/><text x="34" y="271.5" text-anchor="middle" font-size="13" font-weight="700" fill="#0A0A0C" font-family="system-ui,sans-serif">1</text>' +
  '<path d="M46 267 H112" stroke="' + ORO + '" stroke-width="2"/>' +
  '<circle cx="34" cy="139" r="11" fill="' + ORO + '"/><text x="34" y="143.5" text-anchor="middle" font-size="13" font-weight="700" fill="#0A0A0C" font-family="system-ui,sans-serif">2</text>' +
  '<path d="M46 139 H62" stroke="' + ORO + '" stroke-width="2"/>' +
  "</svg><figcaption>1. El botón Compartir. 2. Agregar a pantalla de inicio.</figcaption></figure>";

// ---------- convertidor de markdown ----------
function enLinea(crudo) {
  const codigos = [];
  let s = esc(crudo);
  s = s.replace(/`([^`]+)`/g, (_, c) => {
    codigos.push(c);
    return "\u0000" + (codigos.length - 1) + "\u0000";
  });
  s = s.replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>");
  s = s.replace(/«([^»]*)»/g, (m, t) =>
    ejemploCopiable(t)
      ? '<button type="button" class="chip" data-copy="' + t + '" title="Tocar para copiar">' + t + "</button>"
      : m
  );
  s = s.replace(/\[([^\]]+)\]/g, '<span class="ph">$1</span>');
  return s.replace(/\u0000(\d+)\u0000/g, (_, i) => {
    const c = codigos[Number(i)];
    return copiable(c)
      ? '<button type="button" class="chip cod" data-copy="' + c + '" title="Tocar para copiar">' + c + "</button>"
      : "<code>" + c + "</code>";
  });
}

function bloqueCodigo(lineas) {
  const filas = lineas
    .filter((l) => l.trim() !== "")
    .map(
      (l) =>
        '<div class="frase"><code>' + esc(l.trim()) + '</code><button type="button" class="copiar" data-copy="' +
        esc(l.trim()) + '" aria-label="Copiar la frase ' + esc(l.trim()) + '">Copiar</button></div>'
    );
  return '<div class="frases">' + filas.join("") + "</div>";
}

const RE_ITEM = /^(\d+)\.\s+(.*)$|^-\s+(.*)$/;
const RE_SUB = /^\s+-\s+(.*)$/;

function bloqueLista(items, ordenada, inicio, checklist) {
  const casilla = (html) =>
    checklist
      ? '<label class="chk"><input type="checkbox"><span>' + html + "</span></label>"
      : html;
  const lis = items.map((it) => {
    const sub = it.sub.length
      ? "<ul>" + it.sub.map((x) => "<li>" + enLinea(x) + "</li>").join("") + "</ul>"
      : "";
    return "<li>" + casilla(enLinea(it.texto)) + sub + "</li>";
  });
  if (checklist) return '<ul class="lista-chk">' + lis.join("") + "</ul>";
  return ordenada
    ? '<ol start="' + inicio + '">' + lis.join("") + "</ol>"
    : "<ul>" + lis.join("") + "</ul>";
}

// Devuelve { titulo, intro, secciones: [{ n, titulo, html }] }
function convertir(md) {
  const lineas = md.replace(/\r\n/g, "\n").split("\n");
  let titulo = "";
  const intro = [];
  const secciones = [];
  let actual = null;
  const salida = () => (actual ? actual.html : intro);
  let i = 0;
  let parrafo = [];
  const cerrarParrafo = () => {
    if (parrafo.length) {
      salida().push("<p>" + enLinea(parrafo.join(" ")) + "</p>");
      parrafo = [];
    }
  };

  while (i < lineas.length) {
    const l = lineas[i];
    if (l.trim() === "") { cerrarParrafo(); i++; continue; }

    if (l.startsWith("```")) {
      cerrarParrafo();
      const cuerpo = [];
      i++;
      while (i < lineas.length && !lineas[i].startsWith("```")) cuerpo.push(lineas[i++]);
      i++;
      salida().push(bloqueCodigo(cuerpo));
      continue;
    }

    let m;
    if ((m = l.match(/^# (.*)$/))) { cerrarParrafo(); titulo = m[1]; i++; continue; }
    if ((m = l.match(/^## (\d+)\.\s*(.*)$/))) {
      cerrarParrafo();
      actual = { n: Number(m[1]), titulo: m[2], html: [] };
      secciones.push(actual);
      i++;
      continue;
    }
    if ((m = l.match(/^### (.*)$/))) {
      cerrarParrafo();
      const t = m[1];
      const nt = norm(t);
      let extra = figurasPara(t);
      if (nt.includes("si tienes android")) extra += SVG_ANDROID;
      if (nt.includes("si tienes iphone")) extra += SVG_IPHONE;
      salida().push('<h3>' + enLinea(t) + "</h3>" + extra);
      i++;
      continue;
    }

    if (RE_ITEM.test(l)) {
      cerrarParrafo();
      const ordenada = /^\d+\./.test(l);
      const inicio = ordenada ? Number(l.match(/^(\d+)\./)[1]) : 1;
      const items = [];
      while (i < lineas.length) {
        const x = lineas[i];
        const mi = x.match(RE_ITEM);
        if (mi && !/^\s/.test(x)) {
          items.push({ texto: mi[2] !== undefined ? mi[2] : mi[3], sub: [] });
          i++;
        } else if (RE_SUB.test(x) && items.length) {
          items[items.length - 1].sub.push(x.match(RE_SUB)[1]);
          i++;
        } else if (x.trim() === "") {
          // la lista sigue si lo que viene despues es otro item del mismo tipo
          let j = i;
          while (j < lineas.length && lineas[j].trim() === "") j++;
          const sig = lineas[j];
          if (sig && RE_ITEM.test(sig) && /^\d+\./.test(sig) === ordenada) i = j;
          else break;
        } else break;
      }
      const checklist = actual && actual.n === 6;
      salida().push(bloqueLista(items, ordenada, inicio, checklist));
      continue;
    }

    parrafo.push(l.trim());
    i++;
  }
  cerrarParrafo();
  return { titulo, intro, secciones };
}

// ---------- pagina ----------
const LISTA_VERIFICACION = [
  "Abrí el enlace",
  "Instalé la app",
  "Entré con la clave",
  "Activé los avisos",
  "Puse el saldo inicial",
];

const CSS = `
:root{--fondo:#0A0A0C;--tarjeta:#121216;--texto:#EDE8DC;--suave:#B9B3A5;--oro:#D4AF37;--oro-tenue:rgba(212,175,55,.38);--campo:#1b1b21;color-scheme:dark}
*,*::before,*::after{box-sizing:border-box}
html{-webkit-text-size-adjust:100%;scroll-behavior:smooth}
body{margin:0;background:var(--fondo);color:var(--texto);font:17px/1.6 system-ui,-apple-system,"Segoe UI",Roboto,sans-serif;overflow-x:hidden}
@media (prefers-reduced-motion:reduce){html{scroll-behavior:auto}*{transition:none!important;animation:none!important}}
a{color:var(--oro)}
:focus-visible{outline:3px solid var(--oro);outline-offset:2px}
button{font:inherit;color:inherit}
.barra{position:sticky;top:0;z-index:20;background:rgba(10,10,12,.96);border-bottom:1px solid var(--oro-tenue)}
.barra-fila{display:flex;align-items:center;justify-content:space-between;gap:10px;padding:8px 16px;max-width:760px;margin:0 auto}
.barra-titulo{font-weight:700;color:var(--oro);overflow-wrap:anywhere}
.btn{min-height:44px;min-width:44px;padding:8px 16px;border-radius:10px;border:1px solid var(--oro);background:transparent;color:var(--oro);font-weight:600;cursor:pointer;overflow-wrap:anywhere}
.btn.pleno{background:var(--oro);color:#0A0A0C}
.btn:disabled{opacity:.45;cursor:not-allowed}
.btn:active:not(:disabled){transform:scale(.97)}
.panel-indice{max-width:760px;margin:0 auto;padding:4px 16px 14px}
.panel-indice[hidden]{display:none}
.panel-indice ol{list-style:none;margin:0;padding:0}
.panel-indice a,.indice a{display:block;min-height:44px;padding:10px 12px;border-radius:10px;color:var(--texto);text-decoration:none;overflow-wrap:anywhere}
.panel-indice a:hover,.indice a:hover{background:var(--campo)}
.panel-indice b,.indice b{color:var(--oro);margin-right:8px}
main{max-width:760px;margin:0 auto;padding:20px 16px 90px}
h1{font-size:1.65rem;line-height:1.25;margin:8px 0 18px;overflow-wrap:anywhere}
h2{font-size:1.35rem;line-height:1.3;margin:0;overflow-wrap:anywhere}
h3{font-size:1.1rem;line-height:1.35;margin:26px 0 8px;color:var(--oro);overflow-wrap:anywhere}
p{margin:0 0 14px;overflow-wrap:anywhere}
ul,ol{margin:0 0 14px;padding-left:1.4em}
li{margin-bottom:6px;overflow-wrap:anywhere}
li>ul{margin:6px 0 0}
strong{color:#fff}
code{font-family:ui-monospace,Consolas,monospace;font-size:.92em;background:var(--campo);padding:1px 6px;border-radius:6px;overflow-wrap:anywhere}
.ph{color:var(--oro);font-style:italic;overflow-wrap:anywhere}
.card{position:relative;background:var(--tarjeta);border:1px solid var(--oro);border-radius:16px;padding:18px 16px 10px;margin:0 8px 30px 0}
.card::before{content:"";position:absolute;inset:0;transform:translate(6px,6px);border:1px solid var(--oro-tenue);border-radius:16px;z-index:-1;pointer-events:none}
.card-cab{display:flex;align-items:center;gap:12px;margin-bottom:6px}
.num{flex:none;width:46px;height:46px;border-radius:50%;background:var(--oro);color:#0A0A0C;font-weight:800;font-size:1.4rem;display:flex;align-items:center;justify-content:center}
section[id]{scroll-margin-top:72px}
.acceso{margin-bottom:30px}
.acceso h2{font-size:1.15rem;margin-bottom:10px}
.fila{display:flex;flex-wrap:wrap;gap:8px;align-items:center;margin-bottom:12px}
.fila label{flex:1 1 100%;font-weight:600;color:var(--suave);font-size:.95rem}
.campo{flex:1 1 200px;min-width:0;min-height:44px;padding:8px 12px;border-radius:10px;border:1px solid var(--oro-tenue);background:var(--campo);color:var(--texto);font:inherit}
.campo::placeholder{color:#8f8a7e}
.frases{margin:0 0 14px}
.frase{display:flex;flex-wrap:wrap;gap:8px;align-items:center;justify-content:space-between;background:var(--campo);border:1px solid var(--oro-tenue);border-radius:12px;padding:8px 8px 8px 12px;margin-bottom:8px}
.frase code{flex:1 1 12rem;background:none;padding:0;font-size:1rem;overflow-wrap:anywhere;white-space:pre-wrap}
.copiar{min-height:44px;min-width:92px;padding:6px 14px;border-radius:10px;border:1px solid var(--oro);background:var(--oro);color:#0A0A0C;font-weight:700;cursor:pointer}
.copiar.ok,.chip.ok{background:#2f7d4f;border-color:#2f7d4f;color:#fff}
.copiar:active,.chip:active{transform:scale(.96)}
.chip{display:inline;min-height:32px;padding:3px 10px;margin:2px 1px;border-radius:999px;border:1px dashed var(--oro);background:rgba(212,175,55,.12);color:var(--texto);cursor:pointer;text-align:left;overflow-wrap:anywhere;font-size:.97em;line-height:1.7}
.chip.cod{font-family:ui-monospace,Consolas,monospace;font-size:.92em}
.fig{margin:10px auto 18px;text-align:center}
.fig img{display:block;width:100%;max-width:360px;height:auto;margin:0 auto;border:1px solid var(--oro);border-radius:14px}
.fig svg{display:block;width:100%;max-width:260px;height:auto;margin:0 auto}
.fig figcaption{font-size:.85rem;color:var(--suave);margin-top:6px}
.lista-chk{list-style:none;padding-left:0}
.lista-chk li{margin:0 0 6px}
.chk{display:flex;gap:12px;align-items:flex-start;min-height:44px;padding:8px 10px;border-radius:10px;background:var(--campo);cursor:pointer}
.chk input{flex:none;width:24px;height:24px;margin:2px 0 0;accent-color:var(--oro)}
.chk span{flex:1;min-width:0;overflow-wrap:anywhere}
.lista-chk li>ul{margin:6px 0 0 36px}
.verif{margin:22px 0 14px;padding:12px 12px 4px;border:1px dashed var(--oro);border-radius:14px}
.verif h3{margin-top:0}
.indice{margin:0 0 30px;padding:14px 10px;border:1px solid var(--oro-tenue);border-radius:14px}
.indice h2{font-size:1.1rem;padding:0 12px;margin-bottom:6px}
.indice ol{list-style:none;margin:0;padding:0}
.arriba{position:fixed;right:14px;bottom:14px;z-index:30;box-shadow:0 2px 10px rgba(0,0,0,.6);background:var(--oro);color:#0A0A0C;opacity:0;visibility:hidden;transition:opacity .2s}
.arriba.ver{opacity:1;visibility:visible}
.aviso{position:fixed;left:50%;bottom:76px;transform:translateX(-50%);background:var(--oro);color:#0A0A0C;font-weight:700;padding:10px 18px;border-radius:999px;opacity:0;visibility:hidden;transition:opacity .2s;z-index:40;pointer-events:none}
.aviso.ver{opacity:1;visibility:visible}
`;

const JS = `
(function () {
  var $ = function (s) { return document.querySelector(s); };
  var aviso = $('#aviso');
  var tAviso = 0;
  function mostrarAviso(t) {
    aviso.textContent = t;
    aviso.classList.add('ver');
    clearTimeout(tAviso);
    tAviso = setTimeout(function () { aviso.classList.remove('ver'); }, 1500);
  }
  // Respaldo para navegadores sin portapapeles moderno (por ejemplo desde un archivo local).
  function respaldo(texto) {
    var ta = document.createElement('textarea');
    ta.value = texto;
    ta.setAttribute('readonly', '');
    ta.style.position = 'fixed';
    ta.style.top = '0';
    ta.style.opacity = '0';
    document.body.appendChild(ta);
    ta.select();
    ta.setSelectionRange(0, texto.length);
    var ok = false;
    try { ok = document.execCommand('copy'); } catch (e) {}
    document.body.removeChild(ta);
    return ok;
  }
  function copiar(texto) {
    if (navigator.clipboard && window.isSecureContext) {
      return navigator.clipboard.writeText(texto).then(function () { return true; }, function () { return respaldo(texto); });
    }
    return Promise.resolve(respaldo(texto));
  }
  document.addEventListener('click', function (e) {
    var b = e.target.closest ? e.target.closest('[data-copy],[data-copiar-campo]') : null;
    if (!b) return;
    var texto = b.getAttribute('data-copy');
    if (texto === null) texto = $('#' + b.getAttribute('data-copiar-campo')).value;
    if (!texto) { mostrarAviso('No hay nada que copiar'); return; }
    copiar(texto).then(function (ok) {
      if (!ok) { mostrarAviso('No se pudo copiar'); return; }
      mostrarAviso('Copiado');
      var antes = b.getAttribute('data-antes') || b.textContent;
      b.setAttribute('data-antes', antes);
      b.classList.add('ok');
      if (b.classList.contains('copiar') || b.hasAttribute('data-copiar-campo')) b.textContent = 'Copiado';
      clearTimeout(b._t);
      b._t = setTimeout(function () { b.classList.remove('ok'); b.textContent = antes; }, 1500);
    });
  });

  // Acceso
  var enlace = $('#enlace'), clave = $('#clave'), abrir = $('#abrir'), ver = $('#ver');
  function estadoAbrir() { abrir.disabled = enlace.value.trim() === ''; }
  enlace.addEventListener('input', estadoAbrir);
  estadoAbrir();
  abrir.addEventListener('click', function () {
    var u = enlace.value.trim();
    if (!u) return;
    if (!/^https?:\\/\\//i.test(u)) u = 'https://' + u;
    window.open(u, '_blank', 'noopener');
  });
  ver.addEventListener('click', function () {
    var oculto = clave.type === 'password';
    clave.type = oculto ? 'text' : 'password';
    ver.textContent = oculto ? 'Ocultar' : 'Ver';
    ver.setAttribute('aria-pressed', oculto ? 'true' : 'false');
  });

  // Indice
  var bi = $('#btn-indice'), panel = $('#panel-indice');
  function cerrarIndice() { panel.hidden = true; bi.setAttribute('aria-expanded', 'false'); }
  bi.addEventListener('click', function () {
    var abierto = !panel.hidden;
    panel.hidden = abierto;
    bi.setAttribute('aria-expanded', abierto ? 'false' : 'true');
  });
  panel.addEventListener('click', function (e) { if (e.target.closest('a')) cerrarIndice(); });
  document.addEventListener('keydown', function (e) { if (e.key === 'Escape') cerrarIndice(); });

  // Volver arriba
  var arriba = $('#arriba');
  function posicion() { arriba.classList.toggle('ver', window.scrollY > 400); }
  window.addEventListener('scroll', posicion, { passive: true });
  posicion();
  arriba.addEventListener('click', function () {
    var suave = !window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    window.scrollTo({ top: 0, behavior: suave ? 'smooth' : 'auto' });
  });
})();
`;

function armar() {
  const md = readFileSync(ENTRADA, "utf8");
  const { titulo, intro, secciones } = convertir(md);

  const indiceLis = secciones
    .map((s) => '<li><a href="#paso-' + s.n + '"><b>' + s.n + "</b>" + esc(s.titulo) + "</a></li>")
    .join("");

  const acceso =
    '<div class="card acceso"><h2>Tu acceso a la app</h2>' +
    '<div class="fila"><label for="enlace">Enlace</label>' +
    '<input id="enlace" class="campo" type="text" inputmode="url" autocomplete="off" autocapitalize="none" spellcheck="false" placeholder="Pega aquí el enlace que te enviaron" value="' + esc(ENLACE) + '">' +
    '<button type="button" id="abrir" class="btn pleno">Abrir la app</button>' +
    '<button type="button" class="btn" data-copiar-campo="enlace">Copiar enlace</button></div>' +
    '<div class="fila"><label for="clave">Clave de acceso</label>' +
    '<input id="clave" class="campo" type="password" autocomplete="off" autocapitalize="none" spellcheck="false" placeholder="Escribe aquí tu clave" value="' + esc(CLAVE) + '">' +
    '<button type="button" id="ver" class="btn" aria-pressed="false">Ver</button>' +
    '<button type="button" class="btn" data-copiar-campo="clave">Copiar clave</button></div>' +
    '<p class="suave" style="font-size:.85rem;color:var(--suave);margin:0 0 8px">Lo que escribas aquí no se guarda en ningún lado.</p></div>';

  const verificacion =
    '<div class="verif"><h3>Lista de verificación</h3><ul class="lista-chk">' +
    LISTA_VERIFICACION.map((t) => '<li><label class="chk"><input type="checkbox"><span>' + esc(t) + "</span></label></li>").join("") +
    "</ul></div>";

  const tarjetas = secciones
    .map((s) => {
      const extra = s.n === 1 ? verificacion : "";
      return (
        '<section class="card" id="paso-' + s.n + '" aria-labelledby="t-paso-' + s.n + '">' +
        '<div class="card-cab"><span class="num" aria-hidden="true">' + s.n + '</span><h2 id="t-paso-' + s.n + '">' + esc(s.titulo) + "</h2></div>" +
        s.html.join("\n") + extra + "</section>"
      );
    })
    .join("\n");

  return (
    '<!doctype html>\n<html lang="es"><head><meta charset="utf-8">' +
    '<meta name="viewport" content="width=device-width, initial-scale=1">' +
    '<meta name="color-scheme" content="dark"><meta name="theme-color" content="#0A0A0C">' +
    "<title>" + esc(titulo) + "</title><style>" + CSS + "</style></head><body>" +
    '<header class="barra"><div class="barra-fila"><span class="barra-titulo">Guía de la app</span>' +
    '<button type="button" id="btn-indice" class="btn" aria-expanded="false" aria-controls="panel-indice">Índice</button></div>' +
    '<nav id="panel-indice" class="panel-indice" aria-label="Índice de pasos" hidden><ol>' + indiceLis + "</ol></nav></header>" +
    '<main id="inicio"><h1>' + esc(titulo) + "</h1>" + acceso +
    intro.join("\n") +
    '<nav class="indice" aria-label="Pasos de la guía"><h2>Los pasos</h2><ol>' + indiceLis + "</ol></nav>" +
    tarjetas +
    '</main><button type="button" id="arriba" class="btn arriba">Volver arriba</button>' +
    '<div id="aviso" class="aviso" role="status" aria-live="polite"></div>' +
    "<script>" + JS + "</script></body></html>\n"
  );
}

const html = armar();
mkdirSync(dirname(SALIDA), { recursive: true });
writeFileSync(SALIDA, html);
const copias = (html.match(/data-copy="/g) || []).length;
console.log(
  "Guía escrita en " + SALIDA + " (" + Math.round(html.length / 1024) + " KB, " +
    copias + " botones de copia, " + capturas.size + " capturas leídas)"
);
