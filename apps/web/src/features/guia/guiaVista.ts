/**
 * «Primeros pasos»: cinco tarjetas con lo básico. Cada una trae un botón que deja el ejemplo escrito
 * en el chat para que solo toque enviarlo. Los ejemplos salen de las cuentas de esta app.
 */
import { ejemploDeCuenta, ejemploDeSaldos } from '../../../../../packages/core/src/index.ts';
import { leerTodo } from '../../services/app.ts';
import { esc } from '../../lib/carta.ts';
import { prellenarChat } from '../../state/nav.ts';

export async function vistaGuia(cont: HTMLElement, irAlChat: () => void): Promise<void> {
  const { ctx } = await leerTodo();
  const pasos: { titulo: string; texto: string; ejemplo?: string }[] = [
    { titulo: '1. Cuenta cuánta plata tienes', texto: 'La primera vez, dile cuánto tienes en cada cuenta. Eso no cuenta como ingreso: solo marca desde dónde se calculan tus saldos.', ejemplo: `saldo inicial ${ejemploDeSaldos(ctx)}` },
    { titulo: '2. Anota un gasto', texto: 'Escribe como hablas: en qué y cuánto. La app te muestra lo que entendió y tú pulsas Confirmar.', ejemplo: 'almuerzo 12000' },
    { titulo: '3. Dile con qué cuenta', texto: 'Pon la cuenta al final de la frase. Si no pones ninguna, se toma Efectivo.', ejemplo: `almuerzo 12000 ${ejemploDeCuenta(ctx).split(' ').pop() ?? ''}`.trim() },
    { titulo: '4. Si te equivocas', texto: 'Pulsa Editar y di solo lo que cambia, o Deshacer para anularlo. Nada se borra de verdad.', ejemplo: 'deshacer' },
    { titulo: '5. Mira cómo vas', texto: 'En el chat puedes escribir «saldo», «mes» o «deudas». Abajo tienes Saldos, Movimientos (con filtros) y Resumen.', ejemplo: 'saldo' },
  ];
  cont.innerHTML = `
    
    <p class="sub">Toca «Probar» y el ejemplo queda escrito en el chat. Solo falta enviarlo.</p>
    <ul class="lista">${pasos.map((p, i) => `<li class="fila" style="cursor:default;align-items:flex-start"><div>
      <div class="titulo">${esc(p.titulo)}</div><div class="sub">${esc(p.texto)}</div>
      ${p.ejemplo ? `<div class="sub"><code>${esc(p.ejemplo)}</code></div>` : ''}</div>
      ${p.ejemplo ? `<button class="chip" data-probar="${i}">Probar</button>` : ''}</li>`).join('')}</ul>
    <p class="sub">Para más ejemplos, escribe «ayuda» en el chat.</p>`;
  cont.querySelectorAll<HTMLButtonElement>('[data-probar]').forEach(b => b.addEventListener('click', () => {
    prellenarChat(pasos[Number(b.dataset.probar)].ejemplo ?? '');
    irAlChat();
  }));
}
