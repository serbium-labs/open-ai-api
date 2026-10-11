import { UI_TEXT } from "@constants";
import { CopyButton } from "@components/CopyButton";
import { HighlightedCode } from "@components/HighlightedCode";
import type { ChatResource } from "@models";
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
                <CopyButton text={file.content} label="Copy file" />
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
