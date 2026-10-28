import { UI_TEXT } from "@constants";
import { CopyButton } from "@components/CopyButton";
import { HighlightedCode } from "@components/HighlightedCode";
import type { ChatResource } from "@models";
import { Download } from "lucide-react";
import type { ReactElement } from "react";

export type CodeFilesProps = {
  files: ChatResource[];
  status: string;
  onResourceNavigate: (resourceId: string) => void;
};

const EXTENSION_LABELS: ReadonlyMap<string, string> = new Map([
  ["css", "css"],
  ["html", "html"],
  ["js", "js"],
  ["json", "json"],
  ["jsx", "jsx"],
  ["md", "md"],
  ["py", "py"],
  ["sh", "bash"],
  ["ts", "ts"],
  ["tsx", "tsx"],
]);

function looksLikeShell(content: string): boolean {
  return (
    /^#!.*\b(?:ba|z|k)?sh\b/m.test(content) ||
    /^\s*(?:echo|export|cd|pwd|grep|sed|awk|cat|chmod|curl|wget|npm|pnpm|yarn)\b/m.test(content)
  );
}

function getLanguageLabel(path: string, content: string): string | undefined {
  const extension: string | undefined = path.split(".").pop()?.toLowerCase();

  if (extension === undefined || extension === path.toLowerCase()) {
    return undefined;
  }

  if (extension === "txt" && looksLikeShell(content)) {
    return "bash";
  }

  return EXTENSION_LABELS.get(extension) ?? extension;
}

export function downloadResource(file: Pick<ChatResource, "path" | "content">): void {
  const blob: Blob = new Blob([file.content], { type: "text/plain;charset=utf-8" });
  const objectUrl: string = URL.createObjectURL(blob);
  const downloadLink: HTMLAnchorElement = document.createElement("a");

  downloadLink.href = objectUrl;
  downloadLink.download = file.path;
  downloadLink.click();
  URL.revokeObjectURL(objectUrl);
}

export function CodeFiles({ files, status, onResourceNavigate }: CodeFilesProps): ReactElement {
  return (
    <section
      className="code-section"
      aria-label="Resources"
      aria-labelledby="resources-title"
    >
      <h2 id="resources-title">{UI_TEXT.codeTitle}</h2>
      <p className="status" role="status">
        {status}
      </p>
      <div className="code-files">
        {files.map((file: ChatResource) => {
          const languageLabel: string | undefined = file.language ?? getLanguageLabel(file.path, file.content);

          return (
            <article className="code-file" key={file.id}>
              <header className="code-file-header">
                <button
                  className="code-file-link"
                  type="button"
                  aria-label={`Go to ${file.path} in chat`}
                  onClick={() => onResourceNavigate(file.id)}
                >
                  {languageLabel ? <span className="code-language-label">{languageLabel}</span> : null}
                  <h3>{file.path}</h3>
                </button>
                <div className="code-file-actions">
                  <button
                    className="download-button"
                    type="button"
                    aria-label={`Download ${file.path}`}
                    data-tooltip="Download"
                    data-tooltip-placement="top"
                    onClick={() => downloadResource(file)}
                  >
                    <Download aria-hidden="true" />
                  </button>
                  <CopyButton text={file.content} label="Copy file" />
                </div>
              </header>
              <pre>
                <HighlightedCode code={file.content} language={languageLabel} />
              </pre>
            </article>
          );
        })}
      </div>
    </section>
  );
}
