import { describe, expect, test } from "bun:test"
import { contieneAprobado, fechaLocal, normalizarNit, normalizarNombre, parsearMonto } from "../src/lib/normalizar"

describe("parsearMonto", () => {
  test("punto como separador de miles", () => {
    expect(parsearMonto("COP 11.400.000")).toBe(11_400_000)
    expect(parsearMonto("COP 95.000")).toBe(95_000)
    expect(parsearMonto("3200000")).toBe(3_200_000)
  })
  test("monto no numérico devuelve null", () => {
    expect(parsearMonto("doce millones")).toBeNull()
    expect(parsearMonto("")).toBeNull()
  })
})

describe("normalizarNit", () => {
  test("quita puntos y dígito de verificación", () => {
    expect(normalizarNit("900.555.111-2")).toBe("900555111")
    expect(normalizarNit("900555111")).toBe("900555111")
  })
})

describe("normalizarNombre", () => {
  test("ignora mayúsculas, tildes y puntuación", () => {
    expect(normalizarNombre("TecnoSuministros S.A.S.")).toBe(normalizarNombre("tecnosuministros  sas"))
    expect(normalizarNombre("Papelería Central Ltda.")).toBe("papeleria central ltda")
  })
})

describe("fechaLocal", () => {
  test("usa la fecha en su propio offset, sin pasar a UTC", () => {
    expect(fechaLocal("2026-08-26T18:45:00-05:00")).toBe("2026-08-26")
    expect(fechaLocal("2026-08-20T21:30:00-05:00")).toBe("2026-08-20")
    expect(fechaLocal("2026-08-20")).toBe("2026-08-20")
  })
})

describe("contieneAprobado", () => {
  test("detecta la palabra sin distinguir mayúsculas", () => {
    expect(contieneAprobado("Aprobado por 25 millones según la solicitud.")).toBe(true)
    expect(contieneAprobado("aprobado.")).toBe(true)
  })
  test("no confunde otras palabras ni textos sin aprobación", () => {
    expect(contieneAprobado("Desaprobado por presupuesto")).toBe(false)
    expect(contieneAprobado("Lo reviso la próxima semana")).toBe(false)
  })
})
