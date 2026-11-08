import { z } from "zod"
import type { Mensaje } from "../llm/adapter"

export type ConfirmacionPendiente = { caso: string; codigos: string[] }

export type Sesion = {
  id: string
  mensajes: Mensaje[]
  confirmacionPendiente: ConfirmacionPendiente | null
  tokensUsados: number
}

export const ID_SESION = /^[A-Za-z0-9_-]{1,64}$/

export const crearSesion = (id: string): Sesion => ({ id, mensajes: [], confirmacionPendiente: null, tokensUsados: 0 })

const LlamadaSchema = z.object({ id: z.string(), nombre: z.string(), args: z.unknown() })

const MensajeSchema = z.discriminatedUnion("rol", [
  z.object({ rol: z.literal("system"), contenido: z.string() }),
  z.object({ rol: z.literal("user"), contenido: z.string() }),
  z.object({ rol: z.literal("assistant"), contenido: z.string().nullable(), llamadas: z.array(LlamadaSchema).optional() }),
  z.object({ rol: z.literal("tool"), contenido: z.string(), llamadaId: z.string(), nombre: z.string() }),
])

export const SesionSchema = z.object({
  id: z.string().regex(ID_SESION),
  mensajes: z.array(MensajeSchema),
  confirmacionPendiente: z.object({ caso: z.string(), codigos: z.array(z.string()) }).nullable(),
  tokensUsados: z.number().nonnegative(),
})
