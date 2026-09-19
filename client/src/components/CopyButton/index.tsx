import { useEffect, useState, type ReactElement } from "react";

export type CopyButtonProps = {
  text: string;
  label?: string;
};

const COPIED_RESET_DELAY_MS: number = 1400;

export function CopyButton({ text, label = "Copy" }: CopyButtonProps): ReactElement {
  const [isCopied, setIsCopied] = useState<boolean>(false);

  useEffect(() => {
    if (!isCopied) {
      return undefined;
    }

    const timeoutId: number = window.setTimeout(() => setIsCopied(false), COPIED_RESET_DELAY_MS);
    return () => window.clearTimeout(timeoutId);
  }, [isCopied]);

  async function handleCopy(): Promise<void> {
    try {
      await navigator.clipboard.writeText(text);
      setIsCopied(true);
    } catch {
      setIsCopied(false);
    }
  }

  return (
    <button
      className={`copy-button${isCopied ? " copy-button-copied" : ""}`}
      type="button"
      aria-label={isCopied ? "Copied" : label}
      data-tooltip={isCopied ? "Copied" : label}
      onClick={() => {
        void handleCopy();
      }}
    >
      {isCopied ? (
        <svg aria-hidden="true" viewBox="0 0 24 24" focusable="false">
          <path d="m9.2 16.6-4.1-4.1-1.4 1.4 5.5 5.5L21 7.6 19.6 6.2 9.2 16.6Z" />
        </svg>
      ) : (
        <svg aria-hidden="true" viewBox="0 0 24 24" focusable="false">
          <path d="M8 7a3 3 0 0 1 3-3h6a3 3 0 0 1 3 3v6a3 3 0 0 1-3 3v-2a1 1 0 0 0 1-1V7a1 1 0 0 0-1-1h-6a1 1 0 0 0-1 1H8Zm-4 4a3 3 0 0 1 3-3h6a3 3 0 0 1 3 3v6a3 3 0 0 1-3 3H7a3 3 0 0 1-3-3v-6Zm3-1a1 1 0 0 0-1 1v6a1 1 0 0 0 1 1h6a1 1 0 0 0 1-1v-6a1 1 0 0 0-1-1H7Z" />
        </svg>
      )}
    </button>
  );
}
