import type { FormEvent, ReactElement } from "react";

import { UI_TEXT } from "@constants";

export type PromptFormProps = {
  prompt: string;
  isRunning: boolean;
  onPromptChange: (prompt: string) => void;
  onSubmit: () => void;
};

export function PromptForm({
  prompt,
  isRunning,
  onPromptChange,
  onSubmit,
}: PromptFormProps): ReactElement {
  function handleSubmit(event: FormEvent<HTMLFormElement>): void {
    event.preventDefault();
    onSubmit();
  }

  return (
    <form className="prompt-form" onSubmit={handleSubmit}>
      <textarea
        id="prompt"
        name="prompt"
        rows={6}
        aria-label="Message"
        placeholder={UI_TEXT.promptPlaceholder}
        value={prompt}
        onChange={(event) => onPromptChange(event.target.value)}
      />
      <button type="submit" disabled={isRunning}>
        {isRunning ? UI_TEXT.running : UI_TEXT.runButton}
      </button>
    </form>
  );
}
