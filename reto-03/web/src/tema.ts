import { useEffect, useState } from "react"

export type Tema = "claro" | "oscuro"

const CLAVE = "oc-sap-tema"

function inicial(): Tema {
  const guardado = localStorage.getItem(CLAVE)
  if (guardado === "claro" || guardado === "oscuro") return guardado
  return window.matchMedia("(prefers-color-scheme: dark)").matches ? "oscuro" : "claro"
}

/** Tema claro/oscuro persistido; `index.html` aplica el mismo valor antes de pintar para evitar parpadeo. */
export function useTema() {
  const [tema, setTema] = useState<Tema>(inicial)

  useEffect(() => {
    document.documentElement.dataset.theme = tema === "oscuro" ? "dark" : "light"
    localStorage.setItem(CLAVE, tema)
  }, [tema])

  return { tema, alternar: () => setTema((t) => (t === "oscuro" ? "claro" : "oscuro")) }
}
