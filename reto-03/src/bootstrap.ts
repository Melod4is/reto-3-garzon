import { leerConfig } from "./config"
import { LlmNoConfigurado, OpenAiLlm } from "./llm/openai"
import { crearApp } from "./server"

/** Composición de producción: lee el entorno, elige el adaptador LLM y crea la app. */
export function crearAppDesdeEnv() {
  const config = leerConfig()
  const llm = config.apiKey
    ? new OpenAiLlm({ apiKey: config.apiKey, modelo: config.modelo, baseURL: config.baseURL, timeoutMs: config.timeoutMs })
    : new LlmNoConfigurado()
  if (!config.apiKey) console.warn("OPENAI_API_KEY no está definida: el chat responderá con un aviso de configuración.")
  if (process.env.VERCEL && !process.env.SESSION_SECRET) {
    console.warn("SESSION_SECRET no está definida: la sesión no sobrevivirá a un cambio de instancia serverless.")
  }
  return crearApp({ llm, directory: config.raiz, proveedor: config.proveedor, modelo: config.modelo })
}
