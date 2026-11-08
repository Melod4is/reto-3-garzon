import OpenAI from "openai"
import type { ChatCompletionMessageParam, ChatCompletionTool } from "openai/resources/chat/completions"
import type { HerramientaSpec, LlamadaHerramienta, LlmAdapter, Mensaje, RespuestaLlm } from "./adapter"

export type OpcionesOpenAi = { apiKey: string; modelo: string; baseURL?: string; timeoutMs: number }

function aMensajeOpenAi(m: Mensaje): ChatCompletionMessageParam {
  switch (m.rol) {
    case "system":
    case "user":
      return { role: m.rol, content: m.contenido }
    case "tool":
      return { role: "tool", tool_call_id: m.llamadaId, content: m.contenido }
    case "assistant":
      return {
        role: "assistant",
        content: m.contenido,
        ...(m.llamadas?.length
          ? {
              tool_calls: m.llamadas.map((l) => ({
                id: l.id,
                type: "function" as const,
                function: { name: l.nombre, arguments: JSON.stringify(l.args ?? {}) },
              })),
            }
          : {}),
      }
  }
}

const aHerramientaOpenAi = (h: HerramientaSpec): ChatCompletionTool => ({
  type: "function",
  function: { name: h.nombre, description: h.descripcion, parameters: h.parametros },
})

function parsearArgumentos(texto: string): unknown {
  try {
    return JSON.parse(texto)
  } catch {
    return { argumentos_invalidos: texto }
  }
}

/** Proveedor OpenAI o cualquier API compatible (Gemini, Groq, DeepSeek, Ollama) vía `baseURL`. */
export class OpenAiLlm implements LlmAdapter {
  private readonly cliente: OpenAI

  constructor(private readonly opciones: OpcionesOpenAi) {
    this.cliente = new OpenAI({
      apiKey: opciones.apiKey,
      timeout: opciones.timeoutMs,
      maxRetries: 1,
      ...(opciones.baseURL ? { baseURL: opciones.baseURL } : {}),
    })
  }

  async enviar(mensajes: Mensaje[], herramientas: HerramientaSpec[]): Promise<RespuestaLlm> {
    const respuesta = await this.cliente.chat.completions.create({
      model: this.opciones.modelo,
      temperature: 0,
      messages: mensajes.map(aMensajeOpenAi),
      ...(herramientas.length ? { tools: herramientas.map(aHerramientaOpenAi), parallel_tool_calls: false } : {}),
    })
    const mensaje = respuesta.choices[0]?.message
    const llamadas: LlamadaHerramienta[] = (mensaje?.tool_calls ?? []).flatMap((t) =>
      t.type === "function" ? [{ id: t.id, nombre: t.function.name, args: parsearArgumentos(t.function.arguments) }] : [],
    )
    return { texto: mensaje?.content ?? null, llamadas, uso: { tokens: respuesta.usage?.total_tokens ?? 0 } }
  }
}

/** Se usa cuando falta la clave: la app arranca y el chat explica qué configurar. */
export class LlmNoConfigurado implements LlmAdapter {
  async enviar(): Promise<RespuestaLlm> {
    throw new Error("El modelo de lenguaje no está configurado: define OPENAI_API_KEY en el backend.")
  }
}
