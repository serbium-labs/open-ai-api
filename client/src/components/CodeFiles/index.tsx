import { UI_TEXT } from "@constants";
import type { CodeFile } from "@models";
import type { ReactElement } from "react";

export type CodeFilesProps = {
  files: CodeFile[];
  status: string;
};

export function CodeFiles({ files, status }: CodeFilesProps): ReactElement {
  return (
    <section className="code-section" aria-labelledby="code-to-edit-title">
      <h2 id="code-to-edit-title">{UI_TEXT.codeTitle}</h2>
      <p className="status" role="status">
        {status}
      </p>
      <div className="code-files">
        {files.map((file: CodeFile) => (
          <article className="code-file" key={file.path}>
            <h3>{file.path}</h3>
            <pre>{file.content}</pre>
          </article>
        ))}
      </div>
    </section>
  );
}
