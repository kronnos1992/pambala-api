export function toCents(value: number): number {
  return Math.round((value || 0) * 100);
}

export function fromCents(cents: number): number {
  return (cents || 0) / 100;
}

export function roundCents(value: number): number {
  return Math.round(value || 0);
}

// Arredondamento por excesso ao cêntimo seguinte (taxContribution — DE 683/25):
// 23,144→23,15 | 5,9999999→6,00 | 0,001844→0,01
export function roundUpCents(value: number): number {
  return Math.ceil((value || 0) - 1e-9);
}

export function formatFromCents(cents: number): string {
  return (cents || 0) / 100 >= 0 && (cents || 0) / 100 < 1e9
    ? ((cents || 0) / 100).toFixed(2)
    : String((cents || 0) / 100);
}

export function sumCents(values: number[]): number {
  return values.reduce((sum, v) => sum + roundCents(v || 0), 0);
}