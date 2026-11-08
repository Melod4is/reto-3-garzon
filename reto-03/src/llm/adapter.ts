export type LlamadaHerramienta = { id: string; nombre: string; args: unknown }

export type Mensaje =
  | { rol: "system"; contenido: string }
  | { rol: "user"; contenido: string }
  | { rol: "assistant"; contenido: string | null; llamadas?: LlamadaHerramienta[] }
  | { rol: "tool"; contenido: string; llamadaId: string; nombre: string }

/** Herramienta expuesta al modelo; `parametros` es JSON Schema generado desde zod. */
export type HerramientaSpec = { nombre: string; descripcion: string; parametros: Record<string, unknown> }

export type RespuestaLlm = { texto: string | null; llamadas: LlamadaHerramienta[]; uso?: { tokens: number } }

/** Única dependencia del ciclo del agente con el proveedor. Cambiar de proveedor = otra implementación. */
export interface LlmAdapter {
  enviar(mensajes: Mensaje[], herramientas: HerramientaSpec[]): Promise<RespuestaLlm>
}
