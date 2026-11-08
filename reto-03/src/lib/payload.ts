import type { OrdenCompra, Paquete } from "./esquemas"
import { type Maestros, buscarProveedor } from "./maestros"
import { fechaLocal } from "./normalizar"
import { type Resultado, fallo, ok } from "./resultado"
import type { Validacion } from "./reglas"

const LIMITE_DESCRIPCION = 40
const SOCIEDAD = "1000"
const ORGANIZACION_COMPRAS = "1000"

type Fuente = "solicitud" | "cotizacion" | "derivado" | `maestro.${string}`

export type EntradaTrazabilidad = { campo: string; valor: string | number | null; fuente: Fuente; nota?: string }

type Unidad = OrdenCompra["posiciones"][number]["unidad"]

/** "H" para servicios por horas, "MES" para mensualidades; por defecto "UN". */
export function inferirUnidad(descripcion: string, cantidad: number, items: string[]): Unidad {
  const cantidadEnTexto = (patron: RegExp): boolean => Number(descripcion.match(patron)?.[1]) === cantidad
  if (items.some((i) => /^horas?\b/i.test(i)) || cantidadEnTexto(/(\d+)\s+horas?\b/i)) return "H"
  if (items.some((i) => /^(mes|mensualidad)\b/i.test(i)) || cantidadEnTexto(/(\d+)\s+mes(es)?\b/i)) return "MES"
  return "UN"
}

function truncar(texto: string): { valor: string; nota?: string } {
  if (texto.length <= LIMITE_DESCRIPCION) return { valor: texto }
  return {
    valor: texto.slice(0, LIMITE_DESCRIPCION).trimEnd(),
    nota: `Truncada de ${texto.length} a ${LIMITE_DESCRIPCION} caracteres (límite SAP de texto breve).`,
  }
}

/** Valor de la solicitud o, si falta, el derivado de maestros. */
function conDerivado(propio: string | undefined, derivado: { valor: string; fuente: string } | undefined) {
  if (propio) return { valor: propio, fuente: "solicitud" as Fuente }
  if (derivado) return { valor: derivado.valor, fuente: derivado.fuente as Fuente }
  return null
}

export type OrdenConTrazabilidad = { orden: OrdenCompra; trazabilidad: EntradaTrazabilidad[] }

export function construirOrden(
  paquete: Paquete,
  validacion: Validacion,
  maestros: Maestros,
  evidenciaSha256: string,
  confirmadoPor: string | null,
): Resultado<OrdenConTrazabilidad> {
  const { solicitud, cotizacion, aprobacion, correo } = paquete
  const proveedor = buscarProveedor(maestros, solicitud.proveedor_nit, solicitud.proveedor_nombre)
  if (!proveedor) return fallo("No se puede construir la OC: el proveedor no existe en el maestro (RC1).")
  if (!aprobacion) return fallo("No se puede construir la OC: falta el correo de aprobación (RC2).")

  const pago = conDerivado(solicitud.condiciones_pago, validacion.derivados.condiciones_pago)
  const iva = conDerivado(solicitud.indicador_iva, validacion.derivados.indicador_iva)
  if (!pago || !iva) return fallo("No se puede construir la OC: faltan condiciones de pago o indicador de IVA.")

  const descripcion = truncar(solicitud.descripcion)
  const unidad = inferirUnidad(solicitud.descripcion, solicitud.cantidad, cotizacion?.items ?? [])

  const orden: OrdenCompra = {
    referencia: { solicitud_id: solicitud.solicitud_id, correo_id: correo.id, cotizacion_ref: cotizacion?.referencia ?? null },
    sociedad: SOCIEDAD,
    organizacion_compras: ORGANIZACION_COMPRAS,
    proveedor: { codigo_sap: proveedor.codigo_sap, nit: proveedor.nit, nombre: proveedor.nombre },
    moneda: solicitud.moneda,
    condiciones_pago: pago.valor,
    aprobador: { email: aprobacion.de, fecha_aprobacion: fechaLocal(aprobacion.fecha), evidencia_sha256: evidenciaSha256 },
    posiciones: [
      {
        numero: 10,
        descripcion: descripcion.valor,
        cantidad: solicitud.cantidad,
        unidad,
        precio_unitario: solicitud.valor_unitario,
        centro_costo: solicitud.centro_costo,
        subarea: solicitud.subarea,
        indicador_iva: iva.valor,
      },
    ],
    excepciones: validacion.confirmaciones.map((c) => ({ codigo: c.codigo, detalle: c.detalle, confirmado_por: confirmadoPor })),
  }

  const trazabilidad: EntradaTrazabilidad[] = [
    { campo: "referencia.solicitud_id", valor: solicitud.solicitud_id, fuente: "solicitud" },
    { campo: "referencia.correo_id", valor: correo.id, fuente: "derivado", nota: "correo.json" },
    { campo: "referencia.cotizacion_ref", valor: orden.referencia.cotizacion_ref, fuente: "cotizacion" },
    { campo: "sociedad", valor: SOCIEDAD, fuente: "derivado", nota: "constante de configuración SAP" },
    { campo: "organizacion_compras", valor: ORGANIZACION_COMPRAS, fuente: "derivado", nota: "constante de configuración SAP" },
    { campo: "proveedor.codigo_sap", valor: proveedor.codigo_sap, fuente: "maestro.proveedores" },
    { campo: "proveedor.nit", valor: proveedor.nit, fuente: "maestro.proveedores" },
    { campo: "proveedor.nombre", valor: proveedor.nombre, fuente: "maestro.proveedores" },
    { campo: "moneda", valor: solicitud.moneda, fuente: "solicitud" },
    { campo: "condiciones_pago", valor: pago.valor, fuente: pago.fuente },
    { campo: "aprobador.email", valor: aprobacion.de, fuente: "maestro.centros-costo", nota: "remitente de aprobacion.json validado contra el maestro" },
    { campo: "aprobador.fecha_aprobacion", valor: orden.aprobador.fecha_aprobacion, fuente: "derivado", nota: "aprobacion.json" },
    { campo: "aprobador.evidencia_sha256", valor: evidenciaSha256, fuente: "derivado", nota: "sha256 de la evidencia de aprobación" },
    { campo: "posiciones[0].descripcion", valor: descripcion.valor, fuente: "solicitud", ...(descripcion.nota ? { nota: descripcion.nota } : {}) },
    { campo: "posiciones[0].cantidad", valor: solicitud.cantidad, fuente: "solicitud" },
    { campo: "posiciones[0].unidad", valor: unidad, fuente: "derivado", nota: "inferida de la descripción y los ítems de la cotización" },
    { campo: "posiciones[0].precio_unitario", valor: solicitud.valor_unitario, fuente: "solicitud" },
    { campo: "posiciones[0].centro_costo", valor: solicitud.centro_costo, fuente: "solicitud" },
    { campo: "posiciones[0].subarea", valor: solicitud.subarea, fuente: "solicitud" },
    { campo: "posiciones[0].indicador_iva", valor: iva.valor, fuente: iva.fuente },
  ]

  return ok({ orden, trazabilidad })
}
