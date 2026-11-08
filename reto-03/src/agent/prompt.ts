import { readFileSync } from "node:fs"
import path from "node:path"

const cache = new Map<string, string>()

/** System prompt = comportamiento (`agent/prompt.md`) + conocimiento del proceso (`src/knowledge/`). */
export function cargarSystemPrompt(raiz: string): string {
  const enCache = cache.get(raiz)
  if (enCache) return enCache
  const comportamiento = readFileSync(path.join(raiz, "agent", "prompt.md"), "utf8")
  const conocimiento = readFileSync(path.join(raiz, "src", "knowledge", "ordenes-compra.md"), "utf8")
  const prompt = `${comportamiento.trim()}\n\n---\n\n# Conocimiento del proceso\n\n${conocimiento.trim()}\n`
  cache.set(raiz, prompt)
  return prompt
}
