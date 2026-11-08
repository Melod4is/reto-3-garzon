import type { Derivados, Paquete } from "./esquemas"
import { type Aprobador, type CentroCosto, type Maestros, type Proveedor, buscarCentro, buscarProveedor } from "./maestros"
import { fechaLocal, formatearMonto } from "./normalizar"

export const UMBRALES = {
  /** RC5: diferencia relativa máxima entre cotización y solicitud. */
  toleranciaCotizacion: 0.02,
  /** RC10: diferencia absoluta máxima entre cantidad × valor unitario y total. */
  toleranciaTotal: 1,
} as const

const EPSILON = 1e-9

export type CodigoRegla = "RC1" | "RC2" | "RC3" | "RC4" | "RC5" | "RC6" | "RC7" | "RC8" | "RC9" | "RC10"

export type Hallazgo = {
  codigo: CodigoRegla
  detalle: string
  accion_sugerida: string
  valores?: Record<string, string | number | null>
}

export type Validacion = {
  apta: boolean
  bloqueos: Hallazgo[]
  confirmaciones: Hallazgo[]
  derivados: Derivados
  retroactiva: boolean
}

type Contexto = {
  paquete: Paquete
  proveedor: Proveedor | null
  centro: CentroCosto | null
  aprobador: Aprobador | null
}

type Aporte = {
  bloqueo?: Hallazgo
  confirmacion?: Hallazgo
  derivados?: Derivados
  retroactiva?: boolean
}

const cop = (n: number): string => `${formatearMonto(n)}`

function listarAprobadores(centro: CentroCosto): string {
  return centro.aprobadores.map((a) => `${a.email} (tope ${cop(a.tope)})`).join(", ")
}

function sugerirAprobador(centro: CentroCosto, monto: number): string {
  const capaz = centro.aprobadores.find((a) => a.tope >= monto)
  return capaz
    ? `Pedir la aprobación a ${capaz.email}, que tiene tope ${cop(capaz.tope)} en ${centro.centro_costo}.`
    : `Ningún aprobador de ${centro.centro_costo} tiene tope ≥ ${cop(monto)}; escalar a la dirección financiera para aprobación extraordinaria.`
}

function rc1({ paquete, proveedor }: Contexto): Aporte {
  const { proveedor_nombre, proveedor_nit } = paquete.solicitud
  const id = proveedor_nit ? `NIT ${proveedor_nit}` : `nombre "${proveedor_nombre}"`
  if (!proveedor) {
    return {
      bloqueo: {
        codigo: "RC1",
        detalle: `El proveedor ${proveedor_nombre} (${id}) no existe en el maestro de proveedores.`,
        accion_sugerida: "Solicitar a compras la creación del proveedor en SAP (RUT y certificación bancaria) o confirmar el NIT con el solicitante.",
      },
    }
  }
  if (!proveedor.activo) {
    return {
      bloqueo: {
        codigo: "RC1",
        detalle: `El proveedor ${proveedor.nombre} (${proveedor.codigo_sap}) está inactivo.`,
        accion_sugerida: "Solicitar la reactivación del proveedor o cotizar con un proveedor activo.",
      },
    }
  }
  return {}
}

function rc2({ paquete, centro, aprobador }: Contexto): Aporte {
  const { aprobacion, solicitud } = paquete
  const bloqueo = (detalle: string, accion_sugerida: string): Aporte => ({ bloqueo: { codigo: "RC2", detalle, accion_sugerida } })
  if (!aprobacion) return bloqueo("No hay correo de aprobación del líder.", "Pedir al solicitante el correo de aprobación de un aprobador del centro de costo.")
  if (!aprobacion.aprobado) return bloqueo(`El correo de ${aprobacion.de} no contiene la palabra "Aprobado".`, "Pedir al líder una aprobación explícita por correo.")
  if (!centro) return {}
  if (!aprobador) {
    return bloqueo(
      `${aprobacion.de} no es aprobador del centro ${solicitud.centro_costo}. Aprobadores válidos: ${listarAprobadores(centro)}.`,
      sugerirAprobador(centro, solicitud.valor_total),
    )
  }
  return {}
}

function rc3({ paquete, centro, aprobador }: Contexto): Aporte {
  const total = paquete.solicitud.valor_total
  if (!centro || !aprobador || total <= aprobador.tope) return {}
  return {
    bloqueo: {
      codigo: "RC3",
      detalle: `El valor ${cop(total)} supera el tope de ${aprobador.email} (${cop(aprobador.tope)}) en ${centro.centro_costo}.`,
      accion_sugerida: sugerirAprobador(centro, total),
      valores: { valor_total: total, tope: aprobador.tope },
    },
  }
}

function rc4({ paquete, centro }: Contexto): Aporte {
  const { centro_costo, subarea } = paquete.solicitud
  if (!centro) {
    return { bloqueo: { codigo: "RC4", detalle: `El centro de costo ${centro_costo} no existe.`, accion_sugerida: "Confirmar el centro de costo con el solicitante." } }
  }
  if (centro.subareas.includes(subarea)) return {}
  return {
    bloqueo: {
      codigo: "RC4",
      detalle: `La subárea "${subarea}" no pertenece a ${centro_costo} (${centro.subareas.join(", ")}).`,
      accion_sugerida: "Confirmar con el solicitante la subárea correcta.",
    },
  }
}

function rc5({ paquete }: Contexto): Aporte {
  const { cotizacion, solicitud } = paquete
  if (!cotizacion) {
    return {
      confirmacion: {
        codigo: "RC5",
        detalle: "No hay cotización del proveedor para contrastar el valor.",
        accion_sugerida: "Confirmar que se acepta crear la OC sin cotización o pedirla al solicitante.",
        valores: { solicitud: solicitud.valor_total, cotizacion: null, diferencia_pct: null },
      },
    }
  }
  const base = solicitud.valor_total || 1
  const diferencia = Math.abs(cotizacion.total - solicitud.valor_total) / base
  if (diferencia <= UMBRALES.toleranciaCotizacion + EPSILON) return {}
  const pct = Math.round(diferencia * 10000) / 100
  return {
    confirmacion: {
      codigo: "RC5",
      detalle: `La cotización (${cop(cotizacion.total)}) difiere ${pct} % de la solicitud (${cop(solicitud.valor_total)}); el máximo es ${UMBRALES.toleranciaCotizacion * 100} %.`,
      accion_sugerida: "Confirmar el valor con el solicitante; si se acepta, la OC se crea por el valor de la solicitud aprobada.",
      valores: { solicitud: solicitud.valor_total, cotizacion: cotizacion.total, diferencia_pct: pct },
    },
  }
}

function rc6({ paquete, proveedor }: Contexto): Aporte {
  if (paquete.solicitud.indicador_iva) return {}
  const propuesto = proveedor?.indicador_iva_default
  return {
    confirmacion: {
      codigo: "RC6",
      detalle: propuesto
        ? `La solicitud no informa indicador de IVA; se propone ${propuesto} (default del proveedor).`
        : "La solicitud no informa indicador de IVA y no hay proveedor del cual derivarlo.",
      accion_sugerida: "Confirmar el indicador de IVA propuesto o indicar el correcto.",
    },
    derivados: propuesto ? { indicador_iva: { valor: propuesto, fuente: "maestro.proveedores" } } : {},
  }
}

function rc7({ paquete, proveedor }: Contexto): Aporte {
  if (paquete.solicitud.condiciones_pago || !proveedor) return {}
  return { derivados: { condiciones_pago: { valor: proveedor.condiciones_pago_default, fuente: "maestro.proveedores" } } }
}

function rc8({ paquete }: Contexto): Aporte {
  const { factura, solicitud } = paquete
  if (!factura || fechaLocal(factura.fecha) >= fechaLocal(solicitud.fecha_solicitud)) return {}
  return {
    retroactiva: true,
    confirmacion: {
      codigo: "RC8",
      detalle: `La factura ${factura.numero} (${fechaLocal(factura.fecha)}) es anterior a la solicitud (${fechaLocal(solicitud.fecha_solicitud)}): OC retroactiva.`,
      accion_sugerida: "Confirmar la creación retroactiva; quedará marcada en el log de control para auditoría.",
      valores: { fecha_factura: fechaLocal(factura.fecha), fecha_solicitud: fechaLocal(solicitud.fecha_solicitud) },
    },
  }
}

function rc9({ paquete }: Contexto): Aporte {
  const { aprobacion, solicitud } = paquete
  if (!aprobacion || fechaLocal(aprobacion.fecha) >= fechaLocal(solicitud.fecha_solicitud)) return {}
  return {
    confirmacion: {
      codigo: "RC9",
      detalle: `La aprobación (${fechaLocal(aprobacion.fecha)}) es anterior a la solicitud (${fechaLocal(solicitud.fecha_solicitud)}).`,
      accion_sugerida: "Confirmar que la aprobación corresponde a esta solicitud.",
    },
  }
}

function rc10({ paquete }: Contexto): Aporte {
  const { cantidad, valor_unitario, valor_total } = paquete.solicitud
  const calculado = cantidad * valor_unitario
  if (Math.abs(calculado - valor_total) <= UMBRALES.toleranciaTotal) return {}
  return {
    bloqueo: {
      codigo: "RC10",
      detalle: `Cantidad × valor unitario (${cop(calculado)}) no coincide con el valor total (${cop(valor_total)}).`,
      accion_sugerida: "Pedir al solicitante que corrija cantidad, valor unitario o total en el Excel.",
      valores: { calculado, valor_total },
    },
  }
}

const REGLAS = [rc1, rc2, rc3, rc4, rc5, rc6, rc7, rc8, rc9, rc10]

function construirContexto(paquete: Paquete, maestros: Maestros): Contexto {
  const { solicitud, aprobacion } = paquete
  const centro = buscarCentro(maestros, solicitud.centro_costo)
  const email = aprobacion?.de.toLowerCase()
  return {
    paquete,
    proveedor: buscarProveedor(maestros, solicitud.proveedor_nit, solicitud.proveedor_nombre),
    centro,
    aprobador: centro?.aprobadores.find((a) => a.email.toLowerCase() === email) ?? null,
  }
}

/** Aplica RC1–RC10. Función pura: no lee archivos ni depende del modelo. */
export function validarPaquete(paquete: Paquete, maestros: Maestros): Validacion {
  const contexto = construirContexto(paquete, maestros)
  const aportes = REGLAS.map((regla) => regla(contexto))
  const bloqueos = aportes.flatMap((a) => (a.bloqueo ? [a.bloqueo] : []))
  return {
    apta: bloqueos.length === 0,
    bloqueos,
    confirmaciones: aportes.flatMap((a) => (a.confirmacion ? [a.confirmacion] : [])),
    derivados: Object.assign({}, ...aportes.map((a) => a.derivados ?? {})) as Derivados,
    retroactiva: aportes.some((a) => a.retroactiva === true),
  }
}
