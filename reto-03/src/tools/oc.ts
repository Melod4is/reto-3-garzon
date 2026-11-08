import { mkdir, writeFile } from "node:fs/promises"
import path from "node:path"
import { z } from "zod"
import { registrarControl } from "../lib/control"
import { DerivadosSchema, OrdenCompraSchema, type Paquete } from "../lib/esquemas"
import { escribirEvidencia, hashEvidencia } from "../lib/evidencia"
import { type Maestros, cargarMaestros } from "../lib/maestros"
import { leerPaquete, resolverPaquete } from "../lib/paquete"
import { construirOrden } from "../lib/payload"
import { type Validacion, validarPaquete } from "../lib/reglas"
import { type Resultado, fallo, ok } from "../lib/resultado"
import { dirSalida, rutaVisible } from "../lib/rutas"
import { SapMock } from "../sap/mock"
import { type Ctx, type FalloConfirmacion, definirHerramienta } from "./definir"

const CONFIRMADO_POR = "analista (confirmación en chat)"

const argCaso = z.string().describe("Nombre de la carpeta del caso en fixtures/reto-03/solicitudes/, por ejemplo sol-001")
const argPaquete = z
  .record(z.string(), z.unknown())
  .optional()
  .describe("Paquete devuelto por oc_leer_paquete. Opcional: si se omite se relee de los documentos del caso")

type CasoValidado = { paquete: Paquete; maestros: Maestros; validacion: Validacion }

async function validarCaso(ctx: Ctx, caso: string, recibido?: unknown): Promise<Resultado<CasoValidado>> {
  const paquete = await resolverPaquete(ctx.directory, caso, recibido)
  if (!paquete.ok) return paquete
  const maestros = await cargarMaestros(ctx.directory)
  return ok({ paquete: paquete.data, maestros, validacion: validarPaquete(paquete.data, maestros) })
}

const codigos = (hs: { codigo: string }[]): string[] => hs.map((h) => h.codigo)

const resumirHallazgos = (hs: { codigo: string; detalle: string; accion_sugerida: string }[]): string =>
  hs.map((h) => `${h.codigo}: ${h.detalle} Acción sugerida: ${h.accion_sugerida}`).join(" | ")

export const leer_paquete = definirHerramienta({
  description: "Lee y normaliza el paquete de un caso (correo, solicitud, cotización, aprobación y factura); los adjuntos ausentes llegan como null en faltantes.",
  args: { caso: argCaso },
  ejecutar: ({ caso }, ctx) => leerPaquete(ctx.directory, caso),
})

export const validar = definirHerramienta({
  description: "Aplica las reglas de control RC1-RC10 a un caso y devuelve apta, bloqueos, confirmaciones, derivados de maestros y si es retroactiva.",
  args: { caso: argCaso, paquete: argPaquete },
  async ejecutar({ caso, paquete }, ctx) {
    const r = await validarCaso(ctx, caso, paquete)
    return r.ok ? ok(r.data.validacion) : r
  },
})

export const generar_evidencia = definirHerramienta({
  description: "Genera la evidencia de aprobación del caso (aprobacion.txt y aprobacion.pdf) y devuelve su ruta y sha256.",
  args: { caso: argCaso },
  async ejecutar({ caso }, ctx) {
    const p = await leerPaquete(ctx.directory, caso)
    if (!p.ok) return p
    if (!p.data.aprobacion) return fallo("No hay correo de aprobación para generar la evidencia (RC2). Pídelo al solicitante.")
    const e = await escribirEvidencia(dirSalida(ctx.directory), caso, p.data.aprobacion)
    const { de, para, fecha, aprobado } = p.data.aprobacion
    return ok({
      ruta: rutaVisible(ctx.directory, e.txt),
      ruta_pdf: rutaVisible(ctx.directory, e.pdf),
      sha256: e.sha256,
      aprobado_por: de,
      solicitado_a: para,
      fecha,
      aprobado,
    })
  },
})

export const construir_payload = definirHerramienta({
  description: "Construye la orden de compra tal como quedaría en SAP, con la trazabilidad de cada valor, sin crearla.",
  args: {
    caso: argCaso,
    paquete: argPaquete,
    derivados: DerivadosSchema.optional().describe("Derivados devueltos por oc_validar. Opcional: se recalculan desde maestros"),
  },
  async ejecutar({ caso, paquete }, ctx) {
    const c = await validarCaso(ctx, caso, paquete)
    if (!c.ok) return c
    const { validacion, maestros } = c.data
    const aprobacion = c.data.paquete.aprobacion
    const sha = aprobacion ? hashEvidencia(aprobacion) : ""
    const r = construirOrden(c.data.paquete, validacion, maestros, sha, null)
    if (!r.ok) return r
    const dir = path.join(dirSalida(ctx.directory), caso)
    await mkdir(dir, { recursive: true })
    const archivo = path.join(dir, "trazabilidad.json")
    await writeFile(archivo, JSON.stringify(r.data.trazabilidad, null, 2), "utf8")
    const fuentes = Object.fromEntries(
      r.data.trazabilidad.map((t) => [t.campo, t.nota ? `${t.fuente} (${t.nota})` : t.fuente]),
    )
    return ok({
      orden: r.data.orden,
      trazabilidad: rutaVisible(ctx.directory, archivo),
      fuentes,
      apta: validacion.apta,
      bloqueos: codigos(validacion.bloqueos),
      confirmaciones: codigos(validacion.confirmaciones),
    })
  },
})

type Creacion = { numero_oc: string; fecha: string | null; idempotente: boolean }

export const crear = definirHerramienta({
  description: "Crea la orden de compra en SAP si el caso no tiene bloqueos y, cuando hay confirmaciones, solo con confirmado=true tras la aprobación explícita del usuario.",
  args: {
    caso: argCaso,
    payload: z
      .record(z.string(), z.unknown())
      .optional()
      .describe("Orden devuelta por oc_construir_payload. Informativa: la OC se reconstruye desde los documentos del caso"),
    confirmado: z.boolean().optional().describe("true solo si el usuario confirmó explícitamente las excepciones en su último mensaje"),
  },
  async ejecutar({ caso, confirmado }, ctx): Promise<Resultado<Creacion> | FalloConfirmacion> {
    const dirOut = dirSalida(ctx.directory)
    const c = await validarCaso(ctx, caso)
    if (!c.ok) {
      await registrarControl(dirOut, { solicitud_id: caso, resultado: "bloqueado", numero_oc: null, retroactiva: false, bloqueos: ["PAQUETE"], confirmaciones: [] })
      return c
    }
    const { paquete, maestros, validacion } = c.data
    const fila = {
      solicitud_id: paquete.solicitud.solicitud_id,
      retroactiva: validacion.retroactiva,
      bloqueos: codigos(validacion.bloqueos),
      confirmaciones: codigos(validacion.confirmaciones),
    }
    const sap = new SapMock(dirOut, maestros.proveedores)

    const existente = await sap.buscarOrdenPorReferencia(fila.solicitud_id)
    if (existente) {
      await registrarControl(dirOut, { ...fila, resultado: "creada", numero_oc: existente.numero_oc })
      return ok({ numero_oc: existente.numero_oc, fecha: existente.fecha, idempotente: true })
    }

    if (!validacion.apta) {
      await registrarControl(dirOut, { ...fila, resultado: "bloqueado", numero_oc: null })
      return fallo(`No se puede crear la OC: ${resumirHallazgos(validacion.bloqueos)}`)
    }

    const requiereConfirmacion = validacion.confirmaciones.length > 0
    if (requiereConfirmacion && confirmado !== true) {
      await registrarControl(dirOut, { ...fila, resultado: "pendiente", numero_oc: null })
      return {
        ok: false,
        error: `La OC requiere confirmación humana: ${resumirHallazgos(validacion.confirmaciones)} Pregunta al usuario y vuelve a llamar con confirmado=true solo si confirma.`,
        requiere_confirmacion: { caso, codigos: fila.confirmaciones },
      }
    }

    if (!paquete.aprobacion) return fallo("Falta el correo de aprobación (RC2).")
    const evidencia = await escribirEvidencia(dirOut, caso, paquete.aprobacion)
    const r = construirOrden(paquete, validacion, maestros, evidencia.sha256, requiereConfirmacion ? CONFIRMADO_POR : null)
    if (!r.ok) return r
    const orden = OrdenCompraSchema.parse(r.data.orden)
    const creada = await sap.crearOrden(orden)
    await registrarControl(dirOut, { ...fila, resultado: "creada", numero_oc: creada.numero_oc })
    return ok({ ...creada, idempotente: false })
  },
})
