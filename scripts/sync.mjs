// Full data refresh: `npm run sync`
//
// Runs the whole pipeline so a fresh start always has fresh content:
//   1. start Postgres (Docker, idempotent) and wait until it accepts connections
//   2. apply migrations
//   3. scrape the portal (`npm run dump`) — retries once headful on reCAPTCHA
//   4. rebuild the index (`npm run index:web`) → apps/server/data/exercises.json
//
// Hard-fail by design: any step that errors stops the run with an actionable
// message, so `npm run dev` / `npm run web` never serve stale content silently.
//
// Escape hatches:
//   SKIP_SYNC=1   skip this script entirely (boot without refreshing)
//   SKIP_DB=1     skip starting Postgres (assume it is already up)
//   SKIP_DUMP=1   skip the portal scrape (rebuild the local index only)
import {
  ROOT,
  c,
  log,
  ok,
  warn,
  bad,
  step,
  run,
  commandExists,
  dockerCompose,
} from "../setup/shared.mjs";

if (process.env.SKIP_SYNC === "1") {
  warn("SKIP_SYNC=1 — pulando a atualização de conteúdo.");
  process.exit(0);
}

const started = Date.now();

async function fail(message, detail = "") {
  bad(message);
  if (detail) log(c.dim(`  ${detail.split("\n").slice(-6).join("\n  ")}`));
  log("");
  process.exit(1);
}

log(`\n${c.bold("lxp-toolkit · sync")} ${c.dim("(banco → portal → índice)")}`);

// 1. Postgres (Docker, idempotent) -----------------------------------------
if (process.env.SKIP_DB === "1") {
  warn("SKIP_DB=1 — assumindo que o Postgres já está rodando.");
} else {
  step("Subindo o banco (Postgres)");
  if (!(await commandExists("docker", ["--version"]))) {
    warn("Docker não encontrado — assumindo que o Postgres já está rodando.");
  } else {
    const up = await dockerCompose(["up", "-d", "db"], { tee: true });
    if (up.code !== 0) await fail("Não foi possível subir o Postgres.", up.output);
    let ready = false;
    for (let i = 0; i < 30 && !ready; i++) {
      const probe = await dockerCompose(["exec", "-T", "db", "pg_isready", "-U", "lxp", "-d", "lxp"], {
        capture: true,
      });
      if (probe.code === 0) ready = true;
      else await new Promise((r) => setTimeout(r, 1000));
    }
    if (!ready) {
      await fail(
        "O Postgres não ficou pronto a tempo.",
        "Rode `npm run db:up` e `npm run doctor` para diagnosticar.",
      );
    }
    ok("Postgres pronto.");
  }
}

// 2. Migrations ------------------------------------------------------------
step("Aplicando as migrations");
const mig = await run("npm", ["run", "db:migrate"], { tee: true });
if (mig.code !== 0) await fail("As migrations falharam.", mig.output);
ok("Schema atualizado.");

// 3. Scrape the portal -----------------------------------------------------
if (process.env.SKIP_DUMP === "1") {
  warn("SKIP_DUMP=1 — pulando o scrape do portal (usando o conteúdo já salvo).");
} else {
  step("Buscando conteúdo novo no portal");
  let dump = await run("npm", ["run", "dump"], { tee: true });
  if (dump.code !== 0 && /reCAPTCHA|CaptchaRequiredError/i.test(dump.output)) {
    warn("O portal pediu reCAPTCHA — abrindo o navegador para você resolver…");
    dump = await run("npm", ["run", "dump"], { tee: true, env: { HEADFUL: "true" } });
  }
  if (dump.code !== 0) {
    await fail(
      "O scrape do portal falhou.",
      "Confira suas credenciais (packages/portal/.env) ou rode `HEADFUL=true npm run dump`.\n" +
        "Para iniciar sem atualizar, use SKIP_SYNC=1.",
    );
  }
  ok("Conteúdo atualizado.");
}

// 4. Rebuild the index -----------------------------------------------------
step("Montando a lista de atividades");
const index = await run("npm", ["run", "index:web"], { tee: true });
if (index.code !== 0) await fail("O index falhou.", index.output);

const secs = ((Date.now() - started) / 1000).toFixed(1);
log("");
ok(`Tudo atualizado em ${secs}s.`);
log("");
