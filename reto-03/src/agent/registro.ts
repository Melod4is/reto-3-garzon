import { z } from "zod"
import type { HerramientaSpec } from "../llm/adapter"
import type { Ctx, Esquema } from "../tools/definir"

/** Herramienta tal como la ve el ciclo: los argumentos se validan con `args` antes de ejecutar. */
export type HerramientaRegistrada = {
  description: string
  args: Esquema
  execute: (args: never, ctx: Ctx) => Promise<string>
}

export type Registro = Record<string, HerramientaRegistrada>

function esHerramienta(valor: unknown): valor is HerramientaRegistrada {
  if (!valor || typeof valor !== "object") return false
  const h = valor as Record<string, unknown>
  return typeof h.description === "string" && typeof h.execute === "function" && typeof h.args === "object" && h.args !== null
}

/** `{ oc }` → `{ oc_leer_paquete, oc_validar, ... }` (nombre visible: `<archivo>_<export>`). */
export function construirRegistro(modulos: Record<string, object>): Registro {
  const registro: Registro = {}
  for (const [prefijo, modulo] of Object.entries(modulos)) {
    for (const [nombre, valor] of Object.entries(modulo)) {
      if (esHerramienta(valor)) registro[`${prefijo}_${nombre}`] = valor
    }
  }
  return registro
}

export function especificaciones(registro: Registro): HerramientaSpec[] {
  return Object.entries(registro).map(([nombre, h]) => ({
    nombre,
    descripcion: h.description,
    parametros: z.toJSONSchema(z.object(h.args)) as Record<string, unknown>,
  }))
}
