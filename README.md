# Reto 03 · Agente de Órdenes de Compra SAP

Agente conversacional que lee el paquete de una solicitud de compra (solicitud, cotización, aprobación y factura opcional), lo valida contra los maestros con las reglas RC1–RC10, arma la OC tal como quedaría en SAP y la crea en un SAP simulado **solo** cuando todo está en orden o cuando la analista confirma las excepciones (human-in-the-loop).

- **Link de prueba:** [llm-chatbot-assessment.vercel.app](https://llm-chatbot-assessment.vercel.app). Si hay clave de acceso, el front la pide la primera vez. Las URLs propias de cada deploy (`llm-chatbot-assessment-<hash>-….vercel.app`) exigen login de Vercel; comparte siempre el dominio público.
- **Decisiones, arquitectura y trade-offs:** ver [`SOLUCION.md`](SOLUCION.md).

## Requisitos

- [Bun](https://bun.sh) 1.3 o superior. Es el único requisito: no hace falta Node.
- Una clave de OpenAI para el chat. `demo.ts` y los tests **no** la necesitan.

## Arranque en local (un comando)

```bash
cp .env.example .env      # completa OPENAI_API_KEY
bun install
bun run dev               # backend en :3000 y front en http://localhost:5173
```

Alternativa sin hot reload: `bun run start`, que compila el front y sirve todo en http://localhost:3000.

Sin `OPENAI_API_KEY` la app arranca igual. El chat responde con un aviso de configuración y la sesión sigue viva.

## Variables de entorno

Todas son opcionales salvo la clave. Bun carga `.env` automáticamente.

| Variable | Default | Para qué |
|---|---|---|
| `OPENAI_API_KEY` | — | Clave del modelo. Solo la lee el backend. |
| `LLM_MODEL` | `gpt-4.1-mini` | Modelo. |
| `LLM_PROVIDER` | `openai` | Nombre informativo que devuelve `/api/health`. |
| `LLM_BASE_URL` / `LLM_API_KEY` | — | Cualquier endpoint compatible con OpenAI (Azure, OpenRouter, Groq, Ollama…). |
| `LLM_TIMEOUT_MS` | `30000` | Timeout por llamada al modelo. |
| `MAX_ITERACIONES` | `25` | Tope de llamadas al modelo por turno. |
| `MAX_TOKENS_SESION` | `150000` | Tope de tokens por sesión. |
| `MAX_LONGITUD_MENSAJE` | `2000` | Largo máximo del mensaje del usuario. |
| `SESSION_SECRET` | aleatorio por proceso | Firma HMAC del estado de sesión. **Obligatoria en Vercel.** |
| `ACCESS_KEY` | — | Si se define, la API exige el header `x-access-key`. |
| `OUT_DIR` | `out/` (`/tmp/out` en Vercel) | Carpeta de salida. |
| `PROJECT_ROOT` | directorio actual | Raíz que contiene `fixtures/` y `agent/`. |
| `PORT` | `3000` | Puerto del backend local. |

## Demo sin modelo

```bash
bun run demo
```

Limpia `out/` y ejecuta las herramientas directamente, sin LLM, sobre `sol-001` a `sol-006`. Para cada caso imprime bloqueos, confirmaciones, derivados, la marca retroactiva y el número de OC o el motivo por el que no se creó. También prueba la idempotencia (sol-001 dos veces) y la confirmación (sol-004 sin y con `confirmado: true`). Dos ejecuciones seguidas dan la misma salida.

Salidas en `out/`:

| Archivo | Contenido |
|---|---|
| `sap/ordenes.jsonl` | OCs creadas en el SAP simulado (desde `4500000001`). |
| `control.csv` | Una fila por intento de creación: `creada`, `bloqueado` o `pendiente`, más la marca `retroactiva`. |
| `<caso>/aprobacion.txt` y `.pdf` | Evidencia de la aprobación y su SHA-256. |
| `<caso>/trazabilidad.json` | De qué fuente salió cada campo de la OC. |
| `log.jsonl` | Llamadas a herramientas y errores del agente, sin secretos. |
| `sessions/<id>.json` | Memoria de cada conversación. |

## Verificación

```bash
bun run verify
```

Ejecuta, en orden: tipos (`tsc --noEmit`), tests (`bun test`), demo determinista, búsqueda de secretos, ausencia de `any` y de shell en las herramientas, y la sincronía de `modulo/`. Los hooks de Cursor y Claude Code lo corren solos después de cada cambio de código (ver `.cursor/skills/verificar-reto03`).

## API

| Método | Ruta | Respuesta |
|---|---|---|
| `GET` | `/api/health` | `{ ok, provider, model }` |
| `POST` | `/api/chat` | `{ reply, toolCalls[], needsConfirmation, pendiente, estado }` |
| `GET` | `/api/sessions/:id` | Historial de la sesión en esta instancia, o 404. |

Body de `POST /api/chat`:

```json
{ "sessionId": "abc-123", "message": "Procesa la solicitud sol-004", "decision": "aprobar", "estado": "<token>" }
```

- Hace falta `message` o `decision`. Un body inválido devuelve 400 con `{ error }`, nunca 500.
- `decision` (`aprobar` o `rechazar`) es la respuesta explícita a una confirmación pendiente. Es lo que envían los botones del front.
- `estado` es el token firmado que devolvió el turno anterior. Permite continuar la conversación en otra instancia serverless.
- `toolCalls[]` trae `{ nombre, args, resultado, ok, ms }` por cada herramienta usada.

**Impacto en el contrato:** `decision`, `estado` y `pendiente` son campos **aditivos**. Un cliente que solo envía `{ sessionId, message }` y lee `{ reply, toolCalls, needsConfirmation }` funciona exactamente como pide el PRD.

## Despliegue en Vercel

`vercel.json` ya define el runtime Bun, el build del front, el rewrite de `/api/*` y los archivos que se empaquetan con la función (`fixtures/`, `agent/`, `src/knowledge/`).

```bash
bunx vercel login
bunx vercel link
bunx vercel env add OPENAI_API_KEY
bunx vercel env add SESSION_SECRET      # 32+ caracteres aleatorios
bunx vercel env add ACCESS_KEY          # opcional
bunx vercel --prod
```

En Vercel, `out/` vive en `/tmp`, que es **efímero y propio de cada instancia**. Las OCs, evidencias y logs sirven para la demo, no como registro permanente. La conversación no se pierde: el front reenvía el estado firmado en cada turno. Ver *Decisiones* en `SOLUCION.md`.

Prueba de humo en el link (PRD 11): en una sesión nueva escribe *Procesa la solicitud "sol-004". Muéstrame la OC como quedaría en SAP, qué validaciones pasó y cuáles no, y no la crees hasta que yo lo confirme.* Luego pulsa **Aprobar y crear OC**.

## Estructura

```
src/lib/        normalización, esquemas zod, reglas RC1-RC10, payload, evidencia, control
src/tools/      herramientas oc_* (contrato del PRD 6.2)
src/sap/        SapAdapter y SapMock
src/agent/      loop propio, HITL, sesión, estado firmado, registro de herramientas, log
src/llm/        LlmAdapter y OpenAiLlm
src/server.ts   API Hono · src/dev.ts servidor local · api/index.ts función Vercel
agent/          system prompt · src/knowledge/ conocimiento del proceso
web/            React + Vite
modulo/         agente empaquetado (bonus 9.4), generado con `bun run modulo`
tests/          bun test con FakeLlm, sin red
```
