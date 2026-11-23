import assert from 'node:assert/strict';
import { test } from 'node:test';
import { fechasQueFaltan, nombraAlFijo, yaRegistrado, type Movimiento, type Recurrente } from '../src/index.ts';

const claude: Recurrente = { dia: 5, frase: 'suscripcion claude 65173 nequi', concepto: 'Suscripción Claude', monto: 65173 };
const mov = (descripcion: string, fecha: string, extra: Partial<Movimiento> = {}): Movimiento =>
  ({ id: descripcion + fecha, ocurridoEn: `${fecha} 12:00:00`, descripcion, estado: 'ok', asientos: [], ...extra }) as Movimiento;

test('un movimiento «claude» cubre el pago fijo «Suscripción Claude» aunque el monto cambie', () => {
  assert.ok(nombraAlFijo(claude, 'claude'));
  assert.ok(nombraAlFijo(claude, 'Claude 70351'));
  assert.ok(nombraAlFijo(claude, 'suscripcion claude'));
  assert.ok(!nombraAlFijo(claude, 'claudia'));
  assert.ok(!nombraAlFijo(claude, 'suscripcion netflix'));
  const hoy = '2026-11-22 10:00:00';
  const movs = [mov('claude', '2026-11-06')];
  assert.equal(yaRegistrado(claude, movs, hoy), true);
  assert.deepEqual(fechasQueFaltan(claude, movs, hoy, '2026-12-22').filter(f => f < '2026-12-01'), []);
  // sin el pago de este mes, el vencido sale con la fecha de hoy
  assert.deepEqual(fechasQueFaltan(claude, [], hoy, '2026-12-22')[0], '2026-11-22');
});

test('un movimiento anulado no cubre el pago fijo', () => {
  assert.equal(yaRegistrado(claude, [mov('claude', '2026-11-06', { estado: 'anulado' })], '2026-11-22 10:00:00'), false);
});
