export type Decision = "aprobar" | "rechazar"

export type ToolCall = { nombre: string; args: unknown; resultado: string; ok: boolean; ms: number }

export type Pendiente = { caso: string; codigos: string[] }

export type RespuestaChat = {
  reply: string
  toolCalls: ToolCall[]
  needsConfirmation: boolean
  pendiente: Pendiente | null
  estado: string
}

export type MensajeChat =
  | { id: string; rol: "user"; texto: string }
  | { id: string; rol: "assistant"; texto: string; toolCalls: ToolCall[]; pideConfirmacion: boolean; duracionMs?: number }
  | { id: string; rol: "error"; texto: string }

export type Salud = { ok: boolean; provider: string; model: string }
