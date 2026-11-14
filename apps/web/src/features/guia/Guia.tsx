/**
 * «Primeros pasos»: cinco tarjetas con lo básico. Cada una trae un botón que deja el ejemplo escrito
 * en el chat para que solo toque enviarlo. Los ejemplos salen de las cuentas de esta app.
 */
import { ejemploDeCuenta, ejemploDeSaldos } from '../../../../../packages/core/src/index.ts';
import { Cargando, Nota } from '../../components/ui/piezas.tsx';
import { irA, prellenarChat } from '../../state/nav.ts';
import { ctx as contexto } from '../../state/store.ts';

export function Guia() {
  const ctx = contexto.value;
  if (!ctx) return <Cargando />;
  const pasos: { titulo: string; texto: string; ejemplo: string }[] = [
    { titulo: '1. Cuenta cuánta plata tienes', texto: 'La primera vez, dile cuánto tienes en cada cuenta. Eso no cuenta como ingreso: solo marca desde dónde se calculan tus saldos.', ejemplo: `saldo inicial ${ejemploDeSaldos(ctx)}` },
    { titulo: '2. Anota un gasto', texto: 'Escribe como hablas: en qué y cuánto. La app te muestra lo que entendió y tú pulsas Confirmar.', ejemplo: 'almuerzo 12000' },
    { titulo: '3. Dile con qué cuenta', texto: 'Pon la cuenta al final de la frase. Si no pones ninguna, se toma Efectivo.', ejemplo: `almuerzo 12000 ${ejemploDeCuenta(ctx).split(' ').pop() ?? ''}`.trim() },
    { titulo: '4. Si te equivocas', texto: 'Pulsa Editar y di solo lo que cambia, o Deshacer para anularlo. Nada se borra de verdad.', ejemplo: 'deshacer' },
    { titulo: '5. Mira cómo vas', texto: 'En el chat puedes escribir «saldo», «mes» o «deudas». Abajo tienes Saldos, Movimientos (con filtros) y Resumen.', ejemplo: 'saldo' },
  ];
  return (
    <div class="pb-10">
      <Nota>Toca «Probar» y el ejemplo queda escrito en el chat. Solo falta enviarlo.</Nota>
      <ul class="lista">
        {pasos.map(p => (
          <li key={p.titulo} class="fila" style={{ cursor: 'default', alignItems: 'flex-start' }}>
            <div>
              <div class="titulo">{p.titulo}</div>
              <div class="sub">{p.texto}</div>
              <div class="sub"><code>{p.ejemplo}</code></div>
            </div>
            <button class="chip" data-probar onClick={() => { prellenarChat(p.ejemplo); irA('chat'); }}>Probar</button>
          </li>
        ))}
      </ul>
      <Nota>Para más ejemplos, escribe «ayuda» en el chat.</Nota>
    </div>
  );
}
