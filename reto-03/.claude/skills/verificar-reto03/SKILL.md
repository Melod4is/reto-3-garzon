---
name: verificar-reto03
description: Verificación obligatoria del Reto 03 (agente de Órdenes de Compra SAP). Úsala SIEMPRE después de cualquier cambio en src/, tests/, agent/, web/, modulo/, scripts/, demo.ts, package.json o tsconfig.json, y antes de declarar una tarea terminada, hacer commit o desplegar.
---

# Verificar Reto 03

La fuente única de esta skill es `.cursor/skills/verificar-reto03/SKILL.md` (compartida con Cursor para que no diverjan). Léela y sigue sus pasos.

Resumen: ejecuta `bun run verify` desde `reto-03/`; si falla, corrige el código de producción (nunca relajes tests ni toques `fixtures/`) y repite hasta verde.
