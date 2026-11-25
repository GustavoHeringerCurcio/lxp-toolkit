import { spawn, type ChildProcess, type SpawnOptions } from "node:child_process";

const isWindows = process.platform === "win32";

/** Quote an argument for cmd.exe when the command must go through a shell. */
function quoteForCmd(arg: string): string {
  if (arg === "") return '""';
  return /[\s"&|<>^()%!]/.test(arg) ? `"${arg.replace(/"/g, '""')}"` : arg;
}

/**
 * Spawn a command that may be a Windows `.cmd`/`.bat` shim (`npm.cmd`, `tsx.cmd`).
 *
 * Node refuses to spawn those without a shell (CVE-2024-27980), which surfaces as
 * `spawn EINVAL`. On Windows we therefore run through the shell and quote every
 * argument; on other platforms we spawn directly.
 */
export function spawnCommand(
  command: string,
  args: string[],
  options: SpawnOptions = {},
): ChildProcess {
  if (!isWindows) return spawn(command, args, options);
  const line = [command, ...args].map(quoteForCmd).join(" ");
  return spawn(line, { ...options, shell: true });
}

/**
 * Kill a child process and its descendants. `npm.cmd`/`tsx` spawn grandchildren
 * (Playwright/Chromium, tsc), so killing only the shell leaves an orphan that
 * keeps the refresh "running" forever.
 */
export function killProcessTree(child: ChildProcess): void {
  if (!child.pid) {
    try {
      child.kill("SIGKILL");
    } catch {
      /* already gone */
    }
    return;
  }
  if (isWindows) {
    try {
      spawn("taskkill", ["/PID", String(child.pid), "/T", "/F"], {
        stdio: "ignore",
        windowsHide: true,
      });
      return;
    } catch {
      /* fall through to child.kill */
    }
  }
  try {
    child.kill("SIGTERM");
  } catch {
    /* already gone */
  }
  setTimeout(() => {
    try {
      child.kill("SIGKILL");
    } catch {
      /* already gone */
    }
  }, 10_000).unref?.();
}
