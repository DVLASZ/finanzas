/**
 * Ficha de una persona: saldo neto en pesos y dólares, deudas activas y su historial. Sirve para cualquiera, tenga deuda o no.
 * También vive aquí el archivado: se esconde de selectores y listas, pero sus movimientos y saldos siguen intactos.
 */
import { Archive, List, MessageSquare } from 'lucide-preact';
import type { ComponentChildren } from 'preact';
import { cambiarArchivada, deudasPorPersona, describirDia, formatear, type Datos } from '../../../../../packages/core/src/index.ts';
import { abrirInfo, cerrarYLuego } from '../../components/ui/HojaInfo.tsx';
import { avisar, confirmar } from '../../components/ui/Dialogo.tsx';
import { movimientosDePersona } from '../../lib/grupos.ts';
import { app } from '../../services/estado.ts';
import { guardarCambio } from '../../state/acciones.ts';
import { irA, prellenarChat } from '../../state/nav.ts';
import { verMovimientos } from '../movimientos/Movimientos.tsx';

type Accion = { id: string; texto: string; icono?: ComponentChildren; alTocar: () => void };

/** Deudas de una persona: una entrada por moneda con saldo distinto de cero. */
const deudasDe = (datos: Datos, personaId: string) =>
  deudasPorPersona(datos.movimientos, datos.cuentas, datos.compromisos, datos.config.fecha_apertura ?? '2000-01-01 00:00:00').filter(d => d.persona.id === personaId);

/** Archiva una persona si está en paz. Con saldo o deudas activas avisa y no hace nada. Devuelve si quedó archivada. */
export async function archivarPersona(datos: Datos, personaId: string): Promise<boolean> {
  const p = datos.cuentas.find(c => c.id === personaId);
  if (!p) return false;
  const conSaldo = deudasDe(datos, personaId).length > 0;
  const conDeuda = datos.compromisos.some(c => c.personaId === personaId && c.estado === 'activa');
  if (conSaldo || conDeuda) { await avisar({ titulo: 'Tiene deudas pendientes: salda primero', texto: `${p.nombre} sigue con saldo o con deudas activas.`, tono: 'peligro' }); return false; }
  const quiere = await confirmar({ titulo: `¿Archivar a ${p.nombre}?`, texto: 'Deja de salir en listas y selectores. Sus movimientos no cambian y la puedes restaurar desde Categorías y personas.', aceptar: 'Sí, archivar', cancelar: 'Cancelar' });
  if (!quiere) return false;
  await guardarCambio(() => app.repo.setConfig('archivadas', cambiarArchivada(datos.config, personaId, true)));
  return true;
}

export function abrirFichaPersona(datos: Datos, personaId: string, extra: Accion[] = [], sub?: string): void {
  const p = datos.cuentas.find(c => c.id === personaId);
  if (!p) return;
  const deudas = deudasDe(datos, personaId);
  const saldo = (m: 'COP' | 'USD') => deudas.find(d => d.moneda === m)?.saldo ?? 0;
  const texto = (m: 'COP' | 'USD') => {
    const s = saldo(m);
    return s === 0 ? `${m}: en paz` : `${m}: ${s < 0 ? 'le debes' : 'te debe'} ${formatear(Math.abs(s), m)}`;
  };
  const activas = datos.compromisos.filter(c => c.personaId === personaId && c.estado === 'activa');
  const nombre = p.nombre.split(' ')[0];
  abrirInfo({
    id: `ficha-${personaId}`,
    titulo: p.nombre,
    sub: sub ?? `${texto('COP')} · ${texto('USD')}`,
    cuerpo: activas.length > 0 ? (
      <ul class="ficha-persona-deudas" id="ficha-persona">
        {activas.map(c => (
          <li key={c.id} class="sub">
            {c.direccion === 'debo' ? 'Le debes' : 'Te debe'} {formatear(c.monto, c.moneda)}{c.motivo ? ` · ${c.motivo}` : ''}{c.fechaLimite ? ` · antes del ${describirDia(c.fechaLimite)}` : ''}
          </li>
        ))}
      </ul>
    ) : <p class="sub" id="ficha-persona">Sin deudas activas.</p>,
    movimientos: movimientosDePersona(datos, personaId),
    acciones: [
      ...extra,
      { id: 'info-ver-movimientos', texto: 'Ver en Movimientos', icono: <List size={18} />, alTocar: () => cerrarYLuego(() => verMovimientos({ persona: personaId, periodo: 'todo' })) },
      { id: 'info-escribir-chat', texto: 'Escribir en el chat', icono: <MessageSquare size={18} />, alTocar: () => cerrarYLuego(() => { prellenarChat(`le presté a ${nombre} `); irA('chat'); }) },
      { id: 'archivar-persona', texto: 'Archivar', icono: <Archive size={18} />, alTocar: () => void archivarPersona(datos, personaId).then(ok => { if (ok) cerrarYLuego(() => undefined); }) },
    ],
  });
}
