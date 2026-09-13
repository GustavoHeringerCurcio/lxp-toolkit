import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { LangProvider } from "@/lib/i18n";
import {
  ContentRefreshBanner,
  ContentRefreshButton,
  useContentRefresh,
} from "@/components/content-refresh";
import type { RefreshStatus } from "@/api";

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
