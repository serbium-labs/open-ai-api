import type { ReactElement } from "react";

export type ResponsePanelProps = {
  responseText: string;
};

export function ResponsePanel({ responseText }: ResponsePanelProps): ReactElement {
  return (
    <pre className="response-panel" aria-live="polite">
      {responseText}
    </pre>
  );
}
