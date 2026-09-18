import { Router, type Request, type Response } from "express";

import { HTTP_STATUS } from "../../constants/index.js";
import type { CodexService } from "../../services/codex/index.js";
import type { ResponseStorage } from "../../services/responses/index.js";
import type { CodexRequestBody, CodexSuccessResponse, ErrorResponse } from "../../types/index.js";

export function createCodexRouter(
  codexService: CodexService,
  responseStorage: ResponseStorage,
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
