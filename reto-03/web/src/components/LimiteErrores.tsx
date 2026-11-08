import { Component, type ReactNode } from "react"

type Estado = { error: Error | null }

/** Evita la pantalla en blanco si un render falla: muestra el error y permite reiniciar la sesión local. */
export class LimiteErrores extends Component<{ children: ReactNode }, Estado> {
  override state: Estado = { error: null }

  static getDerivedStateFromError(error: Error): Estado {
    return { error }
  }

  private reiniciar = () => {
    localStorage.removeItem("oc-sap-chat")
    window.location.reload()
  }

  override render() {
    if (!this.state.error) return this.props.children
    return (
      <div className="fallo-app" role="alert">
        <h2>Algo falló al mostrar la conversación</h2>
        <p>{this.state.error.message}</p>
        <button type="button" className="primario" onClick={this.reiniciar}>
          Reiniciar sesión
        </button>
      </div>
    )
  }
}
