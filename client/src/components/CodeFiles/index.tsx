import { UI_TEXT } from "@constants";
import { CopyButton } from "@components/CopyButton";
import { HighlightedCode } from "@components/HighlightedCode";
import type { CodeFile } from "@models";
import type { ReactElement } from "react";

export type CodeFilesProps = {
  files: CodeFile[];
  status: string;
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

export function CodeFiles({ files, status }: CodeFilesProps): ReactElement {
  return (
    <section
      className="code-section"
      aria-label="Generated code block responses"
      aria-labelledby="code-block-responses-title"
    >
      <h2 id="code-block-responses-title">{UI_TEXT.codeTitle}</h2>
      <p className="status" role="status">
        {status}
      </p>
      <div className="code-files">
        {files.map((file: CodeFile) => {
          const languageLabel: string | undefined = getLanguageLabel(file.path, file.content);

          return (
            <article className="code-file" key={file.path}>
              <header className="code-file-header">
                <div className="code-file-meta">
                  {languageLabel ? <span className="code-language-label">{languageLabel}</span> : null}
                  <h3>{file.path}</h3>
                </div>
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
