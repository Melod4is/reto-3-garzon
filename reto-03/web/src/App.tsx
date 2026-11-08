import { useCallback, useEffect, useState } from "react"
import { consultarSalud } from "./api"
import { Composer } from "./components/Composer"
import { ConfirmationBanner } from "./components/ConfirmationBanner"
import { IconoLuna, IconoMas, IconoSol } from "./components/Iconos"
import { MessageList } from "./components/MessageList"
import { useTema } from "./tema"
import type { Salud } from "./tipos"
import { useChat } from "./useChat"

const CLAVE_ACCESO = "oc-sap-access-key"

export function App() {
  const [accessKey, setAccessKey] = useState(() => localStorage.getItem(CLAVE_ACCESO) ?? "")
  const [pideClave, setPideClave] = useState(false)
  const [salud, setSalud] = useState<Salud | null>(null)
  const { tema, alternar } = useTema()

  const onAccesoDenegado = useCallback(() => setPideClave(true), [])
  const chat = useChat(accessKey, onAccesoDenegado)

  useEffect(() => {
    consultarSalud(accessKey).then(setSalud).catch(() => setSalud(null))
  }, [accessKey])

  const guardarClave = (clave: string) => {
    localStorage.setItem(CLAVE_ACCESO, clave)
    setAccessKey(clave)
    setPideClave(false)
  }

  const botonTema = (
    <button type="button" className="icono" onClick={alternar} aria-label={tema === "oscuro" ? "Cambiar a modo claro" : "Cambiar a modo oscuro"}>
      {tema === "oscuro" ? <IconoSol /> : <IconoLuna />}
    </button>
  )

  return (
    <div className="app">
      <div className="principal">
        <header className="barra">
          <h1>Agente de Órdenes de Compra SAP</h1>
          <span className={`estado ${salud ? "en-linea" : ""}`}>{salud ? `${salud.provider} · ${salud.model}` : "Backend no disponible"}</span>
          <button type="button" className="nuevo" onClick={chat.reiniciar} disabled={chat.pensando}>
            <IconoMas tamano={16} /> Nueva sesión
          </button>
          {botonTema}
        </header>

        {pideClave && (
          <form
            className="clave"
            onSubmit={(e) => {
              e.preventDefault()
              guardarClave(String(new FormData(e.currentTarget).get("clave") ?? ""))
            }}
          >
            <label>
              Clave de acceso
              <input name="clave" type="password" autoFocus />
            </label>
            <button type="submit" className="primario">
              Guardar
            </button>
          </form>
        )}

        <main>
          <div className="columna">
            <MessageList mensajes={chat.mensajes} pensandoDesde={chat.pensandoDesde} onSugerencia={chat.enviarMensaje} accessKey={accessKey} />
          </div>
        </main>

        <footer>
          <div className="columna">
            {chat.pendiente && <ConfirmationBanner pendiente={chat.pendiente} deshabilitado={chat.pensando} onDecidir={chat.decidir} />}
            <Composer deshabilitado={chat.pensando} onEnviar={chat.enviarMensaje} />
            <p className="aviso">El agente puede equivocarse al redactar; los montos y validaciones salen de las herramientas.</p>
          </div>
        </footer>
      </div>
    </div>
  )
}
