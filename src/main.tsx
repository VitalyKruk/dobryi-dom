import { StrictMode } from "react"
import { createRoot } from "react-dom/client"
import { z } from "zod"
import "./index.css"
import App from "./App.tsx"
import { installErrorReporting } from "./lib/report-error"

// Без пробы `new Function`: Content-Security-Policy (nginx.conf) запрещает eval, и браузер отмечал бы её как нарушение
z.config({ jitless: true })

// До первого рендера — чтобы поймать и ошибки при запуске
installErrorReporting()

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
