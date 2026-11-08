#!/usr/bin/env node
// Hook compartido Cursor / Claude Code. Compatible con Node 16+ (corre antes de que exista Bun).
//   marcar    → tras editar un archivo, anota si es código del proyecto.
//   verificar → al terminar el turno, si hubo cambios de código, corre `bun run verify`
//               y devuelve el fallo al agente para que lo corrija.
"use strict"

const fs = require("fs")
const os = require("os")
const path = require("path")
const { spawnSync } = require("child_process")

const RAIZ = path.resolve(__dirname, "..", "..")
const ESTADO = path.join(RAIZ, ".verificacion")
const PENDIENTE = path.join(ESTADO, "pendiente")
const INTENTOS = path.join(ESTADO, "intentos")
const MAX_INTENTOS = 3
const LINEAS_SALIDA = 60

const RELEVANTE = /^(src|tests|agent|web|modulo|scripts)\/|^(demo\.ts|package\.json|tsconfig\.json)$/
const IGNORADO = /^(out|node_modules|fixtures|\.verificacion)\/|^web\/dist\//

const [modo, cliente] = process.argv.slice(2)

function leerEntrada() {
  try {
    const texto = fs.readFileSync(0, "utf8")
    return texto ? JSON.parse(texto) : {}
  } catch {
    return {}
  }
}

function responder(objeto) {
  process.stdout.write(JSON.stringify(objeto))
  process.exit(0)
}

function rutaEditada(entrada) {
  const ti = entrada.tool_input || {}
  return entrada.file_path || ti.file_path || ti.notebook_path || null
}

function esCodigo(ruta) {
  const relativa = path.relative(RAIZ, path.resolve(RAIZ, ruta)).split(path.sep).join("/")
  if (relativa.startsWith("..")) return false
  return RELEVANTE.test(relativa) && !IGNORADO.test(relativa)
}

function leerIntentos() {
  try {
    return Number(fs.readFileSync(INTENTOS, "utf8")) || 0
  } catch {
    return 0
  }
}

function limpiarEstado() {
  fs.rmSync(PENDIENTE, { force: true })
  fs.rmSync(INTENTOS, { force: true })
}

function avisar(mensaje) {
  responder(cliente === "claude" ? { systemMessage: mensaje } : {})
}

function exigirCorreccion(mensaje) {
  if (cliente === "claude") responder({ decision: "block", reason: mensaje })
  responder({ followup_message: mensaje })
}

function marcar() {
  const ruta = rutaEditada(leerEntrada())
  if (ruta && esCodigo(ruta)) {
    fs.mkdirSync(ESTADO, { recursive: true })
    fs.appendFileSync(PENDIENTE, ruta + "\n")
  }
  responder({})
}

// Recién instalado, Bun puede no estar aún en el PATH del editor.
function resolverBun() {
  const enPath = spawnSync("bun", ["--version"], { cwd: RAIZ, shell: true, encoding: "utf8" })
  if (enPath.status === 0) return "bun"
  const local = path.join(os.homedir(), ".bun", "bin", process.platform === "win32" ? "bun.exe" : "bun")
  return fs.existsSync(local) ? `"${local}"` : null
}

function verificar() {
  leerEntrada()
  if (!fs.existsSync(PENDIENTE)) responder({})

  const bun = resolverBun()
  if (!bun) {
    avisar("Verificación omitida: Bun no está instalado. Instálalo y ejecuta `bun run verify` en reto-03.")
  }

  const r = spawnSync(bun, ["run", "verify"], {
    cwd: RAIZ,
    shell: true,
    encoding: "utf8",
    timeout: 280000,
  })
  if (r.status === 0) {
    limpiarEstado()
    avisar("Verificación del Reto 03 en verde.")
  }

  const intentos = leerIntentos() + 1
  fs.writeFileSync(INTENTOS, String(intentos))
  if (intentos > MAX_INTENTOS) {
    fs.rmSync(INTENTOS, { force: true })
    avisar(`La verificación sigue fallando tras ${MAX_INTENTOS} intentos. Revisa \`bun run verify\` manualmente.`)
  }

  const salida = ((r.stdout || "") + (r.stderr || "")).trim().split(/\r?\n/).slice(-LINEAS_SALIDA).join("\n")
  exigirCorreccion(
    `La verificación obligatoria (skill verificar-reto03, \`bun run verify\`) falló ` +
      `(intento ${intentos}/${MAX_INTENTOS}). Corrige el código de producción sin relajar tests ` +
      `ni tocar fixtures, y vuelve a ejecutar \`bun run verify\`.\n\n${salida}`
  )
}

if (modo === "marcar") marcar()
else if (modo === "verificar") verificar()
else responder({})
