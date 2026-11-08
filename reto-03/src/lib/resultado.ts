export type Exito<T> = { ok: true; data: T }
export type Fallo = { ok: false; error: string }
export type Resultado<T> = Exito<T> | Fallo

export const ok = <T>(data: T): Exito<T> => ({ ok: true, data })
export const fallo = (error: string): Fallo => ({ ok: false, error })

export function mensajeDeError(e: unknown): string {
  return e instanceof Error ? e.message : String(e)
}
