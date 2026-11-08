// Verificación obligatoria del Reto 03: `bun run verify`. Sale con código 1 si algún paso falla.
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs"
import path from "node:path"
import { archivosModulo } from "./empaquetar-modulo"

const RAIZ = path.resolve(import.meta.dir, "..")
const BUN = process.execPath
const CASOS = ["sol-001", "sol-002", "sol-003", "sol-004", "sol-005", "sol-006"]

type Paso = { nombre: string; ok: boolean; detalle: string }
const pasos: Paso[] = []

function correr(cmd: string[]): { codigo: number; salida: string } {
  const r = Bun.spawnSync(cmd, { cwd: RAIZ, stdout: "pipe", stderr: "pipe", env: process.env })
  return { codigo: r.exitCode ?? 1, salida: `${r.stdout.toString()}${r.stderr.toString()}` }
}

function registrar(nombre: string, ok: boolean, detalle = ""): void {
  pasos.push({ nombre, ok, detalle })
  console.log(`${ok ? "OK  " : "FAIL"} ${nombre}`)
  if (!ok && detalle) console.log(detalle.trim().split(/\r?\n/).slice(-40).join("\n"))
}

function sinTiempos(salida: string): string {
  return salida
    .replace(/\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?(Z|[+-]\d{2}:\d{2})?/g, "<ts>")
    .replace(/\b\d+(\.\d+)?\s?ms\b/g, "<ms>")
}

function archivos(dir: string, extensiones: string[]): string[] {
  const abs = path.join(RAIZ, dir)
  if (!existsSync(abs)) return []
  if (statSync(abs).isFile()) return [abs]
  return readdirSync(abs, { recursive: true, encoding: "utf8" })
    .map((r) => path.join(abs, r))
    .filter((f) => !f.includes("node_modules") && statSync(f).isFile())
    .filter((f) => extensiones.length === 0 || extensiones.some((e) => f.endsWith(e)))
}

function verificarTipos(): void {
  const r = correr([BUN, "--bun", "x", "tsc", "--noEmit"])
  registrar("tipos (tsc --noEmit)", r.codigo === 0, r.salida)
}

function verificarTests(): void {
  const r = correr([BUN, "test"])
  registrar("tests (bun test)", r.codigo === 0, r.salida)
}

function verificarDemo(): void {
  if (!existsSync(path.join(RAIZ, "demo.ts"))) {
    registrar("demo.ts determinista", false, "Falta demo.ts (entregable obligatorio, PRD 6.6).")
    return
  }
  const a = correr([BUN, "run", "demo.ts"])
  const b = correr([BUN, "run", "demo.ts"])
  const problemas: string[] = []
  if (a.codigo !== 0 || b.codigo !== 0) problemas.push(`demo.ts terminó con código ${a.codigo}/${b.codigo}\n${a.salida}`)
  if (sinTiempos(a.salida) !== sinTiempos(b.salida)) problemas.push("Dos ejecuciones consecutivas producen salidas distintas.")
  const faltan = CASOS.filter((c) => !a.salida.includes(c))
  if (faltan.length > 0) problemas.push(`La salida no menciona: ${faltan.join(", ")}`)
  if (!a.salida.includes("4500000001")) problemas.push("La salida no muestra la OC 4500000001 de sol-001.")
  registrar("demo.ts determinista", problemas.length === 0, problemas.join("\n"))
}

function verificarSecretos(): void {
  const patrones = [/sk-ant-[A-Za-z0-9_-]{10,}/, /sk-(proj-)?[A-Za-z0-9]{20,}/, /AIza[0-9A-Za-z_-]{30,}/]
  const valores = Object.entries(process.env)
    .filter(([k, v]) => /(_API_KEY|_SECRET|_TOKEN)$/.test(k) && typeof v === "string" && v.length >= 8)
    .map(([, v]) => v as string)
  const objetivos = ["src", "web", "agent", "modulo", "out", "demo.ts", "README.md", "SOLUCION.md", ".env.example"]
  const hallazgos: string[] = []
  for (const f of objetivos.flatMap((d) => archivos(d, []))) {
    if (f.includes(`${path.sep}dist${path.sep}`) && f.endsWith(".map")) continue
    const contenido = readFileSync(f, "utf8")
    if (patrones.some((p) => p.test(contenido)) || valores.some((v) => contenido.includes(v))) {
      hallazgos.push(path.relative(RAIZ, f))
    }
  }
  registrar("sin secretos en código, front ni out/", hallazgos.length === 0, `Posible clave en: ${hallazgos.join(", ")}`)
}

function verificarCodigo(): void {
  const problemas: string[] = []
  for (const f of [...archivos("src", [".ts", ".tsx"]), ...archivos("modulo", [".ts"])]) {
    const rel = path.relative(RAIZ, f)
    const contenido = readFileSync(f, "utf8")
    if (/(:\s*any\b|\bas\s+any\b|<any>)/.test(contenido)) problemas.push(`${rel}: usa any`)
    const esHerramienta = rel.split(path.sep).includes("tools")
    if (esHerramienta && /(child_process|Bun\.spawn|Bun\.\$|\bexecSync\b)/.test(contenido)) {
      problemas.push(`${rel}: las herramientas no pueden ejecutar shell`)
    }
  }
  registrar("sin any y herramientas sin shell", problemas.length === 0, problemas.join("\n"))
}

function verificarModulo(): void {
  const divergentes = Object.entries(archivosModulo(RAIZ))
    .filter(([relativa, esperado]) => {
      const abs = path.join(RAIZ, relativa)
      return !existsSync(abs) || readFileSync(abs, "utf8").replace(/\r\n/g, "\n") !== esperado
    })
    .map(([relativa]) => relativa)
  registrar(
    "modulo/ sincronizado con la app",
    divergentes.length === 0,
    `Desactualizado: ${divergentes.join(", ")}. Ejecuta \`bun run modulo\`.`,
  )
}

verificarTipos()
verificarTests()
verificarDemo()
verificarSecretos()
verificarCodigo()
verificarModulo()

const fallidos = pasos.filter((p) => !p.ok)
console.log(`\n${pasos.length - fallidos.length}/${pasos.length} pasos en verde`)
process.exit(fallidos.length === 0 ? 0 : 1)
