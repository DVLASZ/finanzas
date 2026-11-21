// Aplica piel, tema y letra ANTES de pintar, para que no parpadee de claro a oscuro al abrir.
// Va en un archivo aparte (y no dentro de index.html) porque la política de contenido del servidor no permite scripts en línea.
(function () {
  var h = document.documentElement, d = h.dataset, e = {};
  try { e = JSON.parse(localStorage.getItem('apariencia') || '{}'); } catch (x) { /* sin almacenamiento */ }
  var t = e.tema || d.temaDefecto || 'auto';
  d.temaElegido = t;
  d.tema = t === 'auto' ? (matchMedia('(prefers-color-scheme: dark)').matches ? 'oscuro' : 'claro') : t;
  var p = e.piel || d.pielDefecto;
  var nuevo = { libro: 'midnight', oceano: 'midnight', zafiro: 'midnight', abyss: 'midnight', mocha: 'tierra', veltro: 'esmeralda', aether: 'kinetix', onyx: 'obsidiana', atardecer: 'bordeaux' };
  var vigentes = ['obsidiana', 'midnight', 'tierra', 'esmeralda', 'bordeaux', 'kinetix'];
  d.piel = vigentes.indexOf(p) >= 0 ? p : (nuevo[p] || 'obsidiana'); // lo mismo que pielValida() de apariencia.ts
  d.letra = e.letra || d.letraDefecto || 'normal';
})();
