import { EventEmitter } from "node:events";
import type { ChildProcess } from "node:child_process";
import { describe, expect, it, vi } from "vitest";
import { createRefreshController, type RefreshConfig } from "../src/refresh.js";

interface SpawnSpec {
  stdout?: string;
  stderr?: string;
  code?: number;
  error?: Error;
}

interface SpawnCall {
  command: string;
  args: string[];
  cwd?: string;
  env?: NodeJS.ProcessEnv;
}

/** Minimal ChildProcess stand-in: emits output + close on the next microtask. */
function createFakeSpawn(plan: SpawnSpec[]) {
  const calls: SpawnCall[] = [];
  let index = 0;
  const spawn: NonNullable<RefreshConfig["spawn"]> = (command, args, options = {}) => {
    const spec = plan[index++] ?? { code: 0 };
    calls.push({ command, args, cwd: options.cwd as string, env: options.env as NodeJS.ProcessEnv });
    const proc = new EventEmitter() as EventEmitter & { stdout: EventEmitter; stderr: EventEmitter };
    proc.stdout = new EventEmitter();
    proc.stderr = new EventEmitter();
    queueMicrotask(() => {
      if (spec.stdout) proc.stdout.emit("data", Buffer.from(spec.stdout));
      if (spec.stderr) proc.stderr.emit("data", Buffer.from(spec.stderr));
      if (spec.error) proc.emit("error", spec.error);
      else proc.emit("close", spec.code ?? 0);
    });
    return proc as unknown as ChildProcess;
  };
  return { spawn, calls };
}

function makeController(plan: SpawnSpec[]) {
  const { spawn, calls } = createFakeSpawn(plan);
  const controller = createRefreshController({
    repoRoot: "C:/repo",
    assistantDir: "C:/repo/apps/server",
    npm: "npm",
    env: {},
    spawn,
  });
  return { controller, calls };
}

describe("createRefreshController", () => {
  it("roda dump, dump-surfaces e os dois índices, nos diretórios certos", async () => {
    const { controller, calls } = makeController([{ code: 0 }, { code: 0 }, { code: 0 }, { code: 0 }]);

    await controller.run();

    expect(calls).toHaveLength(4);
    expect(calls[0]).toMatchObject({ command: "npm", args: ["run", "dump"], cwd: "C:/repo" });
    expect(calls[1]).toMatchObject({ command: "npm", args: ["run", "dump-surfaces"], cwd: "C:/repo" });
    expect(calls[2]).toMatchObject({ command: "npm", args: ["run", "index"], cwd: "C:/repo" });
    expect(calls[3]).toMatchObject({ command: "npm", args: ["run", "index:web"], cwd: "C:/repo" });
    const state = controller.status();
    expect(state.running).toBe(false);
    expect(state.error).toBeNull();
    expect(state.step).toBe("Concluído");
    expect(state.startedAt).toBeTruthy();
    expect(state.finishedAt).toBeTruthy();
  });

  it("start() é idempotente enquanto uma execução está em andamento", async () => {
    const { controller, calls } = makeController([{ code: 0 }, { code: 0 }, { code: 0 }, { code: 0 }]);

    const first = controller.start();
    const second = controller.start();

    expect(first).toBe(true);
    expect(second).toBe(false);
    await vi.waitFor(() => expect(controller.status().running).toBe(false));
    expect(calls).toHaveLength(4);
  });

  it("marca falha quando um passo sai com código diferente de zero", async () => {
    const { controller } = makeController([{ code: 1 }]);

    await controller.run();

    const state = controller.status();
    expect(state.running).toBe(false);
    expect(state.step).toBe("Falhou");
    expect(state.error).toMatch(/código 1/);
    expect(state.finishedAt).toBeTruthy();
  });

  it("recomeça headful quando o log do portal traz reCAPTCHA", async () => {
    const { controller, calls } = makeController([
      { stdout: "erro: reCAPTCHA exigido", code: 1 },
      { code: 0 },
      { code: 0 },
      { code: 0 },
      { code: 0 },
    ]);

    await controller.run();

    expect(calls).toHaveLength(5);
    expect(calls[0].args).toEqual(["run", "dump"]);
    expect(calls[0].env?.HEADFUL).toBeUndefined();
    expect(calls[1].args).toEqual(["run", "dump"]);
    expect(calls[1].env?.HEADFUL).toBe("true");
    expect(calls[2].args).toEqual(["run", "dump-surfaces"]);
    expect(calls[2].env?.HEADFUL).toBe("true");
    expect(calls[3].args).toEqual(["run", "index"]);
    expect(calls[4].args).toEqual(["run", "index:web"]);
    const state = controller.status();
    expect(state.error).toBeNull();
    expect(state.step).toBe("Concluído");
  });

  it("traduz credenciais ausentes em mensagem acionável", async () => {
    const { controller } = makeController([{ stderr: "no credentials found", code: 1 }]);

    await controller.run();

    expect(controller.status().error).toMatch(/Credenciais do portal ausentes/);
  });

  it("captura erro de spawn", async () => {
    const { controller } = makeController([{ error: new Error("spawn EINVAL") }]);

    await controller.run();

    const state = controller.status();
    expect(state.running).toBe(false);
    expect(state.step).toBe("Falhou");
    expect(state.error).toMatch(/spawn EINVAL/);
  });
});
