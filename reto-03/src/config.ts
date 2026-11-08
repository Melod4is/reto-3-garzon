import { randomBytes } from "node:crypto"

export type Config = {
  proveedor: string
  modelo: string
  apiKey: string | null
  baseURL: string | undefined
  timeoutMs: number
  maxIteraciones: number
  maxTokensSesion: number
  maxLongitudMensaje: number
  accessKey: string | null
  sessionSecret: string
  raiz: string
}

const entero = (valor: string | undefined, porDefecto: number): number => {
  const n = Number(valor)
  return Number.isInteger(n) && n > 0 ? n : porDefecto
}

const texto = (valor: string | undefined): string | null => (valor && valor.trim() ? valor.trim() : null)

// Sin SESSION_SECRET el estado firmado solo vale dentro del mismo proceso (suficiente en local).
const secretoEfimero = randomBytes(32).toString("hex")

export function leerConfig(env: NodeJS.ProcessEnv = process.env): Config {
  return {
    proveedor: texto(env.LLM_PROVIDER) ?? "openai",
    modelo: texto(env.LLM_MODEL) ?? "gpt-4.1-mini",
    apiKey: texto(env.OPENAI_API_KEY) ?? texto(env.LLM_API_KEY),
    baseURL: texto(env.LLM_BASE_URL) ?? undefined,
    timeoutMs: entero(env.LLM_TIMEOUT_MS, 30_000),
    maxIteraciones: entero(env.MAX_ITERACIONES, 25),
    maxTokensSesion: entero(env.MAX_TOKENS_SESION, 150_000),
    maxLongitudMensaje: entero(env.MAX_LONGITUD_MENSAJE, 2_000),
    accessKey: texto(env.ACCESS_KEY),
    sessionSecret: texto(env.SESSION_SECRET) ?? secretoEfimero,
    raiz: texto(env.PROJECT_ROOT) ?? process.cwd(),
  }
}
