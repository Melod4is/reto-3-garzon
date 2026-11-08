// Verificación sin modelo (PRD 6.6): procesa los 6 casos llamando directamente a las herramientas.
// Uso: bun run demo.ts
import { rm } from "node:fs/promises"
import path from "node:path"
import { fileURLToPath } from "node:url"
import { dirSalida } from "./src/lib/rutas"
import type { Validacion } from "./src/lib/reglas"
import type { Ctx } from "./src/tools/definir"
import * as oc from "./src/tools/oc"

type Respuesta<T> = { ok: true; data: T } | { ok: false; error: string }
type Creacion = { numero_oc: string; idempotente: boolean }
type Paso = { caso: string; confirmado?: boolean; titulo?: string }

const ctx: Ctx = { directory: path.dirname(fileURLToPath(import.meta.url)), sessionId: "demo" }

const PASOS: Paso[] = [
  { caso: "sol-001" },
  { caso: "sol-001", titulo: "sol-001 (segunda vez: idempotencia)" },
  { caso: "sol-002" },
  { caso: "sol-003" },
  { caso: "sol-004", titulo: "sol-004 (sin confirmar)" },
  { caso: "sol-004", confirmado: true, titulo: "sol-004 (el usuario confirma: confirmado=true)" },
  { caso: "sol-005" },
  { caso: "sol-006" },
]

const parsear = <T>(salida: string): Respuesta<T> => JSON.parse(salida) as Respuesta<T>

const listar = (hs: { codigo: string; detalle: string }[]): string =>
  hs.length === 0 ? "—" : hs.map((h) => `\n      ${h.codigo}: ${h.detalle}`).join("")

async function procesar({ caso, confirmado, titulo }: Paso): Promise<void> {
  console.log(`\n=== ${titulo ?? caso} ===`)
  const v = parsear<Validacion>(await oc.validar.execute({ caso }, ctx))
  if (!v.ok) {
    console.log(`  error: ${v.error}`)
    return
  }
  const { apta, bloqueos, confirmaciones, derivados, retroactiva } = v.data
  console.log(`  apta: ${apta}`)
  console.log(`  bloqueos: ${listar(bloqueos)}`)
  console.log(`  confirmaciones: ${listar(confirmaciones)}`)
  const lista = Object.entries(derivados).map(([campo, d]) => `${campo}=${d.valor} (${d.fuente})`)
  console.log(`  derivados: ${lista.length ? lista.join(", ") : "—"}`)
  console.log(`  retroactiva: ${retroactiva}`)

  await oc.generar_evidencia.execute({ caso }, ctx)
  await oc.construir_payload.execute({ caso }, ctx)
  const args = confirmado === undefined ? { caso } : { caso, confirmado }
  const c = parsear<Creacion>(await oc.crear.execute(args, ctx))
  console.log(c.ok ? `  OC: ${c.data.numero_oc}${c.data.idempotente ? " (idempotente: ya existía)" : ""}` : `  OC no creada: ${c.error}`)
}

await rm(dirSalida(ctx.directory), { recursive: true, force: true })
for (const paso of PASOS) await procesar(paso)
console.log(`\nSalidas en ${path.relative(ctx.directory, dirSalida(ctx.directory)) || "out"}/ (sap/ordenes.jsonl, control.csv, <caso>/)`)
