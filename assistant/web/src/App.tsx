import { useCallback, useEffect, useMemo, useState } from "react";
import { fetchConfig, fetchExercises, generateAnswer, saveNote, type AiConfigDto } from "./api";
import type { Exercise } from "./types";
import "./styles.css";

function badge(e: Exercise): { cls: string; label: string } {
  if (e.done) return { cls: "b-done", label: "done" };
  if (e.status === "expired") return { cls: "b-expired", label: "expired" };
  if (e.kind === "quiz") return { cls: "b-open-gray", label: "quiz" };
  if (e.daysLeft == null) return { cls: "b-open-gray", label: "open" };
  if (e.daysLeft <= 1) return { cls: "b-due", label: e.daysLeft === 0 ? "vence hoje" : "vence amanhã" };
  if (e.daysLeft <= 3) return { cls: "b-soon", label: `faltam ${e.daysLeft}d` };
  return { cls: "b-open", label: `faltam ${e.daysLeft}d` };
}

function cmp(a: Exercise, b: Exercise): number {
  const rank = (s: string) => (s === "open" ? 0 : s === "expired" ? 1 : 2);
  const r = rank(a.status) - rank(b.status);
  if (r) return r;
  const da = a.daysLeft ?? Infinity;
  const db = b.daysLeft ?? Infinity;
  return da - db;
}

function DocOpen({ relPath }: { relPath: string }) {
  const href = `/docs/${relPath.replace(/^docs\//, "")}`;
  return (
    <a className="filebtn" href={href} target="_blank" rel="noreferrer">
      abrir arquivo
    </a>
  );
}

function Detail({ e, cfg, onNote, onReload }: { e: Exercise; cfg: AiConfigDto | null; onNote: (t: string) => void; onReload: () => void }) {
  const [notes, setNotes] = useState(e.notes);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const b = badge(e);

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
    <div className="card">
      <h2>{e.title}</h2>
      <div className="row">
        <span className={`badge ${b.cls}`}>{b.label}</span>
        <span className="kv">{e.kind === "quiz" ? "❓ Quiz" : "📤 Upload"}</span>
        {e.deadlineAt && <span className="kv">🗓 {e.deadlineAt}</span>}
        <span className="spacer" />
        <a href={`https://unifoa2.grupoa.education/plataforma/course/${e.courseId}/content/${e.id}`} target="_blank" rel="noreferrer">
          abrir no portal
        </a>
      </div>
      <div className="kv">{e.moduleTitle}{e.sectionTitle ? ` — ${e.sectionTitle}` : ""}</div>

      {e.files.length > 0 && (
        <h3>Arquivos da atividade</h3>
      )}
      {e.files.map((f) => (
        <DocOpen key={f.name} relPath={f.relPath} />
      ))}
      {e.remoteFiles.length > 0 && (
        <div className="muted">
          anexos no portal: {e.remoteFiles.map((r) => r.filename ?? "arquivo").join(", ")}
        </div>
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
          {e.questions.map((q) => (
            <div className="qblock" key={q.id}>
              <p>{q.text}</p>
              {q.options.map((o, i) => (
                <div className="opt" key={i}>
                  {String.fromCharCode(97 + i)}) {o}
                </div>
              ))}
            </div>
          ))}
        </>
      )}

      <h3>Suas anotações</h3>
      <textarea value={notes} onChange={(ev) => setNotes(ev.target.value)} placeholder="contexto p/ a IA (opcional)…" />
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
            <button onClick={copy}>copiar</button>
            <a className="filebtn" href={`/api/export/${e.id}`}>
              baixar .md
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
  );
}

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

  const sel = items.find((e) => e.id === selected) ?? shown[0] ?? null;
  const counts = useMemo(
    () => ({
      open: items.filter((e) => e.status === "open").length,
      expired: items.filter((e) => e.status === "expired").length,
      done: items.filter((e) => e.status === "done").length,
    }),
    [items],
  );

  const saveNote = async (notes: string) => {
    if (!sel) return;
    await saveNote(sel.id, notes);
    await reload();
  };

  if (err) {
    return (
      <div className="app">
        <div className="top">
          <h1>🎓 LXP Assistant</h1>
        </div>
        <div className="error">
          Não consegui carregar os dados.
          <div>{err}</div>
          <div className="muted">
            Rode <code>npm run index</code> (dentro de assistant/) e depois <code>npm run web</code>.
          </div>
        </div>
      </div>
    );
  }

  const tab = (label: string, key: Scope) => (
    <button className={scope === key ? "active" : ""} onClick={() => setScope(key)}>
      {label}
    </button>
  );

  return (
    <div className="app">
      <div className="top">
        <h1>🎓 LXP Assistant</h1>
        <span className="meta">
          {items[0]?.courseName ?? ""} · {cfg ? `modelo ${cfg.model}` : ""}
        </span>
        <span className="spacer" />
        <button onClick={reload}>atualizar</button>
      </div>

      <div className="filters">
        {tab("Abertas", "open")}
        {tab("Atrasadas", "expired")}
        {tab("Concluídas", "done")}
        {tab("Todas", "all")}
        <span style={{ width: 12 }} />
        <button className={kind === "upload" ? "active" : ""} onClick={() => setKind(kind === "upload" ? "all" : "upload")}>
          📤 uploads
        </button>
        <button className={kind === "quiz" ? "active" : ""} onClick={() => setKind(kind === "quiz" ? "all" : "quiz")}>
          ❓ quizzes
        </button>
        <span className="counts">
          {counts.open} abertas · {counts.expired} atrasadas · {counts.done} concluídas
        </span>
      </div>

      <div className="layout">
        <div className="panel-list">
          {shown.length === 0 && <div className="empty">Nada aqui.</div>}
          {shown.map((e) => {
            const b = badge(e);
            return (
              <div
                key={e.id}
                className={`item${sel?.id === e.id ? " selected" : ""}`}
                onClick={() => setSelected(e.id)}
              >
                <span>{e.kind === "quiz" ? "❓" : "📤"}</span>
                <div className="tt">
                  <div className="t">{e.done ? "✅ " : ""}{e.title}</div>
                  <div className="sub">
                    {e.moduleTitle}
                    {e.sectionTitle ? ` · ${e.sectionTitle}` : ""}
                  </div>
                </div>
                <span className={`badge ${b.cls}`}>{b.label}</span>
              </div>
            );
          })}
        </div>

        <div className="panel-detail">
          {sel ? (
            <Detail key={sel.id} e={sel} cfg={cfg} onNote={saveNote} onReload={reload} />
          ) : (
            <div className="empty">Selecione uma atividade.</div>
          )}
        </div>
      </div>
    </div>
  );
}
