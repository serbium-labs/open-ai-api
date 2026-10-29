import { CopyButton } from "@components/CopyButton";
import { HighlightedCode } from "@components/HighlightedCode";
import { UI_TEXT } from "@constants";
import type { ChatAttachment, ChatResource } from "@models";
import { Download } from "lucide-react";
import type { ReactElement } from "react";

export type AttachmentResource = ChatAttachment & {
  id: string;
  kind: "attachment";
  messageId: string;
  url?: string;
};

export type DisplayResource =
  | (ChatResource & { kind: "code" })
  | AttachmentResource;

type MessageWithAttachments = {
  id: string;
  attachments: Array<ChatAttachment & { previewUrl?: string }>;
};

export type CodeFilesProps = {
  files: DisplayResource[];
  status: string;
  onResourceNavigate: (resourceId: string) => void;
};

const EXTENSION_LABELS: ReadonlyMap<string, string> = new Map([
  ["css", "css"], ["html", "html"], ["js", "js"], ["json", "json"],
  ["jsx", "jsx"], ["md", "md"], ["py", "py"], ["sh", "bash"],
  ["ts", "ts"], ["tsx", "tsx"],
]);

function attachmentUrl(chatId: string, path: string): string {
  return `/api/chats/${encodeURIComponent(chatId)}/attachments/${encodeURIComponent(path)}`;
}

export function combineResources(
  files: ChatResource[],
  messages: MessageWithAttachments[],
  chatId: string | undefined,
): DisplayResource[] {
  const attachments: AttachmentResource[] = messages.flatMap((message: MessageWithAttachments) =>
    message.attachments.map((attachment, index: number) => ({
      ...attachment,
      id: `attachment-${message.id}-${index}`,
      kind: "attachment" as const,
      messageId: message.id,
      url: attachment.previewUrl ??
        (chatId !== undefined && attachment.path !== ""
          ? attachmentUrl(chatId, attachment.path)
          : undefined),
    })),
  );

  return [...files.map((file: ChatResource) => ({ ...file, kind: "code" as const })), ...attachments];
}

function looksLikeShell(content: string): boolean {
  return /^#!.*\b(?:ba|z|k)?sh\b/m.test(content) ||
    /^\s*(?:echo|export|cd|pwd|grep|sed|awk|cat|chmod|curl|wget|npm|pnpm|yarn)\b/m.test(content);
}

function getLanguageLabel(path: string, content: string): string | undefined {
  const extension: string | undefined = path.split(".").pop()?.toLowerCase();
  if (extension === undefined || extension === path.toLowerCase()) return undefined;
  if (extension === "txt" && looksLikeShell(content)) return "bash";
  return EXTENSION_LABELS.get(extension) ?? extension;
}

export function downloadResource(file: Pick<ChatResource, "path" | "content">): void {
  const blob: Blob = new Blob([file.content], { type: "text/plain;charset=utf-8" });
  downloadUrl(URL.createObjectURL(blob), file.path, true);
}

export function downloadUrl(url: string, name: string, revoke = false): void {
  const downloadLink: HTMLAnchorElement = document.createElement("a");
  downloadLink.href = url;
  downloadLink.download = name;
  downloadLink.click();
  if (revoke) URL.revokeObjectURL(url);
}

function DownloadButton({ name, onClick, disabled = false }: {
  name: string;
  onClick: () => void;
  disabled?: boolean;
}): ReactElement {
  return (
    <button className="download-button" type="button" aria-label={`Download ${name}`}
      data-tooltip="Download" data-tooltip-placement="top" disabled={disabled} onClick={onClick}>
      <Download aria-hidden="true" />
    </button>
  );
}

function AttachmentCard({ file, onResourceNavigate }: {
  file: AttachmentResource;
  onResourceNavigate: (resourceId: string) => void;
}): ReactElement {
  return (
    <article className="code-file attachment-resource">
      <header className="code-file-header">
        <button className="code-file-link" type="button"
          aria-label={`Go to ${file.name} in chat`} onClick={() => onResourceNavigate(file.id)}>
          <span className="code-language-label">{file.mimeType.split("/")[0] || "file"}</span>
          <h3>{file.name}</h3>
        </button>
        <div className="code-file-actions">
          <DownloadButton name={file.name} disabled={file.url === undefined}
            onClick={() => file.url !== undefined && downloadUrl(file.url, file.name)} />
        </div>
      </header>
      {file.mimeType.startsWith("image/") && file.url !== undefined ? (
        <a className="attachment-resource-preview" href={file.url} target="_blank" rel="noreferrer">
          <img src={file.url} alt={file.name} loading="lazy" />
        </a>
      ) : file.mimeType.startsWith("audio/") && file.url !== undefined ? (
        <div className="attachment-resource-audio">
          <audio controls preload="metadata" src={file.url}>Audio preview unavailable.</audio>
        </div>
      ) : (
        <div className="attachment-resource-file">
          <span aria-hidden="true">📎</span>
          <span>{file.mimeType || "application/octet-stream"}</span>
        </div>
      )}
    </article>
  );
}

export function CodeFiles({ files, status, onResourceNavigate }: CodeFilesProps): ReactElement {
  return (
    <section className="code-section" aria-label="Resources" aria-labelledby="resources-title">
      <h2 id="resources-title">{UI_TEXT.codeTitle}</h2>
      <p className="status" role="status">{status}</p>
      <div className="code-files">
        {files.map((file: DisplayResource) => {
          if (file.kind === "attachment") {
            return <AttachmentCard key={file.id} file={file} onResourceNavigate={onResourceNavigate} />;
          }
          const languageLabel: string | undefined = file.language ?? getLanguageLabel(file.path, file.content);
          return (
            <article className="code-file" key={file.id}>
              <header className="code-file-header">
                <button className="code-file-link" type="button" aria-label={`Go to ${file.path} in chat`}
                  onClick={() => onResourceNavigate(file.id)}>
                  {languageLabel ? <span className="code-language-label">{languageLabel}</span> : null}
                  <h3>{file.path}</h3>
                </button>
                <div className="code-file-actions">
                  <DownloadButton name={file.path} onClick={() => downloadResource(file)} />
                  <CopyButton text={file.content} label="Copy file" />
                </div>
              </header>
              <pre><HighlightedCode code={file.content} language={languageLabel} /></pre>
            </article>
          );
        })}
      </div>
    </section>
  );
}
