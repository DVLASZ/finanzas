/** La pantalla de bloqueo: pide el PIN, y después de equivocarse varias veces hace esperar (la espera se guarda en el dispositivo). */
import { Lock } from 'lucide-preact';
import { useEffect, useRef, useState } from 'preact/hooks';
import { intentarPin, textoDeFallo } from '../../services/seguridad.ts';
import { escribir, leer } from '../../services/almacen.ts';
import { bloqueada, desbloquear } from '../../state/bloqueo.ts';
import { montosOcultos } from '../../state/privacidad.ts';

export function Bloqueo() {
  const [pin, setPin] = useState('');
  const [mensaje, setMensaje] = useState('');
  const [espera, setEspera] = useState(0);
  const campo = useRef<HTMLInputElement>(null);

  // al bloquearse, los montos se esconden también: lo que quede detrás no debe verse
  useEffect(() => {
    if (!bloqueada.value) return;
    montosOcultos.value = true;
    void leer<{ n: number; hasta: number }>('pin-fallos').then(f => { if (f && f.hasta > Date.now()) setEspera(Math.ceil((f.hasta - Date.now()) / 1000)); });
    setTimeout(() => campo.current?.focus(), 50);
  }, [bloqueada.value]);

  // cuenta regresiva de la espera
  useEffect(() => {
    if (espera <= 0) return;
    const id = setTimeout(() => setEspera(e => Math.max(0, e - 1)), 1000);
    return () => clearTimeout(id);
  }, [espera]);

  if (!bloqueada.value) return null;
  const probar = async (e: Event) => {
    e.preventDefault();
    if (espera > 0 || !pin) return;
    const r = await intentarPin(pin);
    setPin('');
    if (r.ok) { setMensaje(''); desbloquear(); void escribir('ultimo-desbloqueo', Date.now()); return; }
    setEspera(r.esperaS);
    setMensaje(textoDeFallo(r));
    campo.current?.focus();
  };
  return (
    <div id="bloqueo" role="dialog" aria-modal="true" aria-label="App bloqueada" class="fixed inset-0 z-[120] grid place-items-center bg-fondo p-6">
      <form class="w-full max-w-xs text-center" onSubmit={probar}>
        <span class="mx-auto mb-3 grid h-14 w-14 place-items-center rounded-2xl bg-marca/15 text-marca-tx"><Lock size={26} /></span>
        <h1 class="!text-lg">App bloqueada</h1>
        <p class="sub">Escribe tu PIN para entrar.</p>
        <input ref={campo} id="bloqueo-pin" type="password" inputMode="numeric" autocomplete="off" aria-label="PIN" disabled={espera > 0} value={pin}
          onInput={e => setPin((e.target as HTMLInputElement).value)} class="!mt-3 text-center" />
        <p id="bloqueo-mensaje" class={`sub mt-2 min-h-[1.5em] ${mensaje ? 'text-neg' : ''}`} role="alert">
          {espera > 0 ? `Espera ${espera < 60 ? `${espera} s` : `${Math.ceil(espera / 60)} min`} para volver a intentar.` : mensaje}
        </p>
        <button type="submit" class="primario mt-2 w-full" id="bloqueo-entrar" disabled={espera > 0 || !pin}>Entrar</button>
      </form>
    </div>
  );
}
