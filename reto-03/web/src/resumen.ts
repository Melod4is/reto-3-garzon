type Json = { ok?: boolean; error?: string; data?: Record<string, unknown> }

export function parsear(resultado: string): Json {
  try {
    return JSON.parse(resultado) as Json
  } catch {
    return { ok: false, error: resultado }
  }
}

const codigos = (valor: unknown): string => {
  if (!Array.isArray(valor) || valor.length === 0) return "—"
  return valor.map((v) => (typeof v === "string" ? v : (v as { codigo?: string }).codigo ?? "?")).join(", ")
}

/** Una línea legible del resultado de cada herramienta. */
export function resumirResultado(nombre: string, resultado: string): string {
  const r = parsear(resultado)
  if (!r.ok) return r.error ?? "Error"
  const d = r.data ?? {}
  switch (nombre) {
    case "oc_leer_paquete": {
      const faltantes = Array.isArray(d.faltantes) && d.faltantes.length ? ` · faltan: ${d.faltantes.join(", ")}` : ""
      return `Paquete leído${d.factura ? " · incluye factura" : ""}${faltantes}`
    }
    case "oc_validar":
      return `apta: ${String(d.apta)} · bloqueos: ${codigos(d.bloqueos)} · confirmaciones: ${codigos(d.confirmaciones)} · retroactiva: ${String(d.retroactiva)}`
    case "oc_generar_evidencia":
      return `${d.aprobado_por ? `aprobó ${String(d.aprobado_por)} · ` : ""}${String(d.ruta)} · sha256 ${String(d.sha256).slice(0, 12)}…`
    case "oc_construir_payload":
      return `OC construida · trazabilidad en ${String(d.trazabilidad)}`
    case "oc_crear":
      return `OC ${String(d.numero_oc)}${d.idempotente ? " (ya existía)" : " creada"}`
    default:
      return "ok"
  }
}
