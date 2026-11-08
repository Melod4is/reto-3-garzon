import type { ReactNode, SVGProps } from "react"

type Props = SVGProps<SVGSVGElement> & { tamano?: number }

function Icono({ tamano = 18, children, ...resto }: Props & { children: ReactNode }) {
  return (
    <svg
      width={tamano}
      height={tamano}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.8}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      {...resto}
    >
      {children}
    </svg>
  )
}

export const IconoMas = (p: Props) => (
  <Icono {...p}>
    <path d="M12 5v14M5 12h14" />
  </Icono>
)

export const IconoSol = (p: Props) => (
  <Icono {...p}>
    <circle cx="12" cy="12" r="4" />
    <path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" />
  </Icono>
)

export const IconoLuna = (p: Props) => (
  <Icono {...p}>
    <path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8z" />
  </Icono>
)

export const IconoFlechaArriba = (p: Props) => (
  <Icono {...p}>
    <path d="M12 19V5M5 12l7-7 7 7" />
  </Icono>
)

export const IconoChevron = (p: Props) => (
  <Icono {...p}>
    <path d="m6 9 6 6 6-6" />
  </Icono>
)

export const IconoCheck = (p: Props) => (
  <Icono {...p}>
    <path d="M20 6 9 17l-5-5" />
  </Icono>
)

export const IconoX = (p: Props) => (
  <Icono {...p}>
    <path d="M18 6 6 18M6 6l12 12" />
  </Icono>
)

export const IconoAlerta = (p: Props) => (
  <Icono {...p}>
    <path d="M10.3 3.9 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0z" />
    <path d="M12 9v4M12 17h.01" />
  </Icono>
)

export const IconoDescarga = (p: Props) => (
  <Icono {...p}>
    <path d="M12 3v12M7 10l5 5 5-5M5 21h14" />
  </Icono>
)

export const IconoDocumento = (p: Props) => (
  <Icono {...p}>
    <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
    <path d="M14 2v6h6M8 13h8M8 17h5" />
  </Icono>
)
