import type { HerramientaSpec, LlmAdapter, Mensaje, RespuestaLlm } from "../../src/llm/adapter"

type Paso = RespuestaLlm | Error

/** LLM guionado para tests: devuelve los pasos en orden y repite el último si el loop pide más. */
export class FakeLlm implements LlmAdapter {
  invocaciones = 0
  herramientasVistas: string[] = []
  ultimosMensajes: Mensaje[] = []

  constructor(private readonly guion: Paso[]) {}

  async enviar(mensajes: Mensaje[], herramientas: HerramientaSpec[]): Promise<RespuestaLlm> {
    const paso = this.guion[Math.min(this.invocaciones, this.guion.length - 1)]
    this.invocaciones++
    this.herramientasVistas = herramientas.map((h) => h.nombre)
    this.ultimosMensajes = mensajes
    if (!paso) throw new Error("FakeLlm sin guion")
    if (paso instanceof Error) throw paso
    return paso
  }
}

let secuencia = 0

export function llamada(nombre: string, args: unknown, tokens = 10): RespuestaLlm {
  secuencia++
  return { texto: null, llamadas: [{ id: `call-${secuencia}`, nombre, args }], uso: { tokens } }
}

export function texto(contenido: string, tokens = 10): RespuestaLlm {
  return { texto: contenido, llamadas: [], uso: { tokens } }
}
