import { useEffect, useState, type ReactElement } from "react";

import { fetchCodeFiles, submitAndRefresh } from "@api";
import { CodeFiles } from "@components/CodeFiles";
import { PromptForm } from "@components/PromptForm";
import { ResponsePanel } from "@components/ResponsePanel";
import { DEFAULT_PROMPT, UI_TEXT } from "@constants";
import type { CodeFile } from "@models";

function getCodeStatus(files: CodeFile[]): string {
  if (files.length === 0) {
    return UI_TEXT.emptyCode;
  }

  return `${files.length} file${files.length === 1 ? "" : "s"}`;
}

function getErrorMessage(error: unknown, fallback: string): string {
  return error instanceof Error ? error.message : fallback;
}

export function App(): ReactElement {
  const [prompt, setPrompt] = useState<string>(DEFAULT_PROMPT);
  const [files, setFiles] = useState<CodeFile[]>([]);
  const [codeStatus, setCodeStatus] = useState<string>(UI_TEXT.loadingCode);
  const [responseText, setResponseText] = useState<string>("");
  const [isRunning, setIsRunning] = useState<boolean>(false);

  useEffect(() => {
    let isMounted = true;

    async function loadCode(): Promise<void> {
      setCodeStatus(UI_TEXT.loadingCode);

      try {
        const codeFiles: CodeFile[] = await fetchCodeFiles();

        if (!isMounted) {
          return;
        }

        setFiles(codeFiles);
        setCodeStatus(getCodeStatus(codeFiles));
      } catch (error: unknown) {
        if (isMounted) {
          setCodeStatus(`Unable to load code: ${getErrorMessage(error, UI_TEXT.unexpectedError)}`);
        }
      }
    }

    void loadCode();

    return () => {
      isMounted = false;
    };
  }, []);

  async function handleSubmit(): Promise<void> {
    setIsRunning(true);
    setResponseText(UI_TEXT.running);

    try {
      await submitAndRefresh(prompt, {
        onFinalResponse(finalResponse: string): void {
          setResponseText(finalResponse);
        },
        onCodeFiles(codeFiles: CodeFile[]): void {
          setFiles(codeFiles);
          setCodeStatus(getCodeStatus(codeFiles));
        },
      });
    } catch (error: unknown) {
      const message: string = getErrorMessage(error, UI_TEXT.unexpectedError);

      if (responseText === UI_TEXT.running || responseText === "") {
        setResponseText(message);
      } else {
        setCodeStatus(`Unable to refresh code: ${message}`);
      }
    } finally {
      setIsRunning(false);
    }
  }

  return (
    <main className="app-shell">
      <h1>{UI_TEXT.title}</h1>
      <PromptForm
        prompt={prompt}
        isRunning={isRunning}
        onPromptChange={setPrompt}
        onSubmit={() => {
          void handleSubmit();
        }}
      />
      <CodeFiles files={files} status={codeStatus} />
      <ResponsePanel responseText={responseText} />
    </main>
  );
}
