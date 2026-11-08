import { z } from "zod"
import { describirErrores } from "../lib/esquemas"
import { type Fallo, type Resultado, fallo, mensajeDeError } from "../lib/resultado"

export type Ctx = { directory: string; sessionId: string }

export type Esquema = Record<string, z.ZodType>

export type Herramienta<A extends Esquema = Esquema> = {
  description: string
  args: A
  execute: (args: z.infer<z.ZodObject<A>>, ctx: Ctx) => Promise<string>
}

/** Fallo que deja la OC en espera de confirmación humana (CA3). */
export type FalloConfirmacion = Fallo & { requiere_confirmacion: { caso: string; codigos: string[] } }

type Definicion<A extends Esquema, T> = {
  description: string
  args: A
  ejecutar: (args: z.infer<z.ZodObject<A>>, ctx: Ctx) => Promise<Resultado<T> | FalloConfirmacion>
}

/** Aplica el contrato PRD 6.2: valida con zod, devuelve string JSON y nunca lanza. */
export function definirHerramienta<A extends Esquema, T>(def: Definicion<A, T>): Herramienta<A> {
  const esquema = z.object(def.args)
  return {
    description: def.description,
    args: def.args,
    async execute(args, ctx) {
      const r = esquema.safeParse(args)
      if (!r.success) return JSON.stringify(fallo(`Argumentos inválidos: ${describirErrores(r.error)}`))
      try {
        return JSON.stringify(await def.ejecutar(r.data, ctx))
      } catch (e) {
        return JSON.stringify(fallo(`Error interno de la herramienta: ${mensajeDeError(e)}`))
      }
    },
  }
}
