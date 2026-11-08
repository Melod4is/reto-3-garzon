---
name: verificar-reto03
description: Verificación obligatoria del Reto 03 (agente de Órdenes de Compra SAP). Úsala SIEMPRE después de cualquier cambio en src/, tests/, agent/, web/, modulo/, scripts/, demo.ts, package.json o tsconfig.json, y antes de declarar una tarea terminada, hacer commit o desplegar.
---

# Verificar Reto 03

Garantiza que cada ajuste de código mantiene los criterios de aceptación mínimos del PRD. No se termina una tarea con esta verificación en rojo.

## Pasos

1. Desde `reto-03/`, ejecuta:
   ```bash
   bun run verify
   ```
   Hace, en orden: `tsc --noEmit` → `bun test` → `demo.ts` dos veces comparando salida (sin timestamps) → escaneo de secretos, `any` y shell en herramientas.
2. Si falla, lee la sección **Interpretar fallos**, corrige el **código de producción** y repite el paso 1 hasta que esté en verde.
3. Si el cambio tocó `src/agent/`, `src/llm/`, `src/server.ts`, `agent/prompt.md` o `web/`, haz además la **prueba de humo** con el LLM real.
4. Reporta al usuario: pasos OK/FAIL, tests pasados/fallidos y, si aplica, el resultado de la prueba de humo.

Para iterar rápido sobre un archivo: `bun test tests/reglas.test.ts` o `bun test -t "RC5"`. Al final, siempre `bun run verify` completo.

## Interpretar fallos

| Falla | Causa típica | Dónde corregir |
|---|---|---|
| `tsc` | tipos, `any` implícito, import roto | archivo indicado |
| `normalizar.test.ts` | montos `COP 11.400.000`, NIT con DV, tildes, fechas con offset | `src/lib/normalizar.ts` |
| `reglas.test.ts` | una RC mal implementada o umbral disperso | `src/lib/reglas.ts` |
| `herramientas.test.ts` | `execute` lanza, falta `.describe()`, ruta absoluta, adjunto ausente lanza | `src/tools/oc.ts` |
| `casos.test.ts` | oráculo sol-001…sol-006, idempotencia, `control.csv`, trazabilidad, sha256 | `src/tools/oc.ts`, `src/sap/mock.ts` |
| `agente.test.ts` | tope de iteraciones, confirmación decidida por el modelo y no por el código, log, errores que matan la sesión | `src/agent/loop.ts` |
| `api.test.ts` | contrato HTTP, clave expuesta, 500 con body inválido, estado firmado (instancia fría, token alterado, copia local vieja) | `src/server.ts`, `src/agent/estado-firmado.ts` |
| `modulo.test.ts` / `modulo/ sincronizado` | se editó `agent/prompt.md` o `src/knowledge/` sin regenerar, o se editó `modulo/` a mano | ejecutar `bun run modulo` (nunca editar `modulo/` a mano) |
| demo no determinista | `out/` no se limpia, orden de iteración, numeración | `demo.ts`, `src/sap/mock.ts` |
| secreto / `any` / shell | clave en código o en `out/`, `as any`, `child_process` en tools | archivo indicado |

## Prohibido para "poner en verde"
- Borrar o relajar aserciones, `test.skip`, `test.todo`, `--bail` selectivo.
- Cambiar el oráculo de `.cursor/rules/20-controles-rc.mdc` o tocar `fixtures/`.
- Silenciar el escaneo de secretos.

Si un test contradice el PRD, cita la sección del PRD, ajusta el test y explícalo al usuario.

## Prueba de humo con LLM real (manual)
Con `.env` cargado y `bun run dev`:
1. `GET /api/health` → `{ ok: true, provider, model }` sin clave.
2. En el chat, sesión nueva: *Procesa la solicitud "sol-004". Muéstrame la OC como quedaría en SAP, qué validaciones pasó y cuáles no, y no la crees hasta que yo lo confirme.*
   Esperado: tool calls visibles, tabla del payload, RC5 con 25.000.000 vs 26.500.000, confirmación resaltada, turno cerrado con pregunta.
3. Responde `confirmo` → número de OC y ruta de evidencia.
4. `Procesa sol-002` → no crea OC; explica RC1 y qué pedir al solicitante.
5. Revisa `out/log.jsonl` y `out/control.csv`: las llamadas quedaron registradas y no aparece la clave.

## Requisitos
Bun ≥ 1.1 en el PATH (`powershell -c "irm bun.sh/install.ps1 | iex"` en Windows). Sin Bun, la verificación no puede correr: avisa al usuario en lugar de darla por buena.
