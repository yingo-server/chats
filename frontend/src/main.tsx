import { StrictMode } from "react"
import { createRoot } from "react-dom/client"
import App from "./App"
import "./index.css"

window.addEventListener("contextmenu", (e) => e.preventDefault())
window.addEventListener("selectstart", (e) => e.preventDefault())
window.addEventListener("dragstart", (e) => e.preventDefault())
window.addEventListener("auxclick", (e) => e.preventDefault())
window.addEventListener("mousedown", (e) => {
  if (e.button === 3 || e.button === 4) e.preventDefault()
})

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <App />
  </StrictMode>
)
