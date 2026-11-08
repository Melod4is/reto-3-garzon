import { existsSync } from "node:fs"
import { appendFile, mkdir, readFile } from "node:fs/promises"
import path from "node:path"
import type { OrdenCompra } from "../lib/esquemas"
import type { Proveedor } from "../lib/maestros"
import { normalizarNit } from "../lib/normalizar"
import type { SapAdapter } from "./adapter"

const PRIMER_NUMERO_OC = 4500000001

type Registro = { numero_oc: string; fecha: string; orden: OrdenCompra }

/** SAP simulado sobre `<dirOut>/sap/ordenes.jsonl`. Numeración secuencial e idempotente por solicitud_id. */
export class SapMock implements SapAdapter {
  private readonly archivo: string

  constructor(
    dirOut: string,
    private readonly proveedores: Proveedor[],
  ) {
    this.archivo = path.join(dirOut, "sap", "ordenes.jsonl")
  }

  async consultarProveedor(nit: string): Promise<{ codigo_sap: string; activo: boolean } | null> {
    const p = this.proveedores.find((x) => normalizarNit(x.nit) === normalizarNit(nit))
    return p ? { codigo_sap: p.codigo_sap, activo: p.activo } : null
  }

  async crearOrden(orden: OrdenCompra): Promise<{ numero_oc: string; fecha: string }> {
    const registros = await this.leer()
    const registro: Registro = {
      numero_oc: String(PRIMER_NUMERO_OC + registros.length),
      fecha: new Date().toISOString().slice(0, 10),
      orden,
    }
    await mkdir(path.dirname(this.archivo), { recursive: true })
    await appendFile(this.archivo, `${JSON.stringify(registro)}\n`, "utf8")
    return { numero_oc: registro.numero_oc, fecha: registro.fecha }
  }

  async buscarOrdenPorReferencia(solicitud_id: string): Promise<{ numero_oc: string; fecha: string } | null> {
    const r = (await this.leer()).find((x) => x.orden.referencia.solicitud_id === solicitud_id)
    return r ? { numero_oc: r.numero_oc, fecha: r.fecha } : null
  }

  private async leer(): Promise<Registro[]> {
    if (!existsSync(this.archivo)) return []
    const contenido = await readFile(this.archivo, "utf8")
    return contenido.split(/\r?\n/).filter(Boolean).map((l) => JSON.parse(l) as Registro)
  }
}
