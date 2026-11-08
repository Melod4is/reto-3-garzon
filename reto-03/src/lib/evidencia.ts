import { createHash } from "node:crypto"
import { mkdir, writeFile } from "node:fs/promises"
import path from "node:path"
import { PDFDocument, StandardFonts } from "pdf-lib"
import type { Aprobacion } from "./esquemas"

const ANCHO_LINEA_PDF = 90

export const sha256 = (texto: string): string => createHash("sha256").update(texto, "utf8").digest("hex")

/** Contenido canónico de la evidencia; su hash es el que viaja en la OC. */
export function contenidoEvidencia(a: Aprobacion): string {
  return [
    "EVIDENCIA DE APROBACIÓN",
    `De: ${a.de}`,
    `Para: ${a.para}`,
    `Fecha: ${a.fecha}`,
    `Asunto: ${a.asunto}`,
    "",
    a.texto,
  ].join("\n")
}

export const hashEvidencia = (a: Aprobacion): string => sha256(contenidoEvidencia(a))

function partirLinea(linea: string): string[] {
  if (linea.length <= ANCHO_LINEA_PDF) return [linea]
  const partes: string[] = []
  let actual = ""
  for (const palabra of linea.split(" ")) {
    if ((actual + " " + palabra).trim().length > ANCHO_LINEA_PDF) {
      partes.push(actual)
      actual = palabra
    } else actual = `${actual} ${palabra}`.trim()
  }
  return [...partes, actual]
}

async function generarPdf(texto: string, fecha: Date): Promise<Uint8Array> {
  const pdf = await PDFDocument.create()
  pdf.setTitle("Evidencia de aprobación")
  pdf.setCreationDate(fecha)
  pdf.setModificationDate(fecha)
  const fuente = await pdf.embedFont(StandardFonts.Helvetica)
  const pagina = pdf.addPage()
  const { height } = pagina.getSize()
  texto.split("\n").flatMap(partirLinea).forEach((linea, i) => {
    pagina.drawText(linea, { x: 50, y: height - 60 - i * 16, size: 11, font: fuente })
  })
  return pdf.save({ useObjectStreams: false })
}

function documentoFirmado(a: Aprobacion): { texto: string; sha256: string } {
  const contenido = contenidoEvidencia(a)
  const hash = sha256(contenido)
  return { texto: `${contenido}\n\nSHA-256 del contenido: ${hash}\n`, sha256: hash }
}

/** PDF de la evidencia. Es determinista (fecha = la de la aprobación), así que sirve para descargarlo en cualquier instancia. */
export async function pdfEvidencia(a: Aprobacion): Promise<{ bytes: Uint8Array; sha256: string }> {
  const doc = documentoFirmado(a)
  return { bytes: await generarPdf(doc.texto, new Date(a.fecha)), sha256: doc.sha256 }
}

export type Evidencia = { txt: string; pdf: string; sha256: string }

/** Escribe `aprobacion.txt` (P0) y `aprobacion.pdf` (P1) en `<dirOut>/<caso>/`. */
export async function escribirEvidencia(dirOut: string, caso: string, a: Aprobacion): Promise<Evidencia> {
  const dir = path.join(dirOut, caso)
  await mkdir(dir, { recursive: true })
  const doc = documentoFirmado(a)
  const txt = path.join(dir, "aprobacion.txt")
  const pdf = path.join(dir, "aprobacion.pdf")
  await writeFile(txt, doc.texto, "utf8")
  await writeFile(pdf, await generarPdf(doc.texto, new Date(a.fecha)))
  return { txt, pdf, sha256: doc.sha256 }
}
