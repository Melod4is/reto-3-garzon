import { describe, expect, test } from "bun:test"
import { readFileSync } from "node:fs"
import path from "node:path"
import * as moduloOc from "../modulo/tools/oc"
import { archivosModulo } from "../scripts/empaquetar-modulo"
import * as appOc from "../src/tools/oc"
import { RAIZ } from "./helpers"

describe("modulo/ (PRD 9.4): mismas piezas que la app", () => {
  test("tools/oc.ts expone exactamente las herramientas de la app", () => {
    expect(Object.keys(moduloOc).sort()).toEqual(Object.keys(appOc).sort())
    for (const nombre of Object.keys(appOc) as Array<keyof typeof appOc>) {
      expect(moduloOc[nombre]).toBe(appOc[nombre])
    }
  })

  test("agent.md y SKILL.md están sincronizados con prompt y knowledge", () => {
    for (const [relativa, esperado] of Object.entries(archivosModulo(RAIZ))) {
      const actual = readFileSync(path.join(RAIZ, relativa), "utf8").replace(/\r\n/g, "\n")
      expect(actual).toBe(esperado)
    }
  })

  test("agent.md declara frontmatter requerido", () => {
    const agente = readFileSync(path.join(RAIZ, "modulo", "agent.md"), "utf8")
    expect(agente).toMatch(/^---\ndescription: .+\nmode: primary\npermission:\n {2}edit: deny\n {2}bash: deny\n---/)
    const skill = readFileSync(path.join(RAIZ, "modulo", "skill", "ordenes-compra", "SKILL.md"), "utf8")
    expect(skill).toMatch(/^---\nname: ordenes-compra\ndescription: .+\n---/)
  })
})
