import { z } from "zod"

export const SolicitudSchema = z.object({
  solicitud_id: z.string().min(1),
  solicitante: z.string(),
  proveedor_nombre: z.string(),
  proveedor_nit: z.string().optional(),
  descripcion: z.string(),
  centro_costo: z.string(),
  subarea: z.string(),
  cantidad: z.number(),
  valor_unitario: z.number(),
  valor_total: z.number(),
  moneda: z.enum(["COP", "USD"]),
  indicador_iva: z.string().optional(),
  condiciones_pago: z.string().optional(),
  fecha_solicitud: z.string(),
})

export const CorreoSchema = z.object({
  id: z.string(),
  de: z.string(),
  asunto: z.string(),
  fecha: z.string(),
})

export const CotizacionSchema = z.object({
  referencia: z.string().nullable(),
  proveedor: z.string(),
  nit: z.string().nullable(),
  total: z.number(),
  moneda: z.string(),
  validez_hasta: z.string().nullable(),
  items: z.array(z.string()),
  texto: z.string(),
})

export const AprobacionSchema = z.object({
  de: z.string(),
  para: z.string(),
  fecha: z.string(),
  asunto: z.string(),
  aprobado: z.boolean(),
  texto: z.string(),
})

export const FacturaSchema = z.object({
  numero: z.string(),
  fecha: z.string(),
  total: z.number(),
})

export const PaqueteSchema = z.object({
  correo: CorreoSchema,
  solicitud: SolicitudSchema,
  cotizacion: CotizacionSchema.nullable(),
  aprobacion: AprobacionSchema.nullable(),
  factura: FacturaSchema.nullable(),
  faltantes: z.array(z.string()),
})

export const DerivadoSchema = z.object({ valor: z.string(), fuente: z.string() })
export const DerivadosSchema = z.object({
  indicador_iva: DerivadoSchema.optional(),
  condiciones_pago: DerivadoSchema.optional(),
})

export const OrdenCompraSchema = z.object({
  referencia: z.object({
    solicitud_id: z.string(),
    correo_id: z.string(),
    cotizacion_ref: z.string().nullable(),
  }),
  sociedad: z.literal("1000"),
  organizacion_compras: z.literal("1000"),
  proveedor: z.object({ codigo_sap: z.string(), nit: z.string(), nombre: z.string() }),
  moneda: z.enum(["COP", "USD"]),
  condiciones_pago: z.string(),
  aprobador: z.object({ email: z.string(), fecha_aprobacion: z.string(), evidencia_sha256: z.string() }),
  posiciones: z
    .array(
      z.object({
        numero: z.number().int().positive(),
        descripcion: z.string().max(40),
        cantidad: z.number().positive(),
        unidad: z.enum(["UN", "H", "MES"]),
        precio_unitario: z.number().nonnegative(),
        centro_costo: z.string(),
        subarea: z.string(),
        indicador_iva: z.string(),
      }),
    )
    .min(1),
  excepciones: z.array(z.object({ codigo: z.string(), detalle: z.string(), confirmado_por: z.string().nullable() })),
})

export type Solicitud = z.infer<typeof SolicitudSchema>
export type Cotizacion = z.infer<typeof CotizacionSchema>
export type Aprobacion = z.infer<typeof AprobacionSchema>
export type Paquete = z.infer<typeof PaqueteSchema>
export type Derivados = z.infer<typeof DerivadosSchema>
export type OrdenCompra = z.infer<typeof OrdenCompraSchema>

export function describirErrores(error: z.ZodError): string {
  return error.issues.map((i) => `${i.path.join(".") || "(raíz)"}: ${i.message}`).join("; ")
}
