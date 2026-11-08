// `bun run dev`: backend con recarga (puerto 3000) + Vite (puerto 5173, proxy de /api al backend).
export {}

const procesos = [
  Bun.spawn([process.execPath, "--watch", "src/dev.ts"], { stdout: "inherit", stderr: "inherit" }),
  Bun.spawn([process.execPath, "--bun", "x", "vite", "--config", "web/vite.config.ts"], { stdout: "inherit", stderr: "inherit" }),
]

const detener = () => {
  for (const p of procesos) p.kill()
  process.exit(0)
}
process.on("SIGINT", detener)
process.on("SIGTERM", detener)

await Promise.race(procesos.map((p) => p.exited))
detener()
