/**
 * Los ejemplos de docs/BOT.md tienen que funcionar. Si alguien cambia lo que el bot entiende y
 * olvida el documento (o al revés), esta prueba lo avisa.
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { MemoriaRepo, procesar } from '../src/index.ts';
import { AHORA, textoDe } from '../../../tests/ayudas.ts';

const md = readFileSync(new URL('../../../docs/BOT.md', import.meta.url), 'utf8');

// Ventas necesita el catálogo de cada instalación; corregir una tarjeta necesita una tarjeta abierta.
const SECCIONES_APARTE = ['Ventas', 'Corregir una tarjeta'];

const ejemplos: { seccion: string; linea: string }[] = [];
let seccion = '';
let dentro = false;
for (const l of md.split('\n')) {
  if (l.startsWith('## ')) seccion = l.slice(3);
  if (l.startsWith('```')) { dentro = !dentro; continue; }
  if (dentro && l.trim() && !SECCIONES_APARTE.includes(seccion)) ejemplos.push({ seccion, linea: l.trim() });
}

const PERSONAS = ['Ivan', 'Daniel', 'Sergio', 'Ana', 'Jorge'].map(nombre => ({ nombre, grupo: 'amigos' }));

test('BOT.md trae ejemplos que probar', () => {
  assert.ok(ejemplos.length > 30, `solo se encontraron ${ejemplos.length}`);
});

test('cada ejemplo de BOT.md se entiende (no termina en error)', async () => {
  const fallos: string[] = [];
  for (const e of ejemplos) {
    const repo = new MemoriaRepo();
    repo.aplicarPlantilla(/Alcancía|Plata en otras/.test(e.seccion) ? 'familia' : 'personal', { personas: PERSONAS });
    const t = textoDe(await procesar(repo, { texto: e.linea }, AHORA));
    if (!t || /^(¡Casi|Me falta|¿De quién|No reconozco|No entiendo|No hay movimientos)/.test(t)) fallos.push(`[${e.seccion}] ${e.linea}  ->  ${t.slice(0, 80)}`);
  }
  assert.deepEqual(fallos, []);
});
