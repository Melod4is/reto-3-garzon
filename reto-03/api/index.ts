// Entrada de Vercel (Node.js runtime). vercel.json reescribe /api/* hacia esta función.
import { handle } from "hono/vercel"
import { crearAppDesdeEnv } from "../src/bootstrap"

const app = crearAppDesdeEnv()

export const GET = handle(app)
export const POST = handle(app)
