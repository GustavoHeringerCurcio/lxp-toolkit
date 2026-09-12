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
