import { z } from "zod"
import { describirErrores } from "../lib/esquemas"
import { fallo, mensajeDeError } from "../lib/resultado"
import { dirSalida } from "../lib/rutas"
import type { LlamadaHerramienta, LlmAdapter, Mensaje, RespuestaLlm } from "../llm/adapter"
import type { Ctx } from "../tools/definir"
import { recortarHistorial, resultadoParaModelo } from "./historial"
import { type Decision, interpretarDecision, notaDecision, preguntaConfirmacion } from "./hitl"
import { registrarEvento, resumir, sanitizar } from "./log"
import { cargarSystemPrompt } from "./prompt"
import { type Registro, especificaciones } from "./registro"
import type { Sesion } from "./sesion"

const MAX_ITERACIONES_DEFECTO = 25
const MAX_TOKENS_SESION_DEFECTO = 150_000
const MAX_MENSAJES_MODELO = 40

export type ParametrosTurno = {
  llm: LlmAdapter
  herramientas: Registro
  sesion: Sesion
  mensaje: string
  ctx: Ctx
  decision?: Decision
  maxIteraciones?: number
  maxTokensSesion?: number
  systemPrompt?: string
}

export type LlamadaVisible = { nombre: string; args: unknown; resultado: string; ok: boolean; ms: number }

export type ResultadoTurno = { reply: string; toolCalls: LlamadaVisible[]; needsConfirmation: boolean }

/** Caso cuya confirmación aprobó el humano en este turno; solo para él se respeta `confirmado: true`. */
type Autorizacion = { caso: string | null }

type JsonHerramienta = {
  ok?: boolean
  // `validar` devuelve hallazgos completos y `construir_payload` solo los códigos.
  data?: { apta?: boolean; confirmaciones?: Array<{ codigo: string } | string>; numero_oc?: string }
  requiere_confirmacion?: { caso: string; codigos: string[] }
}

function leerJson(texto: string): JsonHerramienta {
  try {
    return JSON.parse(texto) as JsonHerramienta
  } catch {
    return {}
  }
}

const casoDe = (args: Record<string, unknown>): string | null => (typeof args.caso === "string" ? args.caso : null)

/** CA3: el modelo no puede auto-confirmar. Sin aprobación humana para ese caso, `confirmado` se fuerza a false. */
function aplicarControlConfirmacion(args: Record<string, unknown>, autorizacion: Autorizacion): Record<string, unknown> {
  if (args.confirmado !== true || casoDe(args) === autorizacion.caso) return args
  return { ...args, confirmado: false }
}

function actualizarPendiente(sesion: Sesion, args: Record<string, unknown>, resultado: string, autorizacion: Autorizacion): void {
  const json = leerJson(resultado)
  const caso = casoDe(args)
  if (json.requiere_confirmacion) {
    sesion.confirmacionPendiente = json.requiere_confirmacion
    return
  }
  const confirmaciones = json.data?.confirmaciones
  if (caso && json.ok && json.data?.apta === true && confirmaciones?.length) {
    sesion.confirmacionPendiente = { caso, codigos: confirmaciones.map((c) => (typeof c === "string" ? c : c.codigo)) }
  }
  if (caso && json.ok && json.data?.numero_oc && sesion.confirmacionPendiente?.caso === caso) {
    sesion.confirmacionPendiente = null
    autorizacion.caso = null
  }
}

async function ejecutarLlamada(
  llamada: LlamadaHerramienta,
  { herramientas, ctx, sesion }: ParametrosTurno,
  autorizacion: Autorizacion,
): Promise<LlamadaVisible> {
  const inicio = Date.now()
  const visible = (args: unknown, resultado: string): LlamadaVisible => ({
    nombre: llamada.nombre,
    args,
    resultado,
    ok: leerJson(resultado).ok === true,
    ms: Date.now() - inicio,
  })
  const h = herramientas[llamada.nombre]
  if (!h) {
    const disponibles = Object.keys(herramientas).join(", ")
    return visible(llamada.args, JSON.stringify(fallo(`La herramienta "${llamada.nombre}" no existe. Disponibles: ${disponibles}.`)))
  }
  const validados = z.object(h.args).safeParse(llamada.args)
  if (!validados.success) {
    return visible(llamada.args, JSON.stringify(fallo(`Argumentos inválidos para ${llamada.nombre}: ${describirErrores(validados.error)}`)))
  }
  const args = aplicarControlConfirmacion(validados.data, autorizacion)
  const resultado = await h.execute(args as never, ctx)
  actualizarPendiente(sesion, args, resultado, autorizacion)
  return visible(args, resultado)
}

function prepararDecision(sesion: Sesion, mensaje: string, explicita?: Decision): { autorizacion: Autorizacion; nota: string | null } {
  const pendiente = sesion.confirmacionPendiente
  if (!pendiente) return { autorizacion: { caso: null }, nota: null }
  const decision = interpretarDecision(mensaje, explicita)
  if (decision === "rechazar") sesion.confirmacionPendiente = null
  return { autorizacion: { caso: decision === "aprobar" ? pendiente.caso : null }, nota: notaDecision(pendiente, decision) }
}

function resumenTope(toolCalls: LlamadaVisible[], maximo: number): string {
  const hechas = toolCalls.map((t) => `${t.nombre} (${t.ok ? "ok" : "error"})`).join(", ") || "ninguna"
  return `Alcancé el tope de ${maximo} pasos en este turno. Herramientas ejecutadas: ${hechas}. Falta completar el análisis; escribe "continúa" para seguir.`
}

/** Un turno del agente: prompt → modelo → herramientas → … → respuesta (CA1–CA5). */
export async function ejecutarTurno(p: ParametrosTurno): Promise<ResultadoTurno> {
  const { llm, herramientas, sesion, mensaje, ctx } = p
  const maxIteraciones = p.maxIteraciones ?? MAX_ITERACIONES_DEFECTO
  const maxTokens = p.maxTokensSesion ?? MAX_TOKENS_SESION_DEFECTO
  const dirOut = dirSalida(ctx.directory)
  const toolCalls: LlamadaVisible[] = []
  const log = (tipo: string, datos: Record<string, unknown> = {}) => registrarEvento(dirOut, { sessionId: sesion.id, tipo, ...datos })

  const { autorizacion, nota } = prepararDecision(sesion, mensaje, p.decision)
  sesion.mensajes.push({ rol: "user", contenido: nota ? `${mensaje}\n\n${nota}` : mensaje })
  await log("turno_inicio", { mensaje: resumir(mensaje), decision: p.decision ?? null, pendiente: sesion.confirmacionPendiente })

  const finalizar = async (texto: string): Promise<ResultadoTurno> => {
    const pendiente = sesion.confirmacionPendiente
    const reply = pendiente && !texto.includes("?") ? `${texto}\n\n${preguntaConfirmacion(pendiente)}` : texto
    sesion.mensajes.push({ rol: "assistant", contenido: reply })
    await log("turno_fin", { herramientas: toolCalls.map((t) => t.nombre), tokens_sesion: sesion.tokensUsados, needsConfirmation: pendiente !== null })
    return { reply, toolCalls, needsConfirmation: pendiente !== null }
  }

  const topeTokens = `Esta sesión alcanzó el tope de uso del modelo (${maxTokens} tokens). Abre una sesión nueva para continuar.`
  const specs = especificaciones(herramientas)

  for (let iteracion = 1; iteracion <= maxIteraciones; iteracion++) {
    if (sesion.tokensUsados >= maxTokens) return finalizar(topeTokens)
    const inicio = Date.now()
    let respuesta: RespuestaLlm
    try {
      const system = p.systemPrompt ?? cargarSystemPrompt(process.env.PROJECT_ROOT ?? process.cwd())
      const mensajes: Mensaje[] = [{ rol: "system", contenido: system }, ...recortarHistorial(sesion.mensajes, MAX_MENSAJES_MODELO)]
      respuesta = await llm.enviar(mensajes, specs)
    } catch (e) {
      const detalle = sanitizar(mensajeDeError(e))
      await log("error_llm", { iteracion, error: detalle })
      return finalizar(`No pude obtener respuesta del modelo de lenguaje (${detalle}). La sesión sigue activa: intenta de nuevo.`)
    }
    sesion.tokensUsados += respuesta.uso?.tokens ?? 0
    await log("llm", { iteracion, ms: Date.now() - inicio, tokens: respuesta.uso?.tokens ?? 0, llamadas: respuesta.llamadas.map((l) => l.nombre) })

    if (respuesta.llamadas.length === 0) return finalizar(respuesta.texto?.trim() || "No tengo nada más que agregar.")

    sesion.mensajes.push({ rol: "assistant", contenido: respuesta.texto, llamadas: respuesta.llamadas })
    for (const llamada of respuesta.llamadas) {
      const visible = await ejecutarLlamada(llamada, p, autorizacion)
      toolCalls.push(visible)
      sesion.mensajes.push({ rol: "tool", llamadaId: llamada.id, nombre: llamada.nombre, contenido: resultadoParaModelo(visible.resultado) })
      await log("tool", { nombre: visible.nombre, args: visible.args, ok: visible.ok, ms: visible.ms, resultado: resumir(visible.resultado) })
    }
  }
  return finalizar(resumenTope(toolCalls, maxIteraciones))
}
