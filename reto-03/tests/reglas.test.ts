import { afterAll, beforeAll, describe, expect, test } from "bun:test"
import { cargarMaestros } from "../src/lib/maestros"
import { validarPaquete } from "../src/lib/reglas"
import * as oc from "../src/tools/oc"
import { codigos, crearEntorno, datos, ejecutar } from "./helpers"

type Paquete = Parameters<typeof validarPaquete>[0]
type Maestros = Parameters<typeof validarPaquete>[1]

let base: Paquete
let maestros: Maestros
let limpiar: () => Promise<void>

beforeAll(async () => {
  const ctx = await crearEntorno()
  limpiar = ctx.limpiar
  base = datos(await ejecutar<Paquete>(oc.leer_paquete, { caso: "sol-001" }, ctx))
  maestros = await cargarMaestros(ctx.directory)
})
afterAll(() => limpiar())

function validarVariante(mutar: (p: Paquete) => void) {
  const p = structuredClone(base)
  mutar(p)
  return validarPaquete(p, maestros)
}

test("sol-001 base: apta y sin hallazgos", () => {
  const v = validarPaquete(base, maestros)
  expect(v.apta).toBe(true)
  expect(v.bloqueos).toEqual([])
  expect(v.confirmaciones).toEqual([])
  expect(v.retroactiva).toBe(false)
})

describe("RC1 proveedor existe y activo (bloqueo)", () => {
  test("NIT inexistente bloquea", () => {
    const v = validarVariante((p) => { p.solicitud.proveedor_nit = "901999000" })
    expect(codigos(v.bloqueos)).toContain("RC1")
    expect(v.apta).toBe(false)
  })
  test("proveedor inactivo bloquea", () => {
    const v = validarVariante((p) => { p.solicitud.proveedor_nit = "901777888" })
    expect(codigos(v.bloqueos)).toContain("RC1")
  })
  test("sin NIT se busca por nombre normalizado", () => {
    const v = validarVariante((p) => {
      delete p.solicitud.proveedor_nit
      p.solicitud.proveedor_nombre = "tecnosuministros sas"
    })
    expect(codigos(v.bloqueos)).not.toContain("RC1")
  })
})

describe("RC2 aprobación válida (bloqueo)", () => {
  test("sin aprobación bloquea", () => {
    const v = validarVariante((p) => { p.aprobacion = null })
    expect(codigos(v.bloqueos)).toContain("RC2")
  })
  test("correo sin 'Aprobado' bloquea", () => {
    const v = validarVariante((p) => {
      if (p.aprobacion) Object.assign(p.aprobacion, { aprobado: false, texto: "Lo reviso la próxima semana" })
    })
    expect(codigos(v.bloqueos)).toContain("RC2")
  })
  test("aprobador de otro centro de costo bloquea", () => {
    const v = validarVariante((p) => { if (p.aprobacion) p.aprobacion.de = "fvargas@periferia-ficticia.com" })
    expect(codigos(v.bloqueos)).toContain("RC2")
  })
})

describe("RC3 monto dentro del tope del aprobador (bloqueo)", () => {
  const monto60M = (p: Paquete) => Object.assign(p.solicitud, { cantidad: 1, valor_unitario: 60_000_000, valor_total: 60_000_000 })
  test("excede tope de mlopez (50 M)", () => {
    expect(codigos(validarVariante(monto60M).bloqueos)).toContain("RC3")
  })
  test("dentro del tope de dgarcia (200 M)", () => {
    const v = validarVariante((p) => {
      monto60M(p)
      if (p.aprobacion) p.aprobacion.de = "dgarcia@periferia-ficticia.com"
    })
    expect(codigos(v.bloqueos)).not.toContain("RC3")
  })
})

test("RC4 subárea ajena al centro de costo bloquea", () => {
  const v = validarVariante((p) => { p.solicitud.subarea = "Marketing" })
  expect(codigos(v.bloqueos)).toContain("RC4")
})

describe("RC5 cotización vs solicitud ≤ 2 % (confirmación)", () => {
  test("2 % exacto no pide confirmación", () => {
    const v = validarVariante((p) => { if (p.cotizacion) p.cotizacion.total = 11_628_000 })
    expect(codigos(v.confirmaciones)).not.toContain("RC5")
  })
  test("3 % pide confirmación con ambos valores", () => {
    const v = validarVariante((p) => { if (p.cotizacion) p.cotizacion.total = 11_742_000 })
    const rc5 = v.confirmaciones.find((c) => c.codigo === "RC5")
    expect(rc5?.valores).toMatchObject({ solicitud: 11_400_000, cotizacion: 11_742_000 })
    expect(v.apta).toBe(true)
  })
  test("sin cotización pide confirmación", () => {
    const v = validarVariante((p) => { p.cotizacion = null })
    expect(codigos(v.confirmaciones)).toContain("RC5")
  })
})

test("RC6 IVA ausente: se deriva del proveedor y se confirma", () => {
  const v = validarVariante((p) => { delete p.solicitud.indicador_iva })
  expect(codigos(v.confirmaciones)).toContain("RC6")
  expect(v.derivados.indicador_iva).toEqual({ valor: "C1", fuente: "maestro.proveedores" })
})

test("RC7 condiciones de pago ausentes: se derivan y solo se informan", () => {
  const v = validarVariante((p) => { delete p.solicitud.condiciones_pago })
  expect(v.derivados.condiciones_pago).toEqual({ valor: "Z030", fuente: "maestro.proveedores" })
  expect(codigos(v.confirmaciones)).not.toContain("RC7")
})

describe("RC8 factura anterior a la solicitud (confirmación + retroactiva)", () => {
  test("factura anterior marca retroactiva", () => {
    const v = validarVariante((p) => { p.factura = { numero: "F-1", fecha: "2026-08-19", total: 11_400_000 } })
    expect(v.retroactiva).toBe(true)
    expect(codigos(v.confirmaciones)).toContain("RC8")
  })
  test("factura del mismo día no es retroactiva", () => {
    const v = validarVariante((p) => { p.factura = { numero: "F-1", fecha: "2026-08-20", total: 11_400_000 } })
    expect(v.retroactiva).toBe(false)
  })
})

describe("RC9 aprobación no anterior a la solicitud (confirmación)", () => {
  test("aprobación del día anterior pide confirmación", () => {
    const v = validarVariante((p) => { if (p.aprobacion) p.aprobacion.fecha = "2026-08-19T23:00:00-05:00" })
    expect(codigos(v.confirmaciones)).toContain("RC9")
  })
  test("misma fecha local aunque en UTC sea otro día", () => {
    const v = validarVariante((p) => { if (p.aprobacion) p.aprobacion.fecha = "2026-08-20T21:30:00-05:00" })
    expect(codigos(v.confirmaciones)).not.toContain("RC9")
  })
})

describe("RC10 cantidad × valor unitario = total ±1 (bloqueo)", () => {
  test("diferencia de 2 bloquea", () => {
    const v = validarVariante((p) => { p.solicitud.valor_total = 11_400_002 })
    expect(codigos(v.bloqueos)).toContain("RC10")
  })
  test("diferencia de 1 se tolera", () => {
    const v = validarVariante((p) => { p.solicitud.valor_total = 11_400_001 })
    expect(codigos(v.bloqueos)).not.toContain("RC10")
  })
})
