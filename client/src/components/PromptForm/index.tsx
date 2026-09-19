import type { FormEvent, ReactElement } from "react";

import { UI_TEXT } from "@/constants/index.js";

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
      <label className="field-label" htmlFor="prompt">
        {UI_TEXT.promptLabel}
      </label>
      <textarea
        id="prompt"
        name="prompt"
        rows={6}
        value={prompt}
        onChange={(event) => onPromptChange(event.target.value)}
      />
      <button type="submit" disabled={isRunning}>
        {isRunning ? UI_TEXT.running : UI_TEXT.runButton}
      </button>
    </form>
  );
}
