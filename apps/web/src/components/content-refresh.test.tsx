import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { LangProvider } from "@/lib/i18n";
import {
  ContentRefreshBanner,
  ContentRefreshButton,
  LastRefresh,
  formatLastRefresh,
  useContentRefresh,
} from "@/components/content-refresh";
import type { RefreshScheduleStatus, RefreshStatus } from "@/api";

vi.mock("@/api", () => ({
  startContentRefresh: vi.fn(),
  fetchRefreshStatus: vi.fn(),
}));

import { startContentRefresh, fetchRefreshStatus } from "@/api";

const startMock = vi.mocked(startContentRefresh);
const statusMock = vi.mocked(fetchRefreshStatus);

function status(over: Partial<RefreshStatus> = {}): RefreshStatus {
  return {
    running: false,
    step: "",
    error: null,
    startedAt: null,
    finishedAt: null,
    ...over,
  };
}

function schedule(over: Partial<RefreshScheduleStatus> = {}): RefreshScheduleStatus {
  return {
    enabled: true,
    slots: ["11:00"],
    timezone: "America/Sao_Paulo",
    quietHours: { start: "22:00", end: "10:30" },
    bootDelaySeconds: 120,
    lastCheckAt: null,
    lastSuccessAt: null,
    nextSlot: "11:00",
    lastDecision: null,
    ...over,
  };
}

function Harness({ onDone }: { onDone: () => void }) {
  const { state, start } = useContentRefresh(onDone);
  return (
    <div>
      <span data-testid="running">{String(state.running)}</span>
      <span data-testid="step">{state.step}</span>
      <span data-testid="error">{state.error ?? ""}</span>
      <button onClick={start}>go</button>
    </div>
  );
}

function renderHarness(onDone: () => void = () => {}) {
  return render(
    <LangProvider>
      <Harness onDone={onDone} />
    </LangProvider>,
  );
}

describe("useContentRefresh", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.setItem("pauta-lang", "pt");
    vi.useFakeTimers();
  });

  afterEach(() => {
    cleanup();
    vi.useRealTimers();
  });

  it("inicia, acompanha o progresso e chama onDone ao terminar", async () => {
    statusMock
      .mockResolvedValueOnce(status())
      .mockResolvedValueOnce(status({ running: true, step: "Buscando conteúdo novo no portal" }))
      .mockResolvedValueOnce(status({ running: false, step: "Concluído" }));
    startMock.mockResolvedValue(undefined);
    const onDone = vi.fn();

    renderHarness(onDone);
    await act(async () => {});
    fireEvent.click(screen.getByText("go"));
    await act(async () => {});

    await act(async () => {
      await vi.advanceTimersByTimeAsync(1500);
    });
    expect(screen.getByTestId("running").textContent).toBe("true");
    expect(screen.getByTestId("step").textContent).toBe("Buscando conteúdo novo no portal");

    await act(async () => {
      await vi.advanceTimersByTimeAsync(1500);
    });
    expect(screen.getByTestId("running").textContent).toBe("false");
    expect(onDone).toHaveBeenCalledTimes(1);
  });

  it("não chama onDone quando o status traz erro", async () => {
    statusMock
      .mockResolvedValueOnce(status())
      .mockResolvedValueOnce(status({ running: false, error: "sem credenciais", step: "Falhou" }));
    startMock.mockResolvedValue(undefined);
    const onDone = vi.fn();

    renderHarness(onDone);
    await act(async () => {});
    fireEvent.click(screen.getByText("go"));
    await act(async () => {});
    await act(async () => {
      await vi.advanceTimersByTimeAsync(1500);
    });

    expect(screen.getByTestId("error").textContent).toBe("sem credenciais");
    expect(onDone).not.toHaveBeenCalled();
  });

  it("mostra o erro quando o start falha", async () => {
    statusMock.mockResolvedValueOnce(status());
    startMock.mockRejectedValueOnce(new Error("boom"));
    const onDone = vi.fn();

    renderHarness(onDone);
    await act(async () => {});
    fireEvent.click(screen.getByText("go"));
    await act(async () => {});

    expect(screen.getByTestId("error").textContent).toContain("boom");
    expect(onDone).not.toHaveBeenCalled();
  });

  it("retoma o acompanhamento quando já existe uma execução no servidor", async () => {
    statusMock
      .mockResolvedValueOnce(status({ running: true, step: "Buscando conteúdo novo no portal" }))
      .mockResolvedValueOnce(status({ running: false, step: "Concluído" }));
    const onDone = vi.fn();

    renderHarness(onDone);
    await act(async () => {});
    expect(screen.getByTestId("running").textContent).toBe("true");

    await act(async () => {
      await vi.advanceTimersByTimeAsync(1500);
    });
    expect(onDone).toHaveBeenCalledTimes(1);
  });

  it("captura falha de rede durante o polling", async () => {
    statusMock.mockResolvedValueOnce(status());
    statusMock.mockRejectedValueOnce(new Error("offline"));
    startMock.mockResolvedValue(undefined);
    const onDone = vi.fn();

    renderHarness(onDone);
    await act(async () => {});
    fireEvent.click(screen.getByText("go"));
    await act(async () => {});
    await act(async () => {
      await vi.advanceTimersByTimeAsync(1500);
    });

    expect(screen.getByTestId("error").textContent).toBe("offline");
    expect(onDone).not.toHaveBeenCalled();
  });

  it("recarrega quando um refresh de fundo termina entre polls", async () => {
    statusMock
      .mockResolvedValueOnce(status({ lastSuccessAt: "2026-10-30T10:00:00.000Z" }))
      .mockResolvedValueOnce(status({ lastSuccessAt: "2026-10-30T11:00:00.000Z" }))
      .mockResolvedValue(status({ lastSuccessAt: "2026-10-30T11:00:00.000Z" }));
    const onDone = vi.fn();

    renderHarness(onDone);
    await act(async () => {});

    await act(async () => {
      await vi.advanceTimersByTimeAsync(60_000);
    });
    expect(onDone).toHaveBeenCalledTimes(1);

    await act(async () => {
      await vi.advanceTimersByTimeAsync(60_000);
    });
    expect(onDone).toHaveBeenCalledTimes(1);
  });

  it("adota um refresh de fundo e recarrega ao terminar", async () => {
    statusMock
      .mockResolvedValueOnce(status({ lastSuccessAt: "2026-10-30T10:00:00.000Z" }))
      .mockResolvedValueOnce(
        status({ running: true, step: "Buscando", lastSuccessAt: "2026-10-30T10:00:00.000Z" }),
      )
      .mockResolvedValueOnce(
        status({ running: true, step: "Buscando", lastSuccessAt: "2026-10-30T10:00:00.000Z" }),
      )
      .mockResolvedValueOnce(
        status({ running: false, step: "Concluído", lastSuccessAt: "2026-10-30T11:00:00.000Z" }),
      );
    const onDone = vi.fn();

    renderHarness(onDone);
    await act(async () => {});
    await act(async () => {
      await vi.advanceTimersByTimeAsync(60_000);
    });

    expect(screen.getByTestId("running").textContent).toBe("true");
    expect(screen.getByTestId("step").textContent).toBe("Buscando");

    await act(async () => {
      await vi.advanceTimersByTimeAsync(3_000);
    });
    expect(onDone).toHaveBeenCalledTimes(1);
    expect(screen.getByTestId("running").textContent).toBe("false");
  });

  it("não recarrega de novo depois de um refresh manual", async () => {
    statusMock
      .mockResolvedValueOnce(status({ lastSuccessAt: "2026-10-30T10:00:00.000Z" }))
      .mockResolvedValueOnce(status({ running: true }))
      .mockResolvedValueOnce(
        status({ running: false, lastSuccessAt: "2026-10-30T11:00:00.000Z" }),
      )
      .mockResolvedValue(status({ running: false, lastSuccessAt: "2026-10-30T11:00:00.000Z" }));
    startMock.mockResolvedValue(undefined);
    const onDone = vi.fn();

    renderHarness(onDone);
    await act(async () => {});
    fireEvent.click(screen.getByText("go"));
    await act(async () => {});
    await act(async () => {
      await vi.advanceTimersByTimeAsync(3_000);
    });
    expect(onDone).toHaveBeenCalledTimes(1);

    await act(async () => {
      await vi.advanceTimersByTimeAsync(60_000);
    });
    expect(onDone).toHaveBeenCalledTimes(1);
  });
});

describe("ContentRefreshButton", () => {
  afterEach(cleanup);

  it("fica desabilitado e com rótulo 'Atualizando…' durante a execução", () => {
    const { rerender } = render(
      <LangProvider>
        <ContentRefreshButton state={status({ running: true })} onStart={() => {}} />
      </LangProvider>,
    );
    expect(screen.getByRole("button")).toBeDisabled();
    expect(screen.getByText("Atualizando…")).toBeInTheDocument();

    rerender(
      <LangProvider>
        <ContentRefreshButton state={status()} onStart={() => {}} />
      </LangProvider>,
    );
    expect(screen.getByRole("button")).toBeEnabled();
    expect(screen.getByText("Atualizar")).toBeInTheDocument();
  });

  it("mostra o horário automático e a última atualização no título", () => {
    render(
      <LangProvider>
        <ContentRefreshButton
          state={status({
            auto: schedule({ slots: ["11:00", "18:00"] }),
            lastSuccessAt: "2026-10-30T11:00:00.000Z",
          })}
          onStart={() => {}}
        />
      </LangProvider>,
    );

    expect(screen.getByRole("button").getAttribute("title")).toContain("11:00, 18:00");
  });
});

describe("formatLastRefresh", () => {
  it("converte UTC para o fuso de São Paulo", () => {
    const formatted = formatLastRefresh("2026-10-31T00:42:45.728Z", "pt-BR");
    expect(formatted).toContain("30/10/2026");
    expect(formatted).toContain("21:42");
  });

  it("retorna null para ausente ou inválido", () => {
    expect(formatLastRefresh(null, "pt-BR")).toBeNull();
    expect(formatLastRefresh("not-a-date", "pt-BR")).toBeNull();
  });
});

describe("LastRefresh", () => {
  afterEach(cleanup);

  it("mostra a última atualização no fuso de São Paulo", () => {
    localStorage.setItem("pauta-lang", "pt");
    render(
      <LangProvider>
        <LastRefresh
          state={status({
            auto: schedule(),
            lastSuccessAt: "2026-10-31T00:42:45.728Z",
          })}
        />
      </LangProvider>,
    );

    const label = screen.getByText(/Atualizado:/);
    expect(label.textContent).toContain("30/10/2026");
    expect(label.textContent).toContain("21:42");
    expect(label.getAttribute("title")).toContain("America/Sao_Paulo");
  });
});

describe("ContentRefreshBanner", () => {
  afterEach(cleanup);

  it("some quando ocioso", () => {
    render(
      <LangProvider>
        <ContentRefreshBanner state={status()} />
      </LangProvider>,
    );
    expect(screen.queryByRole("status")).toBeNull();
  });

  it("mostra o passo em andamento", () => {
    render(
      <LangProvider>
        <ContentRefreshBanner
          state={status({ running: true, step: "Buscando conteúdo novo no portal" })}
        />
      </LangProvider>,
    );
    expect(screen.getByRole("status")).toBeInTheDocument();
  });

  it("mostra a mensagem de erro", () => {
    render(
      <LangProvider>
        <ContentRefreshBanner state={status({ error: "sem credenciais" })} />
      </LangProvider>,
    );
    expect(screen.getByRole("status")).toHaveTextContent("Falha ao atualizar: sem credenciais");
  });
});
