import { StrictMode } from "react"
import { createRoot } from "react-dom/client"
import { App } from "./App"
import { LimiteErrores } from "./components/LimiteErrores"
import "./styles.css"

const raiz = document.getElementById("root")
if (raiz) {
  createRoot(raiz).render(
    <StrictMode>
      <LimiteErrores>
        <App />
      </LimiteErrores>
    </StrictMode>,
  )
}
