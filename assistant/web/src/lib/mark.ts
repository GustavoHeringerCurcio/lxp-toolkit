import { fetchSubmission, markComplete, type SubmissionDto } from "@/api";

/**
 * Trigger "mark as completed" on the portal and poll until the runner reports a
 * terminal status. Mirrors the send flow: the request returns immediately with
 * `running` while the browser runner fresh-logins.
 */
export async function runMark(id: number, onUpdate?: (s: SubmissionDto) => void): Promise<SubmissionDto> {
  const started = await markComplete(id);
  onUpdate?.(started);
  let final = started;
  const deadline = Date.now() + 150_000;
  while (Date.now() < deadline) {
    await new Promise((r) => setTimeout(r, 2_500));
    const cur = await fetchSubmission(id);
    if (cur && cur.status !== "running") {
      final = cur;
      onUpdate?.(cur);
      break;
    }
  }
  return final;
}
