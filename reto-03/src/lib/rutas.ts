import path from "node:path"

const NOMBRE_CASO = /^[a-z0-9][a-z0-9-]*$/i

export const dirFixtures = (directory: string): string => path.join(directory, "fixtures", "reto-03")

export const dirMaestros = (directory: string): string => path.join(dirFixtures(directory), "maestros")

/** Raíz de escritura: OUT_DIR, o /tmp/out en Vercel (el disco del proyecto es de solo lectura), o `<directory>/out`. */
export function dirSalida(directory: string): string {
  const desdeEnv = process.env.OUT_DIR
  if (desdeEnv) return path.resolve(desdeEnv)
  return process.env.VERCEL ? "/tmp/out" : path.join(directory, "out")
}

export const esNombreCasoValido = (caso: string): boolean => NOMBRE_CASO.test(caso)

export const dirCaso = (directory: string, caso: string): string =>
  path.join(dirFixtures(directory), "solicitudes", caso)

/** Ruta legible para el usuario: relativa al proyecto si está dentro de él. */
export function rutaVisible(directory: string, absoluta: string): string {
  const relativa = path.relative(directory, absoluta)
  return relativa.startsWith("..") ? absoluta : relativa.split(path.sep).join("/")
}
