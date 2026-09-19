import { useEffect, useRef, type FormEvent, type KeyboardEvent, type ReactElement } from "react";

import { UI_TEXT } from "@constants";

export type PromptFormProps = {
  prompt: string;
  isRunning: boolean;
  onPromptChange: (prompt: string) => void;
  onSubmit: (prompt: string) => void;
};

export function PromptForm({
  prompt,
  isRunning,
  onPromptChange,
  onSubmit,
}: PromptFormProps): ReactElement {
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const isPromptEmpty: boolean = prompt.trim() === "";
  const isSubmitDisabled: boolean = isRunning || isPromptEmpty;
  const submitTooltip: string = isRunning
    ? UI_TEXT.running
    : isPromptEmpty
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

  function handleSubmit(event: FormEvent<HTMLFormElement>): void {
    event.preventDefault();
    if (isSubmitDisabled) {
      return;
    }

    onSubmit(prompt);
  }

  function handleKeyDown(event: KeyboardEvent<HTMLTextAreaElement>): void {
    if (event.key !== "Enter" || event.shiftKey) {
      return;
    }

    event.preventDefault();
    if (!isSubmitDisabled) {
      onSubmit(prompt);
    }
  }

  return (
    <form className="prompt-form" onSubmit={handleSubmit}>
      <div className="prompt-composer">
        <textarea
          ref={textareaRef}
          id="prompt"
          name="prompt"
          rows={1}
          aria-label="Message"
          placeholder={UI_TEXT.promptPlaceholder}
          value={prompt}
          disabled={isRunning}
          onChange={(event) => onPromptChange(event.target.value)}
          onKeyDown={handleKeyDown}
        />
        <button
          className={`send-button${isRunning ? " send-button-running" : ""}`}
          type="submit"
          disabled={isSubmitDisabled}
          aria-label={submitTooltip}
          data-tooltip={submitTooltip}
        >
          <svg aria-hidden="true" viewBox="0 0 24 24" focusable="false">
            <path d="M12 5 5.5 11.5l1.4 1.4 4.1-4.08V19h2V8.82l4.1 4.08 1.4-1.4L12 5Z" />
          </svg>
        </button>
      </div>
    </form>
  );
}
