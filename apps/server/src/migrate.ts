import { closePool, healthCheck, runMigrations } from "./db.js";

/** `npm run db:migrate` — connect, then apply pending migrations. */
async function main(): Promise<void> {
  await healthCheck();
  const applied = await runMigrations();
  if (applied.length === 0) {
    console.log("db: schema já está atualizado (nenhuma migração pendente).");
  } else {
    console.log(`db: aplicadas ${applied.length} migração(ões): ${applied.join(", ")}`);
  }
}

main()
  .catch((err) => {
    console.error(`db: ${err instanceof Error ? err.message : String(err)}`);
    process.exitCode = 1;
  })
  .finally(() => closePool());
