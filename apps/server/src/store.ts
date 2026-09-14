/**
 * Runtime Postgres store — the source of truth for student activity.
 *
 * Answers, submissions, overrides, profile, AI config and AI runs are written
 * here at request time. `config.ts` is now only the legacy JSON reader used by
 * the one-time import (`import.ts`); nothing here reads or writes those files.
 */
import { query, withTransaction } from "./db.js";
import { linkedinAvatarUrl } from "./linkedin.js";
import { DEFAULT_ACTIVITY_SECTIONS, DEFAULT_MODELS, DEFAULT_STYLE, loadAiConfig, loadProfile } from "./config.js";
import { mergeAbilities } from "./abilities.js";
import type {
  ActivityAbility,
  ActivityProject,
  AiConfig,
  AiModels,
  AiProfile,
  AbilityId,
  AnswerRecord,
  AnswerSource,
  Answers,
  ExerciseStatus,
  GateResult,
  Overrides,
  OverridesEntry,
  ProfessorLink,
  ProjectProfile,
  ProjectProfileMode,
  ProjectReadmeStatus,
  ProjectSource,
  ProjectSourceFile,
  ProjectSourceFileStatus,
  ProjectSourceState,
  QuizSelection,
  SubmissionEntry,
  Submissions,
  UploadFlavor,
} from "./types.js";

const MAX_HISTORY = 20;

function iso(value: Date | string | null | undefined): string {
  if (!value) return new Date().toISOString();
  return value instanceof Date ? value.toISOString() : value;
}

/** The single local student row (created from the legacy profile when absent). */
export async function getStudentId(): Promise<number> {
  const rows = await query<{ id: string }>("SELECT id FROM student ORDER BY id LIMIT 1");
  if (rows.length > 0) return Number(rows[0].id);
  const p = loadProfile();
  const inserted = await query<{ id: string }>(
    "INSERT INTO student(name, matricula) VALUES ($1,$2) RETURNING id",
    [p.nome || null, p.matricula || null],
  );
  return Number(inserted[0].id);
}

export async function getProfile(): Promise<AiProfile> {
  const rows = await query<{ name: string | null; matricula: string | null }>(
    "SELECT name, matricula FROM student ORDER BY id LIMIT 1",
  );
  const row = rows[0];
  if (!row) return loadProfile();
  return { nome: row.name ?? "", matricula: row.matricula ?? "" };
}

export async function saveProfile(profile: AiProfile): Promise<void> {
  const id = await getStudentId();
  await query("UPDATE student SET name = $2, matricula = $3, updated_at = now() WHERE id = $1", [
    id,
    profile.nome,
    profile.matricula,
  ]);
}

// ── Professor photos (per student) ──────────────────────────────────────────

interface ProfessorLinkRow {
  professor_id: string;
  linkedin_url: string | null;
  image_url: string | null;
  source: string;
  updated_at: Date;
}

function toProfessorLink(r: ProfessorLinkRow): ProfessorLink {
  return {
    professorId: Number(r.professor_id),
    linkedinUrl: r.linkedin_url,
    imageUrl: r.image_url,
    source: r.source === "manual" ? "manual" : "linkedin",
    updatedAt: iso(r.updated_at),
    // A manual image URL wins; otherwise the browser loads unavatar directly.
    photoUrl: r.image_url || linkedinAvatarUrl(r.linkedin_url) || "",
  };
}

const PROFESSOR_LINK_COLS = "professor_id, linkedin_url, image_url, source, updated_at";

export async function getProfessorLinks(): Promise<ProfessorLink[]> {
  const studentId = await getStudentId();
  const rows = await query<ProfessorLinkRow>(
    `SELECT ${PROFESSOR_LINK_COLS} FROM professor_link WHERE student_id = $1`,
    [studentId],
  );
  return rows.map(toProfessorLink);
}

export async function getProfessorLink(professorId: number): Promise<ProfessorLink | null> {
  const studentId = await getStudentId();
  const rows = await query<ProfessorLinkRow>(
    `SELECT ${PROFESSOR_LINK_COLS} FROM professor_link WHERE student_id = $1 AND professor_id = $2`,
    [studentId, professorId],
  );
  return rows[0] ? toProfessorLink(rows[0]) : null;
}

export async function saveProfessorLink(
  professorId: number,
  input: { linkedinUrl?: string | null; imageUrl?: string | null },
): Promise<ProfessorLink> {
  const studentId = await getStudentId();
  const linkedinUrl = (input.linkedinUrl ?? "").trim() || null;
  const imageUrl = (input.imageUrl ?? "").trim() || null;
  const source = imageUrl ? "manual" : "linkedin";
  await query(
    `INSERT INTO professor_link(student_id, professor_id, linkedin_url, image_url, source, updated_at)
     VALUES ($1,$2,$3,$4,$5, now())
     ON CONFLICT (student_id, professor_id) DO UPDATE SET
       linkedin_url = EXCLUDED.linkedin_url,
       image_url = EXCLUDED.image_url,
       source = EXCLUDED.source,
       updated_at = now()`,
    [studentId, professorId, linkedinUrl, imageUrl, source],
  );
  const link = await getProfessorLink(professorId);
  if (!link) throw new Error(`falha ao salvar foto do professor ${professorId}`);
  return link;
}

export async function deleteProfessorLink(professorId: number): Promise<void> {
  const studentId = await getStudentId();
  await query("DELETE FROM professor_link WHERE student_id = $1 AND professor_id = $2", [
    studentId,
    professorId,
  ]);
}

// ── Answers (immutable attempts; one is_current per item) ────────────────────

interface AttemptRow {
  id: string;
  content_item_id: string;
  created_at: Date;
  source: string;
  content: string;
  is_current: boolean;
  gate_json: unknown;
}

interface SelectionRow {
  answer_attempt_id: string;
  question_id: string | null;
  option_id: string | null;
  letter: string | null;
  option_index: number | null;
}

function toSelections(rows: SelectionRow[]): QuizSelection[] {
  return rows.map((s) => ({
    questionId: s.question_id != null ? Number(s.question_id) : 0,
    optionIndex: s.option_index != null ? Number(s.option_index) : 0,
    letter: s.letter ?? "",
    optionId: s.option_id != null ? Number(s.option_id) : 0,
  }));
}

function toGate(value: unknown): GateResult | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  return value as GateResult;
}

export async function getAnswers(): Promise<Answers> {
  const studentId = await getStudentId();
  const [attempts, selections] = await Promise.all([
    query<AttemptRow>(
      `SELECT id, content_item_id, created_at, source, content, is_current, gate_json
       FROM answer_attempt WHERE student_id = $1 ORDER BY created_at`,
      [studentId],
    ),
    query<SelectionRow>(
      `SELECT s.answer_attempt_id, s.question_id, s.option_id, s.letter, qo.position AS option_index
       FROM answer_selection s
       JOIN answer_attempt a ON a.id = s.answer_attempt_id
       LEFT JOIN question_option qo ON qo.id = s.option_id
       WHERE a.student_id = $1
       ORDER BY s.answer_attempt_id, s.position`,
      [studentId],
    ),
  ]);

  const byAttempt = new Map<number, SelectionRow[]>();
  for (const s of selections) {
    const list = byAttempt.get(Number(s.answer_attempt_id)) ?? [];
    list.push(s);
    byAttempt.set(Number(s.answer_attempt_id), list);
  }

  const byItem = new Map<string, AttemptRow[]>();
  for (const a of attempts) {
    const key = String(a.content_item_id);
    const list = byItem.get(key) ?? [];
    list.push(a);
    byItem.set(key, list);
  }

  const out: Answers = {};
  for (const [key, list] of byItem) {
    const current = list.find((a) => a.is_current) ?? list[list.length - 1];
    const entry = (a: AttemptRow) => ({
      answer: a.content,
      updatedAt: iso(a.created_at),
      source: (a.source === "manual" ? "manual" : "ai") as AnswerSource,
      selections: toSelections(byAttempt.get(Number(a.id)) ?? []),
      gate: toGate(a.gate_json),
    });
    out[key] = { ...entry(current), history: list.filter((a) => a !== current).map(entry) };
  }
  return out;
}

export async function getAnswerRecord(id: number | string): Promise<AnswerRecord | null> {
  return (await getAnswers())[String(id)] ?? null;
}

export async function getCurrentAttemptId(id: number | string): Promise<number | null> {
  const studentId = await getStudentId();
  const rows = await query<{ id: string }>(
    "SELECT id FROM answer_attempt WHERE content_item_id = $1 AND student_id = $2 AND is_current LIMIT 1",
    [Number(id), studentId],
  );
  return rows[0] ? Number(rows[0].id) : null;
}

/**
 * Persist the quality-gate analysis on the current answer version, so it is
 * saved together with the draft and travels with history/restore. No-op when the
 * item has no answer version yet.
 */
export async function saveAnswerGate(id: number | string, gate: GateResult | null): Promise<void> {
  const studentId = await getStudentId();
  await query(
    `UPDATE answer_attempt SET gate_json = $1
      WHERE content_item_id = $2 AND student_id = $3 AND is_current`,
    [gate == null ? null : JSON.stringify(gate), Number(id), studentId],
  );
}

export async function saveAnswerVersion(
  id: number | string,
  answer: string,
  source: AnswerSource,
  updatedAt?: string,
  selections: QuizSelection[] = [],
  meta: { model?: string | null; promptHash?: string | null } = {},
): Promise<AnswerRecord> {
  const itemId = Number(id);
  const studentId = await getStudentId();
  const at = updatedAt ? new Date(updatedAt) : new Date();
  const model = meta.model ?? null;
  const promptHash = meta.promptHash ?? null;

  await withTransaction(async (client) => {
    const cur = await client.query<{ id: string; content: string }>(
      "SELECT id, content FROM answer_attempt WHERE content_item_id = $1 AND student_id = $2 AND is_current LIMIT 1",
      [itemId, studentId],
    );
    const prev = cur.rows[0];

    if (prev) {
      const prevSel = await client.query<SelectionRow>(
        `SELECT s.answer_attempt_id, s.question_id, s.option_id, s.letter, qo.position AS option_index
         FROM answer_selection s LEFT JOIN question_option qo ON qo.id = s.option_id
         WHERE s.answer_attempt_id = $1 ORDER BY s.position`,
        [prev.id],
      );
      const same =
        prev.content === answer &&
        JSON.stringify(toSelections(prevSel.rows)) === JSON.stringify(selections);
      if (same) {
        await client.query(
          "UPDATE answer_attempt SET created_at = $2, source = $3, model = $4, prompt_hash = $5 WHERE id = $1",
          [prev.id, at, source, model, promptHash],
        );
        return;
      }
      await client.query("UPDATE answer_attempt SET is_current = false WHERE id = $1", [prev.id]);
    }

    const inserted = await client.query<{ id: string }>(
      `INSERT INTO answer_attempt(student_id, content_item_id, created_at, source, content, model, prompt_hash, is_current)
       VALUES ($1,$2,$3,$4,$5,$6,$7,true) RETURNING id`,
      [studentId, itemId, at, source, answer, model, promptHash],
    );
    const attemptId = Number(inserted.rows[0].id);
    for (let i = 0; i < selections.length; i++) {
      const s = selections[i];
      await client.query(
        `INSERT INTO answer_selection(answer_attempt_id, question_id, option_id, letter, position)
         VALUES ($1,$2,$3,$4,$5)`,
        [attemptId, s.questionId || null, s.optionId || null, s.letter ?? null, i],
      );
    }

    // Keep only the newest MAX_HISTORY non-current attempts.
    await client.query(
      `DELETE FROM answer_attempt WHERE id IN (
         SELECT id FROM answer_attempt
         WHERE content_item_id = $1 AND student_id = $2 AND is_current = false
         ORDER BY created_at DESC OFFSET $3
       )`,
      [itemId, studentId, MAX_HISTORY],
    );
  });

  const rec = await getAnswerRecord(itemId);
  if (!rec) throw new Error(`falha ao salvar resposta ${itemId}`);
  return rec;
}

export async function restoreAnswerVersion(id: number | string, index: number): Promise<AnswerRecord> {
  const itemId = Number(id);
  const studentId = await getStudentId();
  await withTransaction(async (client) => {
    const hist = await client.query<{ id: string }>(
      `SELECT id FROM answer_attempt
       WHERE content_item_id = $1 AND student_id = $2 AND is_current = false
       ORDER BY created_at ASC`,
      [itemId, studentId],
    );
    if (index < 0 || index >= hist.rows.length) {
      throw new Error(`histórico indisponível para ${id} (índice ${index})`);
    }
    await client.query(
      "UPDATE answer_attempt SET is_current = false WHERE content_item_id = $1 AND student_id = $2 AND is_current",
      [itemId, studentId],
    );
    await client.query("UPDATE answer_attempt SET is_current = true WHERE id = $1", [hist.rows[index].id]);
  });
  const rec = await getAnswerRecord(itemId);
  if (!rec) throw new Error(`histórico indisponível para ${id}`);
  return rec;
}

export async function clearAnswerHistory(id: number | string): Promise<AnswerRecord> {
  const itemId = Number(id);
  const studentId = await getStudentId();
  await query(
    "DELETE FROM answer_attempt WHERE content_item_id = $1 AND student_id = $2 AND is_current = false",
    [itemId, studentId],
  );
  return (
    (await getAnswerRecord(itemId)) ?? {
      answer: "",
      updatedAt: new Date().toISOString(),
      source: "ai",
      selections: [],
      history: [],
    }
  );
}

// ── Overrides / annotations ─────────────────────────────────────────────────

interface AnnotationRow {
  content_item_id: string;
  notes: string | null;
  prompt_override: string | null;
  hidden: boolean;
  tag: string | null;
  manual_status: string | null;
  ai_request_json: unknown;
  auto_flavor: string | null;
  auto_flavor_reason: string | null;
}

export async function getOverrides(): Promise<Overrides> {
  const studentId = await getStudentId();
  const rows = await query<AnnotationRow>(
    `SELECT content_item_id, notes, prompt_override, hidden, tag, manual_status, ai_request_json,
            auto_flavor, auto_flavor_reason
     FROM item_annotation WHERE student_id = $1`,
    [studentId],
  );
  const out: Overrides = {};
  for (const r of rows) {
    const entry: OverridesEntry = {};
    if (r.notes != null) entry.notes = r.notes;
    if (r.prompt_override != null) entry.promptOverride = r.prompt_override;
    if (r.hidden) entry.hide = true;
    if (r.tag != null) entry.tag = r.tag;
    if (r.manual_status != null) entry.manualStatus = r.manual_status as ExerciseStatus;
    if (r.ai_request_json != null) {
      entry.aiRequest =
        typeof r.ai_request_json === "string" ? r.ai_request_json : JSON.stringify(r.ai_request_json);
    }
    if (r.auto_flavor === "question" || r.auto_flavor === "ghost" || r.auto_flavor === "print") {
      entry.autoFlavor = r.auto_flavor;
    }
    if (r.auto_flavor_reason != null) entry.autoFlavorReason = r.auto_flavor_reason;
    out[String(r.content_item_id)] = entry;
  }
  return out;
}

export async function saveNote(itemId: number, notes: string): Promise<void> {
  const studentId = await getStudentId();
  await query(
    `INSERT INTO item_annotation(content_item_id, student_id, notes, updated_at)
     VALUES ($1,$2,$3, now())
     ON CONFLICT (content_item_id, student_id) DO UPDATE SET notes = EXCLUDED.notes, updated_at = now()`,
    [itemId, studentId, notes],
  );
}

export async function saveAiRequest(itemId: number, raw: string | null): Promise<void> {
  const studentId = await getStudentId();
  let json: unknown = null;
  if (raw != null) {
    try {
      json = JSON.parse(raw);
    } catch {
      json = null;
    }
  }
  await query(
    `INSERT INTO item_annotation(content_item_id, student_id, ai_request_json, updated_at)
     VALUES ($1,$2,$3, now())
     ON CONFLICT (content_item_id, student_id) DO UPDATE SET ai_request_json = EXCLUDED.ai_request_json, updated_at = now()`,
    [itemId, studentId, json],
  );
}

/** Preset anomaly tags the UI can assign (cleared when `tag` is null/empty). */
export async function saveTag(itemId: number, tag: string | null): Promise<void> {
  const studentId = await getStudentId();
  const value = tag?.trim() ? tag.trim() : null;
  await query(
    `INSERT INTO item_annotation(content_item_id, student_id, tag, updated_at)
     VALUES ($1,$2,$3, now())
     ON CONFLICT (content_item_id, student_id) DO UPDATE SET tag = EXCLUDED.tag, updated_at = now()`,
    [itemId, studentId, value],
  );
}

/** Cache the lazy AI flavor verdict for one item (per student). */
export async function saveAutoFlavor(
  itemId: number,
  flavor: UploadFlavor,
  reason: string,
  model: string,
): Promise<void> {
  const studentId = await getStudentId();
  await query(
    `INSERT INTO item_annotation(content_item_id, student_id, auto_flavor, auto_flavor_reason, auto_flavor_model, auto_flavor_at, updated_at)
     VALUES ($1,$2,$3,$4,$5, now(), now())
     ON CONFLICT (content_item_id, student_id) DO UPDATE SET
       auto_flavor = EXCLUDED.auto_flavor,
       auto_flavor_reason = EXCLUDED.auto_flavor_reason,
       auto_flavor_model = EXCLUDED.auto_flavor_model,
       auto_flavor_at = EXCLUDED.auto_flavor_at,
       updated_at = now()`,
    [itemId, studentId, flavor, reason || null, model || null],
  );
}

export async function setManualStatus(itemId: number, status: ExerciseStatus): Promise<void> {
  const studentId = await getStudentId();
  await query(
    `INSERT INTO item_annotation(content_item_id, student_id, manual_status, updated_at)
     VALUES ($1,$2,$3, now())
     ON CONFLICT (content_item_id, student_id) DO UPDATE SET manual_status = EXCLUDED.manual_status, updated_at = now()`,
    [itemId, studentId, status],
  );
}

// ── Submissions ─────────────────────────────────────────────────────────────

interface SubmissionRow {
  content_item_id: string;
  at: Date;
  status: string;
  mode: string | null;
  attachment_name: string | null;
  attempt_number: number | null;
  detail: string | null;
  portal_detail: string | null;
  confirmation_at: Date | null;
  answer: string | null;
}

function toSubmissionEntry(r: SubmissionRow): SubmissionEntry {
  return {
    exerciseId: Number(r.content_item_id),
    at: iso(r.at),
    status: r.status as SubmissionEntry["status"],
    detail: r.detail ?? "",
    answer: r.answer ?? undefined,
    mode: (r.mode as SubmissionEntry["mode"]) ?? undefined,
    attachmentName: r.attachment_name ?? undefined,
    attemptNumber: r.attempt_number,
    portalDetail: r.portal_detail ?? undefined,
    confirmationAt: r.confirmation_at ? iso(r.confirmation_at) : undefined,
  };
}

export async function getSubmissions(): Promise<Submissions> {
  const studentId = await getStudentId();
  const rows = await query<SubmissionRow>(
    `SELECT content_item_id, at, status, mode, attachment_name, attempt_number, detail, portal_detail, confirmation_at, answer
     FROM submission WHERE student_id = $1 ORDER BY at`,
    [studentId],
  );
  const out: Submissions = {};
  for (const r of rows) {
    const key = String(r.content_item_id);
    (out[key] ??= []).push(toSubmissionEntry(r));
  }
  return out;
}

/** Insert a submission, or update the existing row with the same (item, at). */
export async function appendSubmission(entry: SubmissionEntry): Promise<void> {
  const studentId = await getStudentId();
  const at = entry.at ? new Date(entry.at) : new Date();
  await query(
    `INSERT INTO submission(student_id, content_item_id, at, status, mode, attachment_name,
       attempt_number, detail, portal_detail, confirmation_at, answer)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)
     ON CONFLICT (content_item_id, student_id, at) DO UPDATE SET
       status = EXCLUDED.status,
       mode = EXCLUDED.mode,
       attachment_name = EXCLUDED.attachment_name,
       attempt_number = EXCLUDED.attempt_number,
       detail = EXCLUDED.detail,
       portal_detail = EXCLUDED.portal_detail,
       confirmation_at = EXCLUDED.confirmation_at,
       answer = EXCLUDED.answer`,
    [
      studentId,
      entry.exerciseId,
      at,
      entry.status,
      entry.mode ?? null,
      entry.attachmentName ?? null,
      entry.attemptNumber ?? null,
      entry.detail ?? null,
      entry.portalDetail ?? null,
      entry.confirmationAt ? new Date(entry.confirmationAt) : null,
      entry.answer ?? null,
    ],
  );
}

export async function lastSubmission(exerciseId: number): Promise<SubmissionEntry | null> {
  const list = (await getSubmissions())[String(exerciseId)] ?? [];
  return list.length ? list[list.length - 1] : null;
}

export async function submissionsFor(exerciseId: number): Promise<SubmissionEntry[]> {
  return (await getSubmissions())[String(exerciseId)] ?? [];
}

// ── AI config + runs ────────────────────────────────────────────────────────

interface AiConfigRow {
  provider: string;
  model: string;
  temperature: number | null;
  max_output_tokens: number | null;
  style_json: unknown;
  sections_json: unknown;
  project_auto_detect: boolean | null;
  models_json: unknown;
  abilities_json: unknown;
}

/** Merge the stored per-role models over the defaults, with `model` as the
 *  generation alias for backward compatibility. */
function toAiModels(value: unknown, generation: string): AiModels {
  return { ...DEFAULT_MODELS, ...((value as Partial<AiModels>) ?? {}), generation };
}

export async function getAiConfig(): Promise<AiConfig> {
  const studentId = await getStudentId();
  const rows = await query<AiConfigRow>(
    "SELECT provider, model, temperature, max_output_tokens, style_json, sections_json, project_auto_detect, models_json, abilities_json FROM ai_config WHERE student_id = $1",
    [studentId],
  );
  const row = rows[0];
  if (!row) {
    // Seed the DB once from the committed JSON config (or defaults).
    const legacy = loadAiConfig();
    await saveAiConfig(legacy).catch(() => undefined);
    return legacy;
  }
  return {
    provider: "openai",
    model: row.model,
    models: toAiModels(row.models_json, row.model),
    temperature: row.temperature ?? 0.7,
    max_output_tokens: row.max_output_tokens ?? undefined,
    projectAutoDetect: row.project_auto_detect ?? true,
    style: { ...DEFAULT_STYLE, ...((row.style_json as Partial<AiConfig["style"]>) ?? {}) },
    activitySections: {
      ...DEFAULT_ACTIVITY_SECTIONS,
      ...((row.sections_json as Partial<AiConfig["activitySections"]>) ?? {}),
    },
    abilities: mergeAbilities(row.abilities_json),
  };
}

export async function saveAiConfig(cfg: AiConfig): Promise<void> {
  const studentId = await getStudentId();
  const models = toAiModels(cfg.models, cfg.models?.generation ?? cfg.model);
  await query(
    `INSERT INTO ai_config(student_id, provider, model, temperature, max_output_tokens, style_json, sections_json, project_auto_detect, models_json, abilities_json, updated_at)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10, now())
     ON CONFLICT (student_id) DO UPDATE SET
       provider = EXCLUDED.provider,
       model = EXCLUDED.model,
       temperature = EXCLUDED.temperature,
       max_output_tokens = EXCLUDED.max_output_tokens,
       style_json = EXCLUDED.style_json,
       sections_json = EXCLUDED.sections_json,
       project_auto_detect = EXCLUDED.project_auto_detect,
       models_json = EXCLUDED.models_json,
       abilities_json = EXCLUDED.abilities_json,
       updated_at = now()`,
    [
      studentId,
      cfg.provider,
      models.generation,
      cfg.temperature ?? null,
      cfg.max_output_tokens ?? null,
      JSON.stringify(cfg.style),
      JSON.stringify(cfg.activitySections),
      cfg.projectAutoDetect ?? true,
      JSON.stringify(models),
      JSON.stringify(mergeAbilities(cfg.abilities)),
    ],
  );
}

// ── Per-activity abilities ──────────────────────────────────────────────────

interface ActivityAbilityRow {
  ability: string;
  enabled: boolean;
}

/** Per-activity ability overrides for one content item, keyed by ability id. */
export async function getActivityAbilities(
  contentItemId: number,
): Promise<Partial<Record<AbilityId, boolean>>> {
  const studentId = await getStudentId();
  const rows = await query<ActivityAbilityRow>(
    "SELECT ability, enabled FROM activity_ability WHERE content_item_id = $1 AND student_id = $2",
    [contentItemId, studentId],
  );
  const out: Partial<Record<AbilityId, boolean>> = {};
  for (const r of rows) out[r.ability as AbilityId] = r.enabled;
  return out;
}

/** Set (or clear, with `enabled === null`) a per-activity ability override. */
export async function setActivityAbility(
  contentItemId: number,
  ability: AbilityId,
  enabled: boolean | null,
): Promise<ActivityAbility[]> {
  const studentId = await getStudentId();
  if (enabled === null) {
    await query(
      "DELETE FROM activity_ability WHERE content_item_id = $1 AND student_id = $2 AND ability = $3",
      [contentItemId, studentId, ability],
    );
  } else {
    await query(
      `INSERT INTO activity_ability(content_item_id, student_id, ability, enabled, updated_at)
       VALUES ($1,$2,$3,$4, now())
       ON CONFLICT (content_item_id, student_id, ability) DO UPDATE SET
         enabled = EXCLUDED.enabled, updated_at = now()`,
      [contentItemId, studentId, ability, enabled],
    );
  }
  const rows = await query<ActivityAbilityRow>(
    "SELECT ability, enabled FROM activity_ability WHERE content_item_id = $1 AND student_id = $2",
    [contentItemId, studentId],
  );
  return rows.map((r) => ({ contentItemId, ability: r.ability as AbilityId, enabled: r.enabled }));
}

export interface AiRunRecord {
  contentItemId: number | null;
  prompt: string;
  promptHash: string;
  completion: string;
  model: string;
  tokensIn: number | null;
  tokensOut: number | null;
  latencyMs: number | null;
  answerAttemptId: number | null;
}

export async function recordAiRun(run: AiRunRecord): Promise<void> {
  const studentId = await getStudentId();
  await query(
    `INSERT INTO ai_run(student_id, content_item_id, prompt, prompt_hash, completion, model, tokens_in, tokens_out, latency_ms, answer_attempt_id)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)`,
    [
      studentId,
      run.contentItemId,
      run.prompt,
      run.promptHash,
      run.completion,
      run.model,
      run.tokensIn,
      run.tokensOut,
      run.latencyMs,
      run.answerAttemptId,
    ],
  );
}

// ── Debug logs (weak-draft diagnostics) ─────────────────────────────────────

export interface DebugLogInput {
  contentItemId: number | null;
  answerAttemptId: number | null;
  reason: string;
  filePath: string | null;
  payload: unknown;
}

export interface DebugLogEntry {
  id: number;
  contentItemId: number | null;
  answerAttemptId: number | null;
  reason: string;
  filePath: string | null;
  payload: unknown;
  createdAt: string;
}

interface DebugLogRow {
  id: string;
  content_item_id: string | null;
  answer_attempt_id: string | null;
  reason: string;
  file_path: string | null;
  payload: unknown;
  created_at: Date;
}

function toDebugLog(r: DebugLogRow): DebugLogEntry {
  return {
    id: Number(r.id),
    contentItemId: r.content_item_id != null ? Number(r.content_item_id) : null,
    answerAttemptId: r.answer_attempt_id != null ? Number(r.answer_attempt_id) : null,
    reason: r.reason,
    filePath: r.file_path,
    payload: r.payload,
    createdAt: iso(r.created_at),
  };
}

export async function insertDebugLog(input: DebugLogInput): Promise<number> {
  const studentId = await getStudentId();
  const rows = await query<{ id: string }>(
    `INSERT INTO debug_log(student_id, content_item_id, answer_attempt_id, reason, file_path, payload)
     VALUES ($1,$2,$3,$4,$5,$6) RETURNING id`,
    [
      studentId,
      input.contentItemId,
      input.answerAttemptId,
      input.reason,
      input.filePath,
      JSON.stringify(input.payload),
    ],
  );
  return Number(rows[0]?.id ?? 0);
}

/** Recent debug logs, newest first (payload omitted for the list view). */
export async function listDebugLogs(limit = 50): Promise<Omit<DebugLogEntry, "payload">[]> {
  const studentId = await getStudentId();
  const rows = await query<DebugLogRow>(
    `SELECT id, content_item_id, answer_attempt_id, reason, file_path, NULL AS payload, created_at
     FROM debug_log WHERE student_id = $1 ORDER BY created_at DESC LIMIT $2`,
    [studentId, limit],
  );
  return rows.map((r) => {
    const entry = toDebugLog(r);
    return {
      id: entry.id,
      contentItemId: entry.contentItemId,
      answerAttemptId: entry.answerAttemptId,
      reason: entry.reason,
      filePath: entry.filePath,
      createdAt: entry.createdAt,
    };
  });
}

export async function getDebugLog(id: number): Promise<DebugLogEntry | null> {
  const studentId = await getStudentId();
  const rows = await query<DebugLogRow>(
    `SELECT id, content_item_id, answer_attempt_id, reason, file_path, payload, created_at
     FROM debug_log WHERE student_id = $1 AND id = $2`,
    [studentId, id],
  );
  return rows[0] ? toDebugLog(rows[0]) : null;
}

/**
 * Delete debug logs beyond the newest `keep` for the student, returning the
 * markdown paths that were removed so the caller can delete the files too.
 */
export async function pruneDebugLogs(keep: number): Promise<string[]> {
  const studentId = await getStudentId();
  const rows = await query<{ file_path: string | null }>(
    `DELETE FROM debug_log
      WHERE student_id = $1
        AND id NOT IN (
          SELECT id FROM debug_log WHERE student_id = $1 ORDER BY created_at DESC LIMIT $2
        )
      RETURNING file_path`,
    [studentId, keep],
  );
  return rows.map((r) => r.file_path).filter((p): p is string => Boolean(p));
}

// ── Project context ─────────────────────────────────────────────────────────

function toStrArray(v: unknown): string[] {
  return Array.isArray(v) ? v.map((i) => String(i)).filter(Boolean) : [];
}

interface ProjectProfileRow {
  course_id: string;
  theme: string | null;
  atores: unknown;
  requisitos: unknown;
  suggested_themes: unknown;
  source: string;
  confidence: number | null;
  model: string | null;
  content_hash: string | null;
  updated_at: Date;
}

function toProjectProfile(r: ProjectProfileRow): ProjectProfile {
  return {
    courseId: Number(r.course_id),
    theme: r.theme ?? "",
    atores: toStrArray(r.atores),
    requisitos: toStrArray(r.requisitos),
    suggestedThemes: toStrArray(r.suggested_themes),
    source: r.source === "manual" ? "manual" : "auto",
    confidence: r.confidence,
    model: r.model,
    contentHash: r.content_hash,
    updatedAt: iso(r.updated_at),
  };
}

const PROJECT_PROFILE_COLS =
  "course_id, theme, atores, requisitos, suggested_themes, source, confidence, model, content_hash, updated_at";

export async function getProjectProfile(courseId: number): Promise<ProjectProfile | null> {
  const studentId = await getStudentId();
  const rows = await query<ProjectProfileRow>(
    `SELECT ${PROJECT_PROFILE_COLS} FROM project_profile WHERE student_id = $1 AND course_id = $2`,
    [studentId, courseId],
  );
  return rows[0] ? toProjectProfile(rows[0]) : null;
}

export interface ProjectProfileInput {
  theme?: string;
  atores?: string[];
  requisitos?: string[];
  suggestedThemes?: string[];
  source?: ProjectSource;
  confidence?: number | null;
  model?: string | null;
  contentHash?: string | null;
  raw?: unknown;
}

export async function saveProjectProfile(
  courseId: number,
  input: ProjectProfileInput,
): Promise<ProjectProfile> {
  const studentId = await getStudentId();
  const existing = await getProjectProfile(courseId);
  const theme = input.theme ?? existing?.theme ?? "";
  const atores = input.atores ?? existing?.atores ?? [];
  const requisitos = input.requisitos ?? existing?.requisitos ?? [];
  const suggestedThemes = input.suggestedThemes ?? existing?.suggestedThemes ?? [];
  const source = input.source ?? existing?.source ?? "auto";
  const confidence = input.confidence !== undefined ? input.confidence : (existing?.confidence ?? null);
  const model = input.model !== undefined ? input.model : (existing?.model ?? null);
  const contentHash = input.contentHash !== undefined ? input.contentHash : (existing?.contentHash ?? null);
  await query(
    `INSERT INTO project_profile(student_id, course_id, theme, atores, requisitos, suggested_themes, source, confidence, model, content_hash, raw_json, detected_at, updated_at)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11, now(), now())
     ON CONFLICT (student_id, course_id) DO UPDATE SET
       theme = EXCLUDED.theme,
       atores = EXCLUDED.atores,
       requisitos = EXCLUDED.requisitos,
       suggested_themes = EXCLUDED.suggested_themes,
       source = EXCLUDED.source,
       confidence = EXCLUDED.confidence,
       model = EXCLUDED.model,
       content_hash = EXCLUDED.content_hash,
       raw_json = EXCLUDED.raw_json,
       detected_at = now(),
       updated_at = now()`,
    [
      studentId,
      courseId,
      theme,
      JSON.stringify(atores),
      JSON.stringify(requisitos),
      JSON.stringify(suggestedThemes),
      source,
      confidence,
      model,
      contentHash,
      input.raw != null ? JSON.stringify(input.raw) : null,
    ],
  );
  const saved = await getProjectProfile(courseId);
  if (!saved) throw new Error(`falha ao salvar projeto do curso ${courseId}`);
  return saved;
}

interface ActivityProjectRow {
  content_item_id: string;
  needs_project: boolean;
  wants_template: boolean;
  template_fields: unknown;
  profile_mode: string;
  theme: string | null;
  atores: unknown;
  requisitos: unknown;
  confidence: number | null;
  intent: string | null;
  reason: string | null;
  source: string;
  model: string | null;
  content_hash: string | null;
  updated_at: Date;
}

function toActivityProject(r: ActivityProjectRow): ActivityProject {
  const mode: ProjectProfileMode =
    r.profile_mode === "activity" || r.profile_mode === "none" ? r.profile_mode : "main";
  return {
    contentItemId: Number(r.content_item_id),
    needsProject: r.needs_project === true,
    wantsTemplate: r.wants_template === true,
    templateFields: toStrArray(r.template_fields),
    profileMode: mode,
    theme: r.theme,
    atores: toStrArray(r.atores),
    requisitos: toStrArray(r.requisitos),
    confidence: r.confidence,
    intent: r.intent,
    reason: r.reason,
    source: r.source === "manual" ? "manual" : "auto",
    model: r.model,
    contentHash: r.content_hash,
    updatedAt: iso(r.updated_at),
  };
}

const ACTIVITY_PROJECT_COLS =
  "content_item_id, needs_project, wants_template, template_fields, profile_mode, theme, atores, requisitos, confidence, intent, reason, source, model, content_hash, updated_at";

export async function getActivityProject(itemId: number): Promise<ActivityProject | null> {
  const studentId = await getStudentId();
  const rows = await query<ActivityProjectRow>(
    `SELECT ${ACTIVITY_PROJECT_COLS} FROM activity_project WHERE student_id = $1 AND content_item_id = $2`,
    [studentId, itemId],
  );
  return rows[0] ? toActivityProject(rows[0]) : null;
}

export interface ActivityProjectInput {
  needsProject?: boolean;
  wantsTemplate?: boolean;
  templateFields?: string[];
  profileMode?: ProjectProfileMode;
  theme?: string | null;
  atores?: string[];
  requisitos?: string[];
  confidence?: number | null;
  intent?: string | null;
  reason?: string | null;
  source?: ProjectSource;
  model?: string | null;
  contentHash?: string | null;
}

export async function saveActivityProject(
  itemId: number,
  input: ActivityProjectInput,
): Promise<ActivityProject> {
  const studentId = await getStudentId();
  const existing = await getActivityProject(itemId);
  const needsProject = input.needsProject ?? existing?.needsProject ?? false;
  const wantsTemplate = input.wantsTemplate ?? existing?.wantsTemplate ?? false;
  const templateFields = input.templateFields ?? existing?.templateFields ?? [];
  const profileMode = input.profileMode ?? existing?.profileMode ?? "main";
  const theme = input.theme !== undefined ? input.theme : (existing?.theme ?? null);
  const atores = input.atores ?? existing?.atores ?? [];
  const requisitos = input.requisitos ?? existing?.requisitos ?? [];
  const confidence = input.confidence !== undefined ? input.confidence : (existing?.confidence ?? null);
  const intent = input.intent !== undefined ? input.intent : (existing?.intent ?? null);
  const reason = input.reason !== undefined ? input.reason : (existing?.reason ?? null);
  const source = input.source ?? existing?.source ?? "auto";
  const model = input.model !== undefined ? input.model : (existing?.model ?? null);
  const contentHash = input.contentHash !== undefined ? input.contentHash : (existing?.contentHash ?? null);
  await query(
    `INSERT INTO activity_project(student_id, content_item_id, needs_project, wants_template, template_fields, profile_mode, theme, atores, requisitos, confidence, intent, reason, source, model, content_hash, detected_at, updated_at)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15, now(), now())
     ON CONFLICT (content_item_id, student_id) DO UPDATE SET
       needs_project = EXCLUDED.needs_project,
       wants_template = EXCLUDED.wants_template,
       template_fields = EXCLUDED.template_fields,
       profile_mode = EXCLUDED.profile_mode,
       theme = EXCLUDED.theme,
       atores = EXCLUDED.atores,
       requisitos = EXCLUDED.requisitos,
       confidence = EXCLUDED.confidence,
       intent = EXCLUDED.intent,
       reason = EXCLUDED.reason,
       source = EXCLUDED.source,
       model = EXCLUDED.model,
       content_hash = EXCLUDED.content_hash,
       detected_at = now(),
       updated_at = now()`,
    [
      studentId,
      itemId,
      needsProject,
      wantsTemplate,
      JSON.stringify(templateFields),
      profileMode,
      theme,
      JSON.stringify(atores),
      JSON.stringify(requisitos),
      confidence,
      intent,
      reason,
      source,
      model,
      contentHash,
    ],
  );
  const saved = await getActivityProject(itemId);
  if (!saved) throw new Error(`falha ao salvar contexto do item ${itemId}`);
  return saved;
}

// ── External project source (Ajustes → Organização) ─────────────────────────

interface ProjectSourceRow {
  title: string | null;
  github_url: string | null;
  notes: string | null;
  readme_text: string;
  readme_status: string;
  readme_fetched_at: Date | null;
  updated_at: Date | null;
}

const PROJECT_SOURCE_COLS =
  "title, github_url, notes, readme_text, readme_status, readme_fetched_at, updated_at";

function toProjectSourceState(r: ProjectSourceRow | undefined): ProjectSourceState {
  if (!r) {
    return {
      title: "",
      githubUrl: "",
      notes: "",
      readmeText: "",
      readmeStatus: "none",
      readmeFetchedAt: null,
      updatedAt: null,
    };
  }
  const readmeStatus: ProjectReadmeStatus =
    r.readme_status === "ok" || r.readme_status === "empty" || r.readme_status === "error"
      ? r.readme_status
      : "none";
  return {
    title: r.title ?? "",
    githubUrl: r.github_url ?? "",
    notes: r.notes ?? "",
    readmeText: r.readme_text ?? "",
    readmeStatus,
    readmeFetchedAt: r.readme_fetched_at ? iso(r.readme_fetched_at) : null,
    updatedAt: r.updated_at ? iso(r.updated_at) : null,
  };
}

export async function getProjectSource(): Promise<ProjectSourceState> {
  const studentId = await getStudentId();
  const rows = await query<ProjectSourceRow>(
    `SELECT ${PROJECT_SOURCE_COLS} FROM project_source WHERE student_id = $1`,
    [studentId],
  );
  return toProjectSourceState(rows[0]);
}

export interface ProjectSourceInput {
  title?: string;
  githubUrl?: string;
  notes?: string;
}

export async function saveProjectSource(input: ProjectSourceInput): Promise<ProjectSourceState> {
  const studentId = await getStudentId();
  const existing = await getProjectSource();
  const title = input.title ?? existing.title;
  const githubUrl = input.githubUrl ?? existing.githubUrl;
  const notes = input.notes ?? existing.notes;
  await query(
    `INSERT INTO project_source(student_id, title, github_url, notes, updated_at)
     VALUES ($1,$2,$3,$4, now())
     ON CONFLICT (student_id) DO UPDATE SET
       title = EXCLUDED.title,
       github_url = EXCLUDED.github_url,
       notes = EXCLUDED.notes,
       updated_at = now()`,
    [studentId, title, githubUrl, notes],
  );
  return getProjectSource();
}

export async function saveProjectSourceReadme(
  text: string,
  status: ProjectReadmeStatus,
): Promise<ProjectSourceState> {
  const studentId = await getStudentId();
  await query(
    `INSERT INTO project_source(student_id, readme_text, readme_status, readme_fetched_at, updated_at)
     VALUES ($1,$2,$3, now(), now())
     ON CONFLICT (student_id) DO UPDATE SET
       readme_text = EXCLUDED.readme_text,
       readme_status = EXCLUDED.readme_status,
       readme_fetched_at = now(),
       updated_at = now()`,
    [studentId, text, status],
  );
  return getProjectSource();
}

interface ProjectSourceFileRow {
  id: string;
  filename: string;
  mime: string | null;
  size_bytes: string;
  status: string;
  char_count: number;
  created_at: Date;
}

function toProjectSourceFile(r: ProjectSourceFileRow): ProjectSourceFile {
  const status: ProjectSourceFileStatus =
    r.status === "ok" || r.status === "unsupported" || r.status === "error" ? r.status : "empty";
  return {
    id: Number(r.id),
    filename: r.filename,
    mime: r.mime,
    sizeBytes: Number(r.size_bytes),
    status,
    charCount: r.char_count,
    createdAt: iso(r.created_at),
  };
}

export async function listProjectSourceFiles(): Promise<ProjectSourceFile[]> {
  const studentId = await getStudentId();
  const rows = await query<ProjectSourceFileRow>(
    `SELECT id, filename, mime, size_bytes, status, char_count, created_at
       FROM project_source_file WHERE student_id = $1 ORDER BY id`,
    [studentId],
  );
  return rows.map(toProjectSourceFile);
}

export interface ProjectSourceFileInput {
  filename: string;
  mime: string | null;
  sizeBytes: number;
  storedPath: string;
  text: string;
  status: ProjectSourceFileStatus;
  contentHash: string | null;
}

export async function addProjectSourceFile(input: ProjectSourceFileInput): Promise<ProjectSourceFile> {
  const studentId = await getStudentId();
  const rows = await query<ProjectSourceFileRow>(
    `INSERT INTO project_source_file(student_id, filename, mime, size_bytes, stored_path, text, char_count, status, content_hash)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)
     RETURNING id, filename, mime, size_bytes, status, char_count, created_at`,
    [
      studentId,
      input.filename,
      input.mime,
      input.sizeBytes,
      input.storedPath,
      input.text,
      input.text.length,
      input.status,
      input.contentHash,
    ],
  );
  return toProjectSourceFile(rows[0]);
}

export async function getProjectSourceFilePath(id: number): Promise<string | null> {
  const studentId = await getStudentId();
  const rows = await query<{ stored_path: string }>(
    "SELECT stored_path FROM project_source_file WHERE id = $1 AND student_id = $2",
    [id, studentId],
  );
  return rows[0]?.stored_path ?? null;
}

export async function deleteProjectSourceFile(id: number): Promise<boolean> {
  const studentId = await getStudentId();
  const rows = await query<{ id: string }>(
    "DELETE FROM project_source_file WHERE id = $1 AND student_id = $2 RETURNING id",
    [id, studentId],
  );
  return rows.length > 0;
}

/** Concatenate extracted text from the student's project files, capped. */
export async function projectSourceText(maxChars: number): Promise<string> {
  const studentId = await getStudentId();
  const rows = await query<{ filename: string; text: string }>(
    `SELECT filename, text FROM project_source_file
      WHERE student_id = $1 AND status = 'ok' AND text <> '' ORDER BY id`,
    [studentId],
  );
  const chunks: string[] = [];
  let total = 0;
  for (const r of rows) {
    const block = `--- ${r.filename} ---\n${r.text}`;
    if (total + block.length > maxChars) {
      const remaining = maxChars - total;
      if (remaining > 200) chunks.push(block.slice(0, remaining));
      break;
    }
    chunks.push(block);
    total += block.length;
  }
  return chunks.join("\n\n");
}
