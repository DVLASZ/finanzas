/** La sección «Apariencia» de Ajustes: tema, tamaño de letra y (escondido) el estilo. */
import { actual } from './apariencia.ts';

export function seccionApariencia(): string {
  const a = actual();
  const grupo = (clave: string, titulo: string, opciones: [string, string][], valor: string) =>
    `<div><div class="etiqueta">${titulo}</div><div class="opciones">${opciones
      .map(([v, t]) => `<button data-ap="${clave}" data-v="${v}" aria-pressed="${v === valor}">${t}</button>`).join('')}</div></div>`;
  return grupo('tema', 'Tema', [['claro', 'Claro'], ['oscuro', 'Oscuro'], ['auto', 'Automático']], a.tema)
    + grupo('letra', 'Tamaño de letra', [['normal', 'Normal'], ['grande', 'Grande']], a.letra)
    + `<details><summary class="sub">Apariencia avanzada</summary>${grupo('piel', 'Estilo', [['libro', 'Libro de cuentas'], ['tierra', 'Tierra de café']], a.piel)}</details>`;
}
