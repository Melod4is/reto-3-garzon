import { afterEach, beforeEach, describe, expect, test } from "bun:test"
import { existsSync } from "node:fs"
import { readFile } from "node:fs/promises"
import path from "node:path"
import { ejecutarTurno } from "../src/agent/loop"
import { construirRegistro } from "../src/agent/registro"
import { crearSesion } from "../src/agent/sesion"
import * as oc from "../src/tools/oc"
import { FakeLlm, llamada, texto } from "./fakes/fake-llm"
import { crearEntorno, datos, ejecutar, leerOrdenes, type OrdenCompra, type PaqueteLeido, type Validacion } from "./helpers"

const SECRETO = "sk-test-NO-DEBE-SALIR-0123456789"
process.env.LLM_API_KEY = SECRETO

const herramientas = construirRegistro({ oc })
let ctx: Awaited<ReturnType<typeof crearEntorno>>
beforeEach(async () => { ctx = await crearEntorno() })
afterEach(() => ctx.limpiar())

function turno(llm: FakeLlm, sesion: ReturnType<typeof crearSesion>, mensaje: string, extra: { maxIteraciones?: number; maxTokensSesion?: number } = {}) {
  return ejecutarTurno({ llm, herramientas, sesion, mensaje, ctx, maxIteraciones: 25, ...extra })
}

const resultadoDe = (r: { resultado: string }) => JSON.parse(r.resultado) as { ok: boolean }

async function payloadDe(caso: string): Promise<OrdenCompra> {
  const paquete = datos(await ejecutar<PaqueteLeido>(oc.leer_paquete, { caso }, ctx))
  const v = datos(await ejecutar<Validacion>(oc.validar, { caso, paquete }, ctx))
  await ejecutar(oc.generar_evidencia, { caso }, ctx)
  return datos(await ejecutar<{ orden: OrdenCompra }>(oc.construir_payload, { caso, paquete, derivados: v.derivados }, ctx)).orden
}

test("el registro expone las herramientas como oc_<export>", () => {
  for (const n of ["oc_leer_paquete", "oc_validar", "oc_construir_payload", "oc_generar_evidencia", "oc_crear"]) {
    expect(Object.keys(herramientas)).toContain(n)
  }
})

test("CA4: cada tool call queda en la respuesta y en out/log.jsonl sin secretos", async () => {
  const llm = new FakeLlm([llamada("oc_leer_paquete", { caso: "sol-001" }), texto("Paquete leído.")])
  const r = await turno(llm, crearSesion("s-log"), "lee sol-001")
  expect(r.toolCalls).toHaveLength(1)
  expect(r.toolCalls[0]).toMatchObject({ nombre: "oc_leer_paquete", args: { caso: "sol-001" } })
  expect(resultadoDe(r.toolCalls[0]!).ok).toBe(true)
  const log = path.join(ctx.directory, "out", "log.jsonl")
  expect(existsSync(log)).toBe(true)
  const contenido = await readFile(log, "utf8")
  expect(contenido).toContain("oc_leer_paquete")
  expect(contenido).not.toContain(SECRETO)
})

test("CA1: el tope de iteraciones corta el bucle y responde", async () => {
  const llm = new FakeLlm([llamada("oc_leer_paquete", { caso: "sol-001" })])
  const r = await turno(llm, crearSesion("s-tope"), "procesa", { maxIteraciones: 3 })
  expect(llm.invocaciones).toBeLessThanOrEqual(3)
  expect(r.reply.length).toBeGreaterThan(0)
})

describe("CA3: confirmación humana decidida por el código", () => {
  test("confirmado=true del modelo se ignora si no hubo pregunta previa; se respeta tras 'confirmo'", async () => {
    const payload = await payloadDe("sol-004")
    const sesion = crearSesion("s-confirma")

    const t1 = await turno(new FakeLlm([llamada("oc_crear", { caso: "sol-004", payload, confirmado: true }), texto("¿Confirmas la OC?")]), sesion, "procesa sol-004")
    expect(t1.needsConfirmation).toBe(true)
    expect(await leerOrdenes(ctx)).toHaveLength(0)

    const t2 = await turno(new FakeLlm([llamada("oc_crear", { caso: "sol-004", payload, confirmado: true }), texto("OC creada.")]), sesion, "confirmo")
    expect(resultadoDe(t2.toolCalls[0]!).ok).toBe(true)
    expect(t2.needsConfirmation).toBe(false)
    expect(await leerOrdenes(ctx)).toHaveLength(1)
  })

  test("el pendiente conserva los códigos RC tras validar y construir el payload", async () => {
    const sesion = crearSesion("s-codigos")
    const guion = [
      llamada("oc_validar", { caso: "sol-004" }),
      llamada("oc_generar_evidencia", { caso: "sol-004" }),
      llamada("oc_construir_payload", { caso: "sol-004" }),
      texto("¿Confirmas?"),
    ]
    const r = await turno(new FakeLlm(guion), sesion, "procesa sol-004")
    expect(r.needsConfirmation).toBe(true)
    expect(sesion.confirmacionPendiente).toEqual({ caso: "sol-004", codigos: ["RC5"] })
  })

  test("una respuesta negativa no confirma", async () => {
    const payload = await payloadDe("sol-004")
    const sesion = crearSesion("s-niega")
    await turno(new FakeLlm([llamada("oc_crear", { caso: "sol-004", payload, confirmado: true }), texto("¿Confirmas?")]), sesion, "procesa sol-004")
    await turno(new FakeLlm([llamada("oc_crear", { caso: "sol-004", payload, confirmado: true }), texto("Listo.")]), sesion, "no, mejor cancela")
    expect(await leerOrdenes(ctx)).toHaveLength(0)
  })
})

describe("CA5 y robustez", () => {
  test("args inválidos y herramienta desconocida vuelven al modelo como error, sin lanzar", async () => {
    const llm = new FakeLlm([llamada("oc_leer_paquete", { caso: 123 }), llamada("shell_exec", { cmd: "dir" }), texto("No pude.")])
    const r = await turno(llm, crearSesion("s-args"), "procesa")
    expect(r.toolCalls.map((t) => resultadoDe(t).ok)).toEqual([false, false])
    expect(r.reply).toBe("No pude.")
  })

  test("error del proveedor LLM se informa y la sesión sigue viva", async () => {
    const sesion = crearSesion("s-error")
    const r1 = await turno(new FakeLlm([new Error("timeout del proveedor")]), sesion, "hola")
    expect(r1.reply.length).toBeGreaterThan(0)
    expect(r1.reply).not.toContain(SECRETO)
    const r2 = await turno(new FakeLlm([texto("Hola de nuevo")]), sesion, "¿sigues ahí?")
    expect(r2.reply).toBe("Hola de nuevo")
  })

  test("tope de tokens por sesión evita llamar al modelo", async () => {
    const sesion = crearSesion("s-tokens")
    await turno(new FakeLlm([texto("ok", 150)]), sesion, "hola", { maxTokensSesion: 100 })
    const llm = new FakeLlm([texto("no debería llamarse")])
    const r = await turno(llm, sesion, "otra", { maxTokensSesion: 100 })
    expect(llm.invocaciones).toBe(0)
    expect(r.reply.length).toBeGreaterThan(0)
  })
})
