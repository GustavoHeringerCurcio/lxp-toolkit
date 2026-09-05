import { useCallback, useEffect, useMemo, useState } from "react";
import { fetchConfig, fetchExercises, generateAnswer, saveNote, type AiConfigDto } from "./api";
import type { Exercise } from "./types";
import "./styles.css";

/* ---------------- design helpers ---------------- */

const ACCENTS = [
  "#14b8a6", "#d946ef", "#f97316", "#84cc16",
  "#8b5cf6", "#ec4899", "#06b6d4", "#eab308",
];

function accentFor(prof: string | null): string {
  if (!prof) return "#64748b";
  let h = 0;
  for (const ch of prof) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  return ACCENTS[h % ACCENTS.length];
}

type Tone = "done" | "red" | "amber" | "blue" | "slate";

function deadline(e: Exercise): { label: string; cls: string; tone: Tone } {
  if (e.done) return { label: "concluída", cls: "d-done", tone: "done" };
  if (e.status === "expired") {
    const n = e.daysLeft == null ? 0 : Math.abs(e.daysLeft);
    return { label: n === 0 ? "atrasado" : `atrasado ${n}d`, cls: "d-red", tone: "red" };
  }
  if (e.daysLeft == null) return { label: "sem prazo", cls: "d-slate", tone: "slate" };
  if (e.daysLeft <= 1) {
    const label = e.daysLeft === 0 ? "vence hoje" : "vence amanhã";
    return { label, cls: "d-amber", tone: "amber" };
  }
  if (e.daysLeft <= 3) return { label: `vence em ${e.daysLeft}d`, cls: "d-amber", tone: "amber" };
  return { label: `vence em ${e.daysLeft}d`, cls: "d-blue", tone: "blue" };
}

function TypeChip({ kind }: { kind: Exercise["kind"] }) {
  return (
    <span className={`type-chip type-${kind}`}>
      {kind === "quiz" ? "❓ Quiz" : "📤 Tarefa"}
    </span>
  );
}

function DeadlineChip({ e }: { e: Exercise }) {
  const d = deadline(e);
  return (
    <span className={`d-chip ${d.cls}`} title={e.deadlineAt ?? "sem prazo definido"}>
      {d.label}
    </span>
  );
}

/** Professor color used as a CSS variable on a container. */
function accentStyle(prof: string | null): React.CSSProperties {
  return { "--acc": accentFor(prof) } as React.CSSProperties;
}

function Counts({ e }: { e: Exercise }) {
  if (e.kind === "quiz") return e.questions.length ? `${e.questions.length} questões` : "";
  const n = e.files.length;
  return n ? `${n} arquivo${n > 1 ? "s" : ""}` : "";
}

function cmp(a: Exercise, b: Exercise): number {
  const rank = (s: Exercise["status"]) => (s === "open" ? 0 : s === "expired" ? 1 : 2);
  const r = rank(a.status) - rank(b.status);
  if (r) return r;
  const da = a.daysLeft ?? Infinity;
  const db = b.daysLeft ?? Infinity;
  if (da !== db) return da - db;
  return a.title.localeCompare(b.title, "pt");
}

/* ---------------- list item ---------------- */

function Item({ e, selected, onClick }: { e: Exercise; selected: boolean; onClick: () => void }) {
  return (
    <div className={`item${selected ? " selected" : ""}`} style={accentStyle(e.professor)} onClick={onClick}>
      <div className="it-main">
        <span className="it-title">{e.title}</span>
        <span className="it-badges">
          <TypeChip kind={e.kind} />
          <DeadlineChip e={e} />
        </span>
      </div>
      <div className="it-sub">
        <span className="acc-chips">
          {e.professor && <span className="chip chip-acc">👤 {e.professor}</span>}
          <span className="chip chip-acc">{e.moduleName}</span>
        </span>
        <span className="it-counts">{Counts({ e })}</span>
      </div>
    </div>
  );
}

/* ---------------- detail ---------------- */

function Detail({ e, cfg, onNote, onReload }: { e: Exercise; cfg: AiConfigDto | null; onNote: (t: string) => void; onReload: () => void }) {
  const [notes, setNotes] = useState(e.notes);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => setNotes(e.notes), [e.notes]);

  const gen = async () => {
    setBusy(true);
    setErr(null);
    try {
      await generateAnswer(e.id);
      onReload();
    } catch (x) {
      setErr(x instanceof Error ? x.message : String(x));
    } finally {
      setBusy(false);
    }
  };

  const copy = async () => {
    if (e.answer) await navigator.clipboard.writeText(e.answer);
  };

  return (
    <div className="detail" style={accentStyle(e.professor)}>
      <div className="detail-accent" />
      <div className="detail-body">
        <div className="row">
          <TypeChip kind={e.kind} />
          <DeadlineChip e={e} />
          <span className="spacer" />
          <a className="btn-link" href={`https://unifoa2.grupoa.education/plataforma/course/${e.courseId}/content/${e.id}`} target="_blank" rel="noreferrer">
            abrir no portal ↗
          </a>
        </div>
        <h2>{e.title}</h2>
        <div className="acc-chips" style={{ marginBottom: 6 }}>
          {e.professor && <span className="chip chip-acc">👤 {e.professor}</span>}
          <span className="chip chip-acc">{e.moduleName}</span>
          {e.sectionTitle && <span className="chip chip-ctx">{e.sectionTitle}</span>}
        </div>
        <div className="kv muted">
          {e.deadlineAt ? `Prazo: ${e.deadlineAt}` : "Sem prazo definido"}
        </div>

        {e.files.length > 0 && (
          <>
            <h3>Arquivos da atividade</h3>
            {e.files.map((f) => (
              <a key={f.name} className="file-row" href={`/docs/${f.relPath.replace(/^docs\//, "")}`} target="_blank" rel="noreferrer">
                <span className="file-ic">📎</span>
                <span className="file-name">{f.name.replace(/^\d+_/, "")}</span>
                <span className="muted">abrir ↗</span>
              </a>
            ))}
          </>
        )}

        {e.instructionsText && (
          <>
            <h3>Enunciado</h3>
            <p className="instructions muted">{e.instructionsText}</p>
          </>
        )}

        {e.kind === "quiz" && e.questions.length > 0 && (
          <>
            <h3>Questões ({e.questions.length})</h3>
            {e.questions.map((q, qi) => (
              <div className="qblock" key={q.id}>
                <div className="qnum">{qi + 1}</div>
                <p>{q.text}</p>
                {q.options.map((o, i) => (
                  <div className="opt" key={i}>
                    <span className="opt-key">{String.fromCharCode(97 + i)})</span> {o}
                  </div>
                ))}
              </div>
            ))}
          </>
        )}

        <h3>Suas anotações</h3>
        <textarea value={notes} onChange={(ev) => setNotes(ev.target.value)} placeholder="contexto para a IA (opcional)…" />
        <div className="row">
          <button className="ghost" onClick={() => onNote(notes)}>
            salvar nota
          </button>
        </div>

        <h3>🤖 Resposta gerada por IA {cfg ? `(${cfg.model})` : ""}</h3>
        {err && <div className="error">{err}</div>}
        {e.answer ? (
          <>
            <pre className="answer">{e.answer}</pre>
            <div className="row">
              <button className="ghost" onClick={copy}>
                copiar
              </button>
              <a className="btn-link" href={`/api/export/${e.id}`}>
                baixar .md ↓
              </a>
            </div>
          </>
        ) : (
          <div className="muted">Nenhuma resposta ainda.</div>
        )}
        <div className="row">
          <button className="primary" onClick={gen} disabled={busy}>
            {busy ? "Gerando…" : "Gerar resposta (pt-BR)"}
          </button>
        </div>
      </div>
    </div>
  );
}

/* ---------------- app ---------------- */

type Scope = "open" | "expired" | "done" | "all";
type Kind = "all" | "upload" | "quiz";

export default function App() {
  const [items, setItems] = useState<Exercise[]>([]);
  const [cfg, setCfg] = useState<AiConfigDto | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [scope, setScope] = useState<Scope>("open");
  const [kind, setKind] = useState<Kind>("all");
  const [selected, setSelected] = useState<number | null>(null);

  const reload = useCallback(async () => {
    try {
      const [p, c] = await Promise.all([fetchExercises(), fetchConfig()]);
      setItems(p.exercises);
      setCfg(c);
    } catch (x) {
      setErr(x instanceof Error ? x.message : String(x));
    }
  }, []);

  useEffect(() => {
    reload();
  }, [reload]);

  const shown = useMemo(
    () =>
      items
        .filter((e) => (scope === "all" ? true : e.status === scope))
        .filter((e) => (kind === "all" ? true : e.kind === kind))
        .sort(cmp),
    [items, scope, kind],
  );

  const counts = useMemo(
    () => ({
      open: items.filter((e) => e.status === "open").length,
      expired: items.filter((e) => e.status === "expired").length,
      done: items.filter((e) => e.status === "done").length,
    }),
    [items],
  );

  const next = useMemo(() => {
    const open = items.filter((e) => e.status === "open");
    return [...open].sort(cmp)[0] ?? null;
  }, [items]);

  const sel = shown.find((x) => x.id === selected) ?? shown[0] ?? null;

  const saveNote = async (notes: string) => {
    if (!sel) return;
    await saveNote(sel.id, notes);
    await reload();
  };

  if (err) {
    return (
      <div className="page">
        <header className="top">
          <h1>🎓 LXP Assistant</h1>
        </header>
        <div className="error-box">
          Não consegui carregar os dados.
          <div>{err}</div>
          <div className="muted">
            Rode <code>npm run index</code> e depois <code>npm run web</code> dentro de assistant/.
          </div>
        </div>
      </div>
    );
  }

  const tab = (label: string, key: Scope) => (
    <button className={`fbtn${scope === key ? " active" : ""}`} onClick={() => setScope(key)}>
      {label}
    </button>
  );

  return (
    <div className="page">
      <header className="top">
        <h1>🎓 LXP Assistant</h1>
        <span className="meta">
          {items[0]?.courseName ?? ""} · modelo {cfg?.model ?? "…"}
        </span>
        <span className="spacer" />
        <button className="ghost" onClick={reload}>
          atualizar
        </button>
      </header>

      {next && (
        <div className="summary">
          <div className="summary-ic">🎯</div>
          <div>
            <div className="muted">PRÓXIMA</div>
            <strong>{next.title}</strong>
            <span className="sum-due">
              <DeadlineChip e={next} />
            </span>
          </div>
        </div>
      )}

      <div className="filters">
        {tab("Abertas", "open")}
        {tab("Atrasadas", "expired")}
        {tab("Concluídas", "done")}
        {tab("Todas", "all")}
        <span className="fsep" />
        <button className={`fbtn${kind === "upload" ? " active" : ""}`} onClick={() => setKind(kind === "upload" ? "all" : "upload")}>
          📤 tarefas
        </button>
        <button className={`fbtn${kind === "quiz" ? " active" : ""}`} onClick={() => setKind(kind === "quiz" ? "all" : "quiz")}>
          ❓ quizzes
        </button>
        <span className="counts">
          {counts.open} abertas · {counts.expired} atrasadas · {counts.done} concluídas
        </span>
      </div>

      <div className="layout">
        <div className="list">
          {shown.length === 0 && <div className="empty">Nada aqui.</div>}
          {shown.map((e) => (
            <Item key={e.id} e={e} selected={sel?.id === e.id} onClick={() => setSelected(e.id)} />
          ))}
        </div>
        <div className="side">
          {sel ? <Detail key={sel.id} e={sel} cfg={cfg} onNote={saveNote} onReload={reload} /> : <div className="empty">Selecione uma atividade.</div>}
        </div>
      </div>
    </div>
  );
}
