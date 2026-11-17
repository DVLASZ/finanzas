// Aplica piel, tema y letra ANTES de pintar, para que no parpadee de claro a oscuro al abrir.
// Va en un archivo aparte (y no dentro de index.html) porque la política de contenido del servidor no permite scripts en línea.
(function () {
  var h = document.documentElement, d = h.dataset, e = {};
  try { e = JSON.parse(localStorage.getItem('apariencia') || '{}'); } catch (x) { /* sin almacenamiento */ }
  var t = e.tema || d.temaDefecto || 'auto';
  d.temaElegido = t;
  d.tema = t === 'auto' ? (matchMedia('(prefers-color-scheme: dark)').matches ? 'oscuro' : 'claro') : t;
  d.piel = e.piel || d.pielDefecto || 'libro';
  d.letra = e.letra || d.letraDefecto || 'normal';
})();
