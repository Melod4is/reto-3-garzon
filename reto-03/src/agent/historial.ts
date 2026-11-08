import type { Mensaje } from "../llm/adapter"

const MAX_TEXTO_PARA_MODELO = 600

/** Últimos `max` mensajes, empezando siempre en un mensaje del usuario (sin resultados de herramienta huérfanos). */
export function recortarHistorial(mensajes: Mensaje[], max: number): Mensaje[] {
  if (mensajes.length <= max) return mensajes
  const desde = mensajes.length - max
  const inicio = mensajes.findIndex((m, i) => i >= desde && m.rol === "user")
  return inicio === -1 ? [] : mensajes.slice(inicio)
}

function recortarTextos(valor: unknown): unknown {
  if (typeof valor === "string") return valor.length > MAX_TEXTO_PARA_MODELO ? `${valor.slice(0, MAX_TEXTO_PARA_MODELO)}…` : valor
  if (Array.isArray(valor)) return valor.map(recortarTextos)
  if (valor && typeof valor === "object") {
    return Object.fromEntries(Object.entries(valor).map(([k, v]) => [k, recortarTextos(v)]))
  }
  return valor
}

/** Resultado de herramienta reducido para el modelo: ahorra tokens sin cambiar ningún valor de negocio. */
export function resultadoParaModelo(resultado: string): string {
  try {
    return JSON.stringify(recortarTextos(JSON.parse(resultado)))
  } catch {
    return resultado
  }
}
