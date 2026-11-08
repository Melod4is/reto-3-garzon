import { IconoDocumento } from "./Iconos"

type Orden = {
  proveedor: { codigo_sap: string; nombre: string; nit: string }
  moneda: string
  condiciones_pago: string
  aprobador: { email: string; fecha_aprobacion: string }
  posiciones: { numero: number; descripcion: string; cantidad: number; unidad: string; precio_unitario: number; centro_costo: string; subarea: string; indicador_iva: string }[]
  excepciones: { codigo: string }[]
}

const dinero = (n: number, moneda: string) => `${moneda} ${n.toLocaleString("es-CO")}`

/** Vista de la OC tal como quedaría en SAP (datos del resultado de oc_construir_payload, no del modelo). */
export function PayloadTabla({ orden }: { orden: Orden }) {
  const filas: [string, string][] = [
    ["Proveedor", `${orden.proveedor.nombre} (SAP ${orden.proveedor.codigo_sap} · NIT ${orden.proveedor.nit})`],
    ["Condiciones de pago", orden.condiciones_pago],
    ["Aprobador", `${orden.aprobador.email} · ${orden.aprobador.fecha_aprobacion}`],
    ["Excepciones", orden.excepciones.map((e) => e.codigo).join(", ") || "—"],
  ]
  return (
    <section className="payload" aria-label="OC propuesta">
      <header className="payload-titulo">
        <IconoDocumento tamano={16} />
        <span>OC propuesta para SAP</span>
      </header>
      <div className="tabla-scroll">
        <table>
          <tbody>
            {filas.map(([k, v]) => (
              <tr key={k}>
                <th scope="row">{k}</th>
                <td>{v}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="tabla-scroll">
        <table>
          <thead>
            <tr>
              <th>Pos.</th>
              <th>Descripción</th>
              <th>Cant.</th>
              <th>Precio unit.</th>
              <th>Total</th>
              <th>CeCo / Subárea</th>
              <th>IVA</th>
            </tr>
          </thead>
          <tbody>
            {orden.posiciones.map((p) => (
              <tr key={p.numero}>
                <td>{p.numero}</td>
                <td>{p.descripcion}</td>
                <td>
                  {p.cantidad} {p.unidad}
                </td>
                <td>{dinero(p.precio_unitario, orden.moneda)}</td>
                <td>{dinero(p.precio_unitario * p.cantidad, orden.moneda)}</td>
                <td>
                  {p.centro_costo} / {p.subarea}
                </td>
                <td>{p.indicador_iva}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  )
}

export type { Orden }
