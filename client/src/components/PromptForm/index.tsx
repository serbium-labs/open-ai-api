import {
  useEffect,
  useRef,
  useState,
  type ChangeEvent,
  type FormEvent,
  type KeyboardEvent,
  type ReactElement,
} from "react";

import { UI_TEXT } from "@constants";
import {
  File,
  FileArchive,
  FileImage,
  FileSpreadsheet,
  FileText,
  Paperclip,
  type LucideIcon,
} from "lucide-react";

export type PromptFormProps = {
  prompt: string;
  isRunning: boolean;
  submitError: string | null;
  onPromptChange: (prompt: string) => void;
  onSubmit: (prompt: string, attachment: File | null) => Promise<boolean>;
};

function getFileIcon(file: File): LucideIcon {
  const fileName = file.name.toLowerCase();
  const fileType = file.type.toLowerCase();

  if (fileType.startsWith("image/")) {
    return FileImage;
  }

  if (
    fileType === "application/pdf" ||
    fileName.endsWith(".pdf") ||
    fileName.endsWith(".doc") ||
    fileName.endsWith(".docx") ||
    fileType.startsWith("text/")
  ) {
    return FileText;
  }

  if (
    fileName.endsWith(".xls") ||
    fileName.endsWith(".xlsx") ||
    fileName.endsWith(".csv")
  ) {
    return FileSpreadsheet;
  }

  if (
    fileName.endsWith(".zip") ||
    fileName.endsWith(".rar") ||
    fileName.endsWith(".7z")
  ) {
    return FileArchive;
  }

  return File;
}

export function PromptForm({
  prompt,
  isRunning,
  submitError,
  onPromptChange,
  onSubmit,
}: PromptFormProps): ReactElement {
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [attachment, setAttachment] = useState<File | null>(null);

  const isPromptEmpty: boolean = prompt.trim() === "";
  const hasAttachment: boolean = attachment !== null;

  const isSubmitDisabled: boolean =
    isRunning || (isPromptEmpty && !hasAttachment);

  const submitTooltip: string = isRunning
    ? hasAttachment
      ? "Sending attachment..."
      : UI_TEXT.running
    : isPromptEmpty && !hasAttachment
      ? UI_TEXT.emptyPromptTooltip
      : UI_TEXT.runButton;

  useEffect(() => {
    const textarea: HTMLTextAreaElement | null = textareaRef.current;

    if (textarea === null) {
      return;
    }

    textarea.style.height = "auto";
    textarea.style.height = `${textarea.scrollHeight}px`;
  }, [prompt]);

  function handleAttachmentChange(
    event: ChangeEvent<HTMLInputElement>,
  ): void {
    const file: File | undefined = event.target.files?.[0];

    if (file === undefined) {
      return;
    }

    setAttachment(file);
  }

  function removeAttachment(): void {
    setAttachment(null);

    if (fileInputRef.current !== null) {
      fileInputRef.current.value = "";
    }
  }

  async function submitMessage(): Promise<void> {
    if (isSubmitDisabled) {
      return;
    }

    const wasSent = await onSubmit(prompt, attachment);

    if (!wasSent) {
      return;
    }

    setAttachment(null);

    if (fileInputRef.current !== null) {
      fileInputRef.current.value = "";
    }
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>): void {
    event.preventDefault();
    void submitMessage();
  }

  function handleKeyDown(
    event: KeyboardEvent<HTMLTextAreaElement>,
  ): void {
    if (event.key !== "Enter" || event.shiftKey) {
      return;
    }

    event.preventDefault();
    void submitMessage();
  }

  return (
    <form className="prompt-form" onSubmit={handleSubmit}>
      <div className="prompt-composer">
        {attachment !== null && (
          <div className="attachment-preview">
            <span className="attachment-icon" aria-hidden="true">
              {(() => {
                const Icon = getFileIcon(attachment);
                return <Icon size={20} strokeWidth={1.75} />;
              })()}
            </span>

            <span className="attachment-name">
              {attachment.name}
            </span>

            {isRunning ? (
              <span className="attachment-status">
                Sending attachment...
              </span>
            ) : (
              <button
                className="attachment-remove-button"
                type="button"
                aria-label="Remove attachment"
                onClick={removeAttachment}
              >
                ×
              </button>
            )}
          </div>
        )}

        {submitError !== null && (
          <p className="attachment-status" role="alert">
            Send failed: {submitError}. Please retry.
          </p>
        )}

        <div className="prompt-input-row">
          <input
            ref={fileInputRef}
            className="attachment-input"
            type="file"
            aria-label="Attach file"
            disabled={isRunning}
            onChange={handleAttachmentChange}
          />

          <button
            className="attachment-button"
            type="button"
            disabled={isRunning}
            aria-label="Attach file"
            data-tooltip="Attach file"
            onClick={() => fileInputRef.current?.click()}
          >
            <Paperclip size={20} strokeWidth={1.75} aria-hidden="true" />
          </button>

          <textarea
            ref={textareaRef}
            id="prompt"
            name="prompt"
            rows={1}
            aria-label="Message"
            placeholder={UI_TEXT.promptPlaceholder}
            value={prompt}
            disabled={isRunning}
            onChange={(event) =>
              onPromptChange(event.target.value)
            }
            onKeyDown={handleKeyDown}
          />

          <button
            className={`send-button${
              isRunning ? " send-button-running" : ""
            }`}
            type="submit"
            disabled={isSubmitDisabled}
            aria-label={submitTooltip}
            data-tooltip={submitTooltip}
          >
            <svg
              aria-hidden="true"
              viewBox="0 0 24 24"
              focusable="false"
            >
              <path d="M12 5 5.5 11.5l1.4 1.4 4.1-4.08V19h2V8.82l4.1 4.08 1.4-1.4L12 5Z" />
            </svg>
          </button>
        </div>
      </div>
    </form>
  );
}