import { type ReactElement } from "react";
import hljs from "highlight.js/lib/core";
import bash from "highlight.js/lib/languages/bash";
import css from "highlight.js/lib/languages/css";
import javascript from "highlight.js/lib/languages/javascript";
import json from "highlight.js/lib/languages/json";
import markdown from "highlight.js/lib/languages/markdown";
import python from "highlight.js/lib/languages/python";
import typescript from "highlight.js/lib/languages/typescript";
import xml from "highlight.js/lib/languages/xml";

hljs.registerLanguage("bash", bash);
hljs.registerLanguage("css", css);
hljs.registerLanguage("html", xml);
hljs.registerLanguage("javascript", javascript);
hljs.registerLanguage("js", javascript);
hljs.registerLanguage("json", json);
hljs.registerLanguage("jsx", javascript);
hljs.registerLanguage("markdown", markdown);
hljs.registerLanguage("md", markdown);
hljs.registerLanguage("python", python);
hljs.registerLanguage("py", python);
hljs.registerLanguage("sh", bash);
hljs.registerLanguage("shell", bash);
hljs.registerLanguage("typescript", typescript);
hljs.registerLanguage("ts", typescript);
hljs.registerLanguage("tsx", typescript);

export type HighlightedCodeProps = {
  code: string;
  language?: string;
};

function normalizeLanguage(language: string | undefined): string | undefined {
  if (language === undefined) {
    return undefined;
  }

  const normalized: string = language.toLowerCase();
  return hljs.getLanguage(normalized) === undefined ? undefined : normalized;
}

export function HighlightedCode({ code, language }: HighlightedCodeProps): ReactElement {
  const normalizedLanguage: string | undefined = normalizeLanguage(language);
  const highlightedCode: string =
    normalizedLanguage === undefined
      ? hljs.highlightAuto(code).value
      : hljs.highlight(code, { language: normalizedLanguage }).value;

  return (
    <code
      className={normalizedLanguage ? `language-${normalizedLanguage}` : undefined}
      dangerouslySetInnerHTML={{ __html: highlightedCode }}
    />
  );
}
