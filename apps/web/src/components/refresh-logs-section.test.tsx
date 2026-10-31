import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { LangProvider } from "@/lib/i18n";
import { RefreshLogsSection } from "@/components/refresh-logs-section";
import type { RefreshLogRun, RefreshLogsIndex } from "@/api";

vi.mock("@/api", () => ({
  fetchRefreshLogs: vi.fn(),
  fetchRefreshRunLog: vi.fn(),
  fetchRefreshSchedulerLog: vi.fn(),
}));

import {
  fetchRefreshLogs,
  fetchRefreshRunLog,
  fetchRefreshSchedulerLog,
} from "@/api";

const logsMock = vi.mocked(fetchRefreshLogs);
const runMock = vi.mocked(fetchRefreshRunLog);
const schedulerMock = vi.mocked(fetchRefreshSchedulerLog);

const summary = {
  file: "2026-10-30_21-37-39-091_manual.json",
  source: "manual",
  status: "ok" as const,
  startedAt: "2026-10-31T00:37:39.091Z",
  finishedAt: "2026-10-31T00:42:45.728Z",
  durationMs: 306637,
  error: null,
  warning: null,
};

const index: RefreshLogsIndex = {
  dir: "/app/apps/server/data/logs/refresh",
  status: {
    updatedAt: "2026-10-31T00:43:00.000Z",
    timezone: "America/Sao_Paulo",
    autoRefresh: true,
    slots: ["11:00"],
    quietHours: { start: "22:00", end: "10:30" },
    lastRun: summary,
    lastSuccessAt: "2026-10-31T00:42:45.728Z",
    lastDecision: "conteúdo já atualizado hoje",
  },
  runs: [summary],
  schedulerDays: ["2026-10-30"],
};

const run: RefreshLogRun = {
  ...summary,
  version: 1,
  timezone: "America/Sao_Paulo",
  localStartedAt: "2026-10-30 21:37:39",
  localFinishedAt: "2026-10-30 21:42:45",
  step: "Concluído",
  logExcerpt: "dump concluído",
  logTruncated: false,
};

function renderSection() {
  return render(
    <LangProvider>
      <RefreshLogsSection />
    </LangProvider>,
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  localStorage.setItem("pauta-lang", "pt");
  logsMock.mockResolvedValue(index);
  runMock.mockResolvedValue(run);
  schedulerMock.mockResolvedValue({
    date: "2026-10-30",
    timezone: "America/Sao_Paulo",
    events: [{ at: "2026-10-31T00:00:00.000Z", type: "app-start" }],
  });
});

afterEach(cleanup);

describe("RefreshLogsSection", () => {
  it("mostra o resumo e a última atualização em São Paulo", async () => {
    renderSection();

    expect(await screen.findByText("Última atualização")).toBeInTheDocument();
    expect(screen.getByText(/21:42/)).toBeInTheDocument();
    expect(screen.getByText("conteúdo já atualizado hoje")).toBeInTheDocument();
    expect(screen.getByText(/11:00/)).toBeInTheDocument();
  });

  it("abre o JSON de uma execução", async () => {
    renderSection();

    const row = await screen.findByText(/manual · 5m 7s/);
    fireEvent.click(row);

    expect(await screen.findByText("Trecho do log")).toBeInTheDocument();
    expect(screen.getByText("dump concluído")).toBeInTheDocument();
    expect(runMock).toHaveBeenCalledWith(summary.file);
  });

  it("mostra o estado vazio", async () => {
    logsMock.mockResolvedValue({
      dir: "/app/apps/server/data/logs/refresh",
      status: null,
      runs: [],
      schedulerDays: [],
    });

    renderSection();

    expect(await screen.findByText("Nenhuma atualização registrada ainda.")).toBeInTheDocument();
  });
});
