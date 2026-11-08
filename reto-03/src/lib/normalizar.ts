/** Monto colombiano en texto ("COP 11.400.000") a número. Punto = miles, coma = decimales. */
export function parsearMonto(texto: string): number | null {
  const token = texto.match(/\d[\d.,]*/)?.[0]
  if (!token) return null
  const valor = Number(token.replace(/\./g, "").replace(",", "."))
  return Number.isFinite(valor) ? valor : null
}

/** NIT sin puntos ni dígito de verificación: "900.555.111-2" → "900555111". */
export function normalizarNit(nit: string): string {
  return (nit.split("-")[0] ?? "").replace(/\D/g, "")
}

/** Minúsculas, sin tildes ni puntuación, espacios colapsados. */
export function normalizarNombre(nombre: string): string {
  return nombre
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, "")
    .replace(/\s+/g, " ")
    .trim()
}

/** Fecha (AAAA-MM-DD) en el offset propio del valor; nunca se convierte a UTC. */
export function fechaLocal(fecha: string): string {
  return fecha.match(/^\d{4}-\d{2}-\d{2}/)?.[0] ?? fecha
}

export function contieneAprobado(texto: string): boolean {
  return /(^|[^\p{L}])aprobad[oa]([^\p{L}]|$)/iu.test(texto)
}

export function formatearMonto(valor: number): string {
  return Math.round(valor).toString().replace(/\B(?=(\d{3})+(?!\d))/g, ".")
}

export function sumarDias(fecha: string, dias: number): string {
  const d = new Date(`${fechaLocal(fecha)}T00:00:00Z`)
  d.setUTCDate(d.getUTCDate() + dias)
  return d.toISOString().slice(0, 10)
}
