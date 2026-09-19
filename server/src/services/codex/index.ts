import { Codex, type RunResult, type SandboxMode, type ThreadOptions } from "@openai/codex-sdk";

import { CODEX_SANDBOX_MODE } from "#constants";

export type CodexThread = {
  run(prompt: string): Promise<RunResult>;
};

export type CodexClient = {
  startThread(options: ThreadOptions & {
    workingDirectory: string;
    sandboxMode: SandboxMode;
    skipGitRepoCheck: boolean;
  }): CodexThread;
};

export type CodexConstructor = new () => CodexClient;

export type CodexServiceDependencies = {
  CodexClient?: CodexConstructor;
  workingDirectory: string;
};

const EDIT_INSTRUCTION_LINES: readonly string[] = [
  "Work directly on the files in the current workspace.",
  "Inspect the relevant files and apply the requested edits on disk; do not only describe or print proposed code.",
];

export class CodexService {
  private readonly CodexClient: CodexConstructor;
  private readonly workingDirectory: string;

  public constructor({ CodexClient = Codex, workingDirectory }: CodexServiceDependencies) {
    this.CodexClient = CodexClient;
    this.workingDirectory = workingDirectory;
  }

  public async run(prompt: string): Promise<string> {
    const codex: CodexClient = new this.CodexClient();
    const thread: CodexThread = codex.startThread({
      workingDirectory: this.workingDirectory,
      sandboxMode: CODEX_SANDBOX_MODE,
      skipGitRepoCheck: true,
    });

    const turn: RunResult = await thread.run(`${EDIT_INSTRUCTION_LINES.join(" ")}\n\nUser request:\n${prompt}`);

    return turn.finalResponse;
  }
}
