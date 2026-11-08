// Genera `modulo/` (PRD 9.4) desde las mismas fuentes que usa la app.
// `bun run modulo` escribe los archivos; `verify` usa `archivosModulo` para detectar divergencias.
import { mkdirSync, readFileSync, writeFileSync } from "node:fs"
import path from "node:path"

const RAIZ = path.resolve(import.meta.dir, "..")
const AVISO = "<!-- Generado por scripts/empaquetar-modulo.ts. No editar a mano: edita la fuente y ejecuta `bun run modulo`. -->"

function leer(raiz: string, relativa: string): string {
  return readFileSync(path.join(raiz, relativa), "utf8").replace(/\r\n/g, "\n").trim()
}

export function archivosModulo(raiz: string = RAIZ): Record<string, string> {
  const agente = [
    "---",
    "description: Prepara y crea órdenes de compra en SAP a partir del paquete de la solicitud (solicitud, cotización, aprobación), aplicando las reglas RC1-RC10 y pidiendo confirmación humana ante excepciones.",
    "mode: primary",
    "permission:",
    "  edit: deny",
    "  bash: deny",
    "---",
    AVISO,
    "",
    leer(raiz, "agent/prompt.md"),
    "",
  ].join("\n")

  const skill = [
    "---",
    "name: ordenes-compra",
    "description: Conocimiento del proceso de órdenes de compra de Periferia IT Group - reglas de control RC1-RC10, qué solicitar ante cada problema, OCs retroactivas y datos SAP. Úsala al validar o crear una OC.",
    "---",
    AVISO,
    "",
    leer(raiz, "src/knowledge/ordenes-compra.md"),
    "",
  ].join("\n")

  const herramientas = [
    "// Generado por scripts/empaquetar-modulo.ts. Reexporta las herramientas de la app para que no existan copias divergentes.",
    "// Cada herramienta: { description, args (zod), execute(args, ctx) } con ctx.directory = raíz que contiene fixtures/.",
    'export * from "../../src/tools/oc"',
    "",
  ].join("\n")

  return {
    "modulo/agent.md": agente,
    "modulo/skill/ordenes-compra/SKILL.md": skill,
    "modulo/tools/oc.ts": herramientas,
  }
}

if (import.meta.main) {
  for (const [relativa, contenido] of Object.entries(archivosModulo())) {
    const destino = path.join(RAIZ, relativa)
    mkdirSync(path.dirname(destino), { recursive: true })
    writeFileSync(destino, contenido, "utf8")
    console.log(`escrito ${relativa}`)
  }
}
