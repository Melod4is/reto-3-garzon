import { afterEach, beforeEach, describe, expect, test } from "bun:test"
import { mkdtempSync } from "node:fs"
import { tmpdir } from "node:os"
import path from "node:path"
import { ArchivoSesionStore } from "../src/agent/store"
import { crearApp } from "../src/server"
import { FakeLlm, texto } from "./fakes/fake-llm"
import { crearEntorno } from "./helpers"

const SECRETO = "sk-test-NO-DEBE-SALIR-0123456789"
process.env.LLM_API_KEY = SECRETO

let ctx: Awaited<ReturnType<typeof crearEntorno>>
let app: ReturnType<typeof crearApp>
beforeEach(async () => {
  ctx = await crearEntorno()
  app = crearApp({ llm: new FakeLlm([texto("Hola, soy el agente de OC.")]), directory: ctx.directory, proveedor: "fake", modelo: "fake-1" })
})
afterEach(() => ctx.limpiar())

const pedir = (ruta: string, init?: RequestInit) => Promise.resolve(app.fetch(new Request(`http://local${ruta}`, init)))
const chat = (body: string) => pedir("/api/chat", { method: "POST", headers: { "content-type": "application/json" }, body })

test("GET /api/health informa proveedor y modelo sin exponer la clave", async () => {
  const res = await pedir("/api/health")
  const cuerpo = await res.text()
  expect(res.status).toBe(200)
  expect(JSON.parse(cuerpo)).toMatchObject({ ok: true, provider: "fake", model: "fake-1" })
  expect(cuerpo).not.toContain(SECRETO)
})

test("POST /api/chat responde con el contrato y la sesión queda consultable", async () => {
  const res = await chat(JSON.stringify({ sessionId: "s1", message: "hola" }))
  expect(res.status).toBe(200)
  const r = (await res.json()) as { reply: unknown; toolCalls: unknown; needsConfirmation: unknown }
  expect(typeof r.reply).toBe("string")
  expect(Array.isArray(r.toolCalls)).toBe(true)
  expect(typeof r.needsConfirmation).toBe("boolean")

  const historial = await pedir("/api/sessions/s1")
  expect(historial.status).toBe(200)
  expect(await historial.text()).toContain("hola")
})

describe("estado firmado (serverless sin base de datos)", () => {
  type RespuestaChat = { reply: string; estado: string }
  const nuevoDisco = () => mkdtempSync(path.join(tmpdir(), "instancia-"))
  // Cada "instancia" serverless tiene su propio /tmp; el secreto de firma es compartido.
  const instancia = (llm: FakeLlm, disco = nuevoDisco()) =>
    crearApp({
      llm,
      directory: ctx.directory,
      proveedor: "fake",
      modelo: "fake-1",
      store: new ArchivoSesionStore(disco),
      config: { sessionSecret: "secreto-de-prueba-0123456789abcdef" },
    })
  const enviar = async (a: ReturnType<typeof crearApp>, body: object): Promise<RespuestaChat> => {
    const init = { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) }
    const res = await a.fetch(new Request("http://local/api/chat", init))
    expect(res.status).toBe(200)
    return (await res.json()) as RespuestaChat
  }
  const vistoPorModelo = (fake: FakeLlm): string => JSON.stringify(fake.ultimosMensajes)

  test("una instancia fría reconstruye la conversación desde el token", async () => {
    const primera = await enviar(instancia(new FakeLlm([texto("uno")])), { sessionId: "s2", message: "recuerda sol-004" })
    const fake = new FakeLlm([texto("dos")])
    await enviar(instancia(fake), { sessionId: "s2", message: "¿y ahora?", estado: primera.estado })
    expect(vistoPorModelo(fake)).toContain("recuerda sol-004")
  })

  test("un token alterado se ignora y la sesión arranca limpia", async () => {
    const primera = await enviar(instancia(new FakeLlm([texto("uno")])), { sessionId: "s3", message: "secreto previo" })
    const fake = new FakeLlm([texto("dos")])
    await enviar(instancia(fake), { sessionId: "s3", message: "hola", estado: `${primera.estado}x` })
    expect(vistoPorModelo(fake)).not.toContain("secreto previo")
  })

  test("si otra instancia avanzó la conversación, el token reciente gana sobre la copia local", async () => {
    const discoA = nuevoDisco()
    const t1 = await enviar(instancia(new FakeLlm([texto("respuesta A")]), discoA), { sessionId: "s4", message: "turno 1" })
    const t2 = await enviar(instancia(new FakeLlm([texto("respuesta B")])), { sessionId: "s4", message: "turno 2", estado: t1.estado })
    const fakeA = new FakeLlm([texto("respuesta A2")])
    await enviar(instancia(fakeA, discoA), { sessionId: "s4", message: "turno 3", estado: t2.estado })
    expect(vistoPorModelo(fakeA)).toContain("turno 2")
  })
})

describe("GET /api/evidencia/:caso (descarga del PDF de aprobación)", () => {
  test("devuelve el PDF del caso como adjunto, con el mismo sha256 que la evidencia", async () => {
    const res = await pedir("/api/evidencia/sol-004")
    expect(res.status).toBe(200)
    expect(res.headers.get("content-type")).toBe("application/pdf")
    expect(res.headers.get("content-disposition")).toContain('filename="aprobacion-sol-004.pdf"')
    expect(res.headers.get("x-evidencia-sha256")).toMatch(/^[a-f0-9]{64}$/)
    const bytes = new Uint8Array(await res.arrayBuffer())
    expect(new TextDecoder().decode(bytes.slice(0, 5))).toBe("%PDF-")
  })

  test("el PDF es determinista: dos descargas dan los mismos bytes", async () => {
    const a = new Uint8Array(await (await pedir("/api/evidencia/sol-001")).arrayBuffer())
    const b = new Uint8Array(await (await pedir("/api/evidencia/sol-001")).arrayBuffer())
    expect(Buffer.from(a).equals(Buffer.from(b))).toBe(true)
  })

  test("caso inválido o inexistente responde 4xx con error legible, sin rutas fuera de fixtures", async () => {
    for (const ruta of ["/api/evidencia/sol-999", "/api/evidencia/..%2F..%2Fpackage.json", "/api/evidencia/sol%20001"]) {
      const res = await pedir(ruta)
      expect(res.status).toBeGreaterThanOrEqual(400)
      expect(res.status).toBeLessThan(500)
      expect(await res.json()).toHaveProperty("error")
    }
  })
})

test("body inválido devuelve 4xx legible, no 500", async () => {
  for (const body of ["no-es-json", JSON.stringify({ sessionId: "s1" })]) {
    const res = await chat(body)
    expect(res.status).toBeGreaterThanOrEqual(400)
    expect(res.status).toBeLessThan(500)
    expect(await res.json()).toHaveProperty("error")
  }
})
