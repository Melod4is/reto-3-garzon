import { afterEach, beforeEach, describe, expect, test } from "bun:test"
import { existsSync } from "node:fs"
import { readFile } from "node:fs/promises"
import path from "node:path"
import { OrdenCompraSchema } from "../src/lib/esquemas"
import * as oc from "../src/tools/oc"
import { codigos, crearEntorno, datos, ejecutar, leerControl, leerOrdenes, procesar } from "./helpers"

let ctx: Awaited<ReturnType<typeof crearEntorno>>
beforeEach(async () => { ctx = await crearEntorno() })
afterEach(() => ctx.limpiar())

describe("O1 flujo normal", () => {
  test("sol-001 crea la OC 4500000001 sin intervención", async () => {
    const r = await procesar(ctx, "sol-001")
    expect(r.validacion.apta).toBe(true)
    expect(datos(r.creacion)).toMatchObject({ numero_oc: "4500000001", idempotente: false })
    const { filas } = await leerControl(ctx)
    expect(filas.at(-1)).toMatchObject({ solicitud_id: "SOL-2026-001", resultado: "creada", numero_oc: "4500000001" })
  })

  test("idempotencia: dos veces sol-001 devuelve el mismo número", async () => {
    const primera = datos((await procesar(ctx, "sol-001")).creacion)
    const segunda = datos((await procesar(ctx, "sol-001")).creacion)
    expect(segunda.numero_oc).toBe(primera.numero_oc)
    expect(segunda.idempotente).toBe(true)
    const ordenes = await leerOrdenes(ctx)
    expect(ordenes.filter((o) => o.orden.referencia.solicitud_id === "SOL-2026-001")).toHaveLength(1)
    expect((await leerControl(ctx)).filas).toHaveLength(2)
  })

  test("numeración secuencial entre casos", async () => {
    await procesar(ctx, "sol-001")
    const r = await procesar(ctx, "sol-004", true)
    expect(datos(r.creacion).numero_oc).toBe("4500000002")
  })
})

describe("O2 bloqueos", () => {
  test.each([
    ["sol-002", "RC1"],
    ["sol-003", "RC2"],
  ])("%s se bloquea por %s y no crea OC", async (caso, regla) => {
    const r = await procesar(ctx, caso, true)
    expect(r.validacion.apta).toBe(false)
    expect(codigos(r.validacion.bloqueos)).toContain(regla)
    expect(r.validacion.bloqueos.every((b) => b.accion_sugerida.length > 0)).toBe(true)
    expect(r.creacion.ok).toBe(false)
    expect(await leerOrdenes(ctx)).toHaveLength(0)
    const fila = (await leerControl(ctx)).filas.at(-1)
    expect(fila?.resultado).toBe("bloqueado")
    expect(fila?.bloqueos).toContain(regla)
  })

  test("crear re-valida desde fixtures: un payload válido ajeno no desbloquea sol-002", async () => {
    const ajeno = await procesar(ctx, "sol-001")
    const orden = ajeno.payload.ok ? ajeno.payload.data.orden : undefined
    const r = await ejecutar(oc.crear, { caso: "sol-002", payload: orden, confirmado: true }, ctx)
    expect(r.ok).toBe(false)
    expect(await leerOrdenes(ctx)).toHaveLength(1)
  })
})

describe("O3 confirmaciones", () => {
  test("sol-004: RC5 con ambos valores; pendiente sin confirmar, creada al confirmar", async () => {
    const sin = await procesar(ctx, "sol-004")
    const rc5 = sin.validacion.confirmaciones.find((c) => c.codigo === "RC5")
    expect(rc5?.valores).toMatchObject({ solicitud: 25_000_000, cotizacion: 26_500_000 })
    expect(sin.creacion.ok).toBe(false)
    expect((await leerControl(ctx)).filas.at(-1)?.resultado).toBe("pendiente")
    expect(await leerOrdenes(ctx)).toHaveLength(0)

    const con = await procesar(ctx, "sol-004", true)
    expect(con.creacion.ok).toBe(true)
    expect((await leerControl(ctx)).filas.at(-1)?.resultado).toBe("creada")
  })

  test("sol-006: RC6 y derivados IVA C1 / pago Z030 llegan al payload", async () => {
    const r = await procesar(ctx, "sol-006")
    expect(codigos(r.validacion.confirmaciones)).toContain("RC6")
    expect(r.validacion.derivados.indicador_iva?.valor).toBe("C1")
    expect(r.validacion.derivados.condiciones_pago?.valor).toBe("Z030")
    const orden = datos(r.payload).orden
    expect(orden.condiciones_pago).toBe("Z030")
    expect(orden.posiciones[0]?.indicador_iva).toBe("C1")
    expect(r.creacion.ok).toBe(false)
    expect((await procesar(ctx, "sol-006", true)).creacion.ok).toBe(true)
  })
})

describe("O4 retroactivas", () => {
  test("sol-005 se marca retroactiva y queda en control al confirmarse", async () => {
    const sin = await procesar(ctx, "sol-005")
    expect(sin.validacion.retroactiva).toBe(true)
    expect(codigos(sin.validacion.confirmaciones)).toContain("RC8")
    expect(sin.creacion.ok).toBe(false)

    const con = await procesar(ctx, "sol-005", true)
    expect(con.creacion.ok).toBe(true)
    const fila = (await leerControl(ctx)).filas.at(-1)
    expect(fila).toMatchObject({ solicitud_id: "SOL-2026-005", resultado: "creada", retroactiva: "true" })
  })
})

describe("HU-3 payload y trazabilidad", () => {
  test("sol-001 cumple el esquema zod y las restricciones SAP", async () => {
    const { orden } = datos((await procesar(ctx, "sol-001")).payload)
    expect(OrdenCompraSchema.safeParse(orden).success).toBe(true)
    expect(orden).toMatchObject({ sociedad: "1000", organizacion_compras: "1000", moneda: "COP" })
    expect(orden.proveedor.codigo_sap).toBe("100234")
    expect(orden.posiciones[0]).toMatchObject({ numero: 10, unidad: "UN", centro_costo: "CC-1010", subarea: "Infraestructura" })
    expect(orden.posiciones.every((p) => p.descripcion.length <= 40)).toBe(true)
  })

  test("sol-004 es por horas → unidad H", async () => {
    const { orden } = datos((await procesar(ctx, "sol-004")).payload)
    expect(orden.posiciones[0]?.unidad).toBe("H")
  })

  test("cada valor es trazable a una fuente válida", async () => {
    const { trazabilidad } = datos((await procesar(ctx, "sol-006")).payload)
    const ruta = path.join(ctx.directory, trazabilidad)
    expect(existsSync(ruta)).toBe(true)
    const entradas = JSON.parse(await readFile(ruta, "utf8")) as { campo: string; fuente: string }[]
    expect(entradas.length).toBeGreaterThan(0)
    for (const e of entradas) expect(e.fuente).toMatch(/^(solicitud|cotizacion|derivado|maestro\.[a-z-]+)$/)
  })

  test("el resultado expone al modelo la fuente real de cada campo", async () => {
    const { fuentes } = datos((await procesar(ctx, "sol-004")).payload)
    expect(fuentes["posiciones[0].indicador_iva"]).toBe("solicitud")
    expect(fuentes.condiciones_pago).toBe("solicitud")
    expect(fuentes["proveedor.codigo_sap"]).toBe("maestro.proveedores")
    const deSol006 = datos((await procesar(ctx, "sol-006")).payload).fuentes
    expect(deSol006["posiciones[0].indicador_iva"]).toMatch(/^maestro\./)
  })
})

describe("HU-4 evidencia de aprobación", () => {
  test("aprobacion.txt con encabezados y el mismo sha256 del payload", async () => {
    const r = await procesar(ctx, "sol-001")
    const evidencia = datos(r.evidencia)
    expect(evidencia.sha256).toMatch(/^[a-f0-9]{64}$/)
    const contenido = await readFile(path.join(ctx.directory, evidencia.ruta), "utf8")
    for (const dato of ["mlopez@periferia-ficticia.com", "juan.camargo@periferia-ficticia.com", "2026-08-21", "SOL-001", "Aprobado"]) {
      expect(contenido).toContain(dato)
    }
    expect(datos(r.payload).orden.aprobador.evidencia_sha256).toBe(evidencia.sha256)
  })

  test("el resultado expone al modelo quién aprobó y cuándo", async () => {
    const r = await ejecutar<{ aprobado_por: string; fecha: string; aprobado: boolean }>(oc.generar_evidencia, { caso: "sol-001" }, ctx)
    expect(datos(r)).toMatchObject({ aprobado_por: "mlopez@periferia-ficticia.com", aprobado: true })
    expect(datos(r).fecha).toContain("2026-08-21")
  })
})

describe("HU-5 log de control", () => {
  test("encabezado exacto y una fila por intento", async () => {
    for (const caso of ["sol-001", "sol-002", "sol-004"]) await procesar(ctx, caso)
    const { encabezado, filas } = await leerControl(ctx)
    expect(encabezado).toBe("solicitud_id,resultado,numero_oc,retroactiva,bloqueos,confirmaciones,ts")
    expect(filas.map((f) => f.resultado)).toEqual(["creada", "bloqueado", "pendiente"])
  })
})

test("hash de evidencia es determinista", async () => {
  const a = datos((await procesar(ctx, "sol-001")).evidencia).sha256
  const b = datos(await ejecutar<{ sha256: string }>(oc.generar_evidencia, { caso: "sol-001" }, ctx)).sha256
  expect(a).toBe(b)
})
