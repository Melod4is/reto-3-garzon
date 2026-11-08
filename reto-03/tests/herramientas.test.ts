import { afterEach, beforeEach, describe, expect, test } from "bun:test"
import { rm, writeFile } from "node:fs/promises"
import { z } from "zod"
import * as oc from "../src/tools/oc"
import { codigos, crearEntorno, datos, ejecutar, rutaCaso, type HerramientaLaxa, type PaqueteLeido, type Validacion } from "./helpers"

const REQUERIDAS = ["leer_paquete", "validar", "construir_payload", "generar_evidencia", "crear"] as const
const modulo: Record<string, unknown> = { ...oc }

let ctx: Awaited<ReturnType<typeof crearEntorno>>
beforeEach(async () => { ctx = await crearEntorno() })
afterEach(() => ctx.limpiar())

describe("contrato de herramientas (PRD 6.2)", () => {
  test.each(REQUERIDAS)("%s: description de una frase, args zod con .describe() y execute", (nombre) => {
    const h = modulo[nombre] as { description: unknown; args: Record<string, unknown>; execute: unknown }
    expect(typeof h.description).toBe("string")
    expect((h.description as string).length).toBeGreaterThan(10)
    expect(h.description as string).not.toContain("\n")
    expect(typeof h.execute).toBe("function")
    for (const [campo, esquema] of Object.entries(h.args)) {
      expect(esquema, campo).toBeInstanceOf(z.ZodType)
      expect((esquema as z.ZodType).description, `${nombre}.${campo} sin .describe()`).toBeTruthy()
    }
    expect(() => z.toJSONSchema(z.object(h.args as z.ZodRawShape))).not.toThrow()
  })

  test.each(REQUERIDAS)("%s: nunca lanza con argumentos basura", async (nombre) => {
    const h = modulo[nombre] as HerramientaLaxa
    const r = await ejecutar(h, {}, ctx)
    expect(r.ok).toBe(false)
  })
})

describe("HU-1 leer paquete", () => {
  test("sol-001 normalizado", async () => {
    const p = datos(await ejecutar<PaqueteLeido>(oc.leer_paquete, { caso: "sol-001" }, ctx))
    expect(p.correo.id).toBe("sol-001-correo")
    expect(p.solicitud.solicitud_id).toBe("SOL-2026-001")
    expect(p.cotizacion).toMatchObject({ nit: "900555111", total: 11_400_000, moneda: "COP" })
    expect(p.aprobacion?.aprobado).toBe(true)
    expect(p.factura).toBeNull()
    expect(p.faltantes).toEqual([])
  })

  test("sol-005 incluye la factura", async () => {
    const p = datos(await ejecutar<PaqueteLeido>(oc.leer_paquete, { caso: "sol-005" }, ctx))
    expect(p.factura).toEqual({ numero: "FC-88231", fecha: "2026-08-10", total: 3_200_000 })
  })

  test("adjunto ausente → null + faltantes, sin excepción; validar pide RC5", async () => {
    await rm(rutaCaso(ctx, "sol-001", "cotizacion.txt"))
    const p = datos(await ejecutar<PaqueteLeido>(oc.leer_paquete, { caso: "sol-001" }, ctx))
    expect(p.cotizacion).toBeNull()
    expect(p.faltantes.join(" ")).toContain("cotizacion")
    const v = datos(await ejecutar<Validacion>(oc.validar, { caso: "sol-001", paquete: p }, ctx))
    expect(codigos(v.confirmaciones)).toContain("RC5")
  })
})

describe("HU-6 errores legibles", () => {
  test("caso inexistente", async () => {
    const r = await ejecutar(oc.leer_paquete, { caso: "sol-999" }, ctx)
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.error.length).toBeGreaterThan(0)
  })

  test("ruta fuera de fixtures se rechaza", async () => {
    const r = await ejecutar(oc.leer_paquete, { caso: "../../maestros" }, ctx)
    expect(r.ok).toBe(false)
  })

  test("JSON malformado", async () => {
    await writeFile(rutaCaso(ctx, "sol-001", "solicitud.json"), "{ roto")
    const r = await ejecutar(oc.leer_paquete, { caso: "sol-001" }, ctx)
    expect(r.ok).toBe(false)
  })

  test("monto no numérico", async () => {
    const ruta = rutaCaso(ctx, "sol-001", "solicitud.json")
    const solicitud = JSON.parse(await Bun.file(ruta).text()) as Record<string, unknown>
    await writeFile(ruta, JSON.stringify({ ...solicitud, valor_total: "doce millones" }))
    const leido = await ejecutar<PaqueteLeido>(oc.leer_paquete, { caso: "sol-001" }, ctx)
    const r = leido.ok ? await ejecutar(oc.validar, { caso: "sol-001", paquete: leido.data }, ctx) : leido
    expect(r.ok).toBe(false)
  })
})
