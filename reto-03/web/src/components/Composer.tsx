import { type FormEvent, type KeyboardEvent, useEffect, useRef, useState } from "react"
import { IconoFlechaArriba } from "./Iconos"

type Props = { deshabilitado: boolean; onEnviar: (texto: string) => void }

const ALTO_MAXIMO = 200

export function Composer({ deshabilitado, onEnviar }: Props) {
  const [texto, setTexto] = useState("")
  const area = useRef<HTMLTextAreaElement>(null)

  useEffect(() => {
    const el = area.current
    if (!el) return
    el.style.height = "auto"
    el.style.height = `${Math.min(el.scrollHeight, ALTO_MAXIMO)}px`
  }, [texto])

  const enviar = (e?: FormEvent) => {
    e?.preventDefault()
    const limpio = texto.trim()
    if (!limpio || deshabilitado) return
    onEnviar(limpio)
    setTexto("")
  }

  const alTeclear = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) enviar(e)
  }

  return (
    <form className="composer" onSubmit={enviar}>
      <textarea
        ref={area}
        value={texto}
        onChange={(e) => setTexto(e.target.value)}
        onKeyDown={alTeclear}
        placeholder="Pide procesar una solicitud, por ejemplo sol-004"
        rows={1}
        maxLength={2000}
        aria-label="Mensaje para el agente"
      />
      <button type="submit" className="enviar" disabled={deshabilitado || !texto.trim()} aria-label="Enviar mensaje">
        <IconoFlechaArriba tamano={18} />
      </button>
    </form>
  )
}
