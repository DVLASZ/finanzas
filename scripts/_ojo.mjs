// El ojo de privacidad solo está en Saldos y Resumen: este ayudante lo pulsa desde donde se esté y vuelve a la pantalla de antes.
const EN_PAGINA = async () => {
  const nav = document.querySelector('nav');
  const antes = nav.querySelector('[aria-current=page]')?.dataset.p;
  const ir = p => nav.querySelector('[data-p=' + p + ']').click();
  const w = ms => new Promise(r => setTimeout(r, ms));
  ir('saldos'); await w(450);
  document.querySelector('#ojo').click(); await w(250);
  if (antes && antes !== 'saldos') { ir(antes); await w(350); }
};
export const alternarOjo = pag => pag.evaluate(`(${EN_PAGINA.toString()})()`);
/** Deja los montos a la vista si estaban ocultos (la app arranca ocultándolos). */
export const mostrarMontos = async pag => { if (await pag.evaluate(() => document.documentElement.dataset.privado === '1')) await alternarOjo(pag); };
/** Los deja ocultos si estaban a la vista. */
export const ocultarMontos = async pag => { if (await pag.evaluate(() => document.documentElement.dataset.privado !== '1')) await alternarOjo(pag); };
