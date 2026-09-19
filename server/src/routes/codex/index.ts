import { Router, type Request, type Response } from "express";

import { HTTP_STATUS } from "#constants";
import type { CodexService } from "#services/codex";
import type { OutputCodeService } from "#services/output-code";
import type { ResponseStorage } from "#services/responses";
import type { CodexRequestBody, CodexSuccessResponse, ErrorResponse } from "#models";

export function createCodexRouter(
  codexService: CodexService,
  responseStorage: ResponseStorage,
  outputCodeService: OutputCodeService,
): Router {
  const router: Router = Router();

  router.post(
    "/",
    async (
      request: Request<Record<string, never>, CodexSuccessResponse | ErrorResponse, CodexRequestBody>,
      response: Response<CodexSuccessResponse | ErrorResponse>,
    ) => {
      try {
        const prompt: string = typeof request.body.prompt === "string" ? request.body.prompt.trim() : "";

        if (!prompt) {
          response.status(HTTP_STATUS.badRequest).json({ error: "Prompt is required" });
          return;
        }

        const finalResponse: string = await codexService.run(prompt);
        await responseStorage.save(finalResponse);
        await outputCodeService.saveResponseChunks(finalResponse);
        response.status(HTTP_STATUS.ok).json({ finalResponse });
      } catch (error: unknown) {
        response.status(HTTP_STATUS.internalServerError).json({
          error: error instanceof Error ? error.message : "Unexpected server error",
        });
      }
    },
  );

  return router;
}
