/** La fecha de referencia de un periodo `atras` semanas, meses o años antes de hoy. */
export function fechaAtras(hoy: Date, periodo: 'semana' | 'mes' | 'anio', atras: number): Date {
  const f = new Date(hoy);
  if (periodo === 'semana') f.setDate(f.getDate() - 7 * atras);
  else if (periodo === 'mes') f.setMonth(f.getMonth() - atras, 15); // a mitad de mes: sin riesgo de caer en el mes vecino por la zona horaria
  else f.setFullYear(f.getFullYear() - atras, 5, 15);
  return f;
}
