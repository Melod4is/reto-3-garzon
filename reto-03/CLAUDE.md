# Reto 03 · Agente conversacional "Órdenes de Compra SAP"

Fuente de verdad: `PRD.md`. Las reglas del proyecto viven en `.cursor/rules/` y se comparten con Cursor; no dupliques su contenido aquí.

Responde siempre en español.

## Reglas (importadas)
@.cursor/rules/00-proyecto.mdc
@.cursor/rules/10-herramientas.mdc
@.cursor/rules/20-controles-rc.mdc
@.cursor/rules/30-agente-llm.mdc
@.cursor/rules/40-pruebas.mdc

## Obligatorio al cambiar código
Usa la skill `verificar-reto03` (`bun run verify`). El hook `Stop` de `.claude/settings.json` la ejecuta si editaste código y bloquea el cierre del turno mientras falle.

## Comandos
| Acción | Comando |
|---|---|
| Instalar | `bun install` |
| Verificación completa | `bun run verify` |
| Tests | `bun test` · `bun test -t "RC5"` |
| Tipos | `bun run typecheck` |
| Demo sin modelo | `bun run demo.ts` |
