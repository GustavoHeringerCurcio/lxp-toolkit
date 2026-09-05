import type { Exercise } from "./types.js";

/**
 * Sending submissions is gated behind an explicit intent AND a captured endpoint.
 *
 * The LXP SUBMIT endpoints (quiz answer POST, file-upload multipart POST) have not been
 * captured yet — see ../docs/gaps.md in the study repo. These functions refuse to do
 * anything until a real contract exists, so no accidental submission can reach the portal.
 */

export function submitQuiz(_e: Exercise, _answers: { questionId: number; option: string }[]): never {
  throw new Error(
    "submitQuiz: quiz submit endpoint ainda não capturado. " +
      "Capture-o em uma sessão controlada (npm run capture-api -- --url <quiz> --headful) e implemente em src/ai.ts/submit.",
  );
}

export function submitUpload(_e: Exercise, _filePath: string): never {
  throw new Error(
    "submitUpload: endpoint de envio de arquivo ainda não capturado. " +
      "Veja docs/gaps.md do repositório de estudo e implemente após a captura.",
  );
}
