import { Codex, type ThreadEvent, type ThreadOptions } from "@openai/codex-sdk";

import { CODEX_SANDBOX_MODE } from "#constants";

export type CodexThread = {
  runStreamed(prompt: string): Promise<{ events: AsyncGenerator<ThreadEvent> }>;
};

export type CodexClient = {
  startThread(options: ThreadOptions): CodexThread;
  resumeThread(id: string, options: ThreadOptions): CodexThread;
};

export type CodexConstructor = new () => CodexClient;

export type CodexServiceDependencies = {
  CodexClient?: CodexConstructor;
  workingDirectory: string;
  model: string;
};

const EDIT_INSTRUCTION_LINES: readonly string[] = [
  "Return output code chunks as fenced code blocks.",
  "When a code block represents a file, include a safe relative path in the fence info such as ```js src/example.js.",
  "For Markdown files, use a fenced code block with md or markdown and a .md path such as ```md docs/example.md.",
  "Do not rely on pre-existing generated files and do not apply edits on disk.",
];

export class CodexService {
  private readonly CodexClient: CodexConstructor;
  private readonly workingDirectory: string;
  private readonly model: string;

  public constructor({ CodexClient = Codex, workingDirectory, model }: CodexServiceDependencies) {
    this.CodexClient = CodexClient;
    this.workingDirectory = workingDirectory;
    this.model = model;
  }

  public async run(
    prompt: string,
    threadId?: string,
    onThreadStarted?: (id: string) => Promise<void>,
  ): Promise<string> {
    const codex: CodexClient = new this.CodexClient();
    const options: ThreadOptions = {
      model: this.model,
      workingDirectory: this.workingDirectory,
      sandboxMode: CODEX_SANDBOX_MODE,
      skipGitRepoCheck: true,
    };
    const thread = threadId === undefined
      ? codex.startThread(options)
      : codex.resumeThread(threadId, options);

    const { events } = await thread.runStreamed(`${EDIT_INSTRUCTION_LINES.join(" ")}\n\nUser request:\n${prompt}`);
    let finalResponse = "";
    for await (const event of events) {
      if (event.type === "thread.started" && threadId === undefined) {
        await onThreadStarted?.(event.thread_id);
        threadId = event.thread_id;
      } else if (event.type === "item.completed" && event.item.type === "agent_message") {
        finalResponse = event.item.text;
      } else if (event.type === "turn.failed") {
        throw new Error(event.error.message);
      }
    }

    return finalResponse;
  }
}
