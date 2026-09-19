import { StrictMode } from "react";
import { createRoot, type Root } from "react-dom/client";

import { App } from "@/App/index.js";
import "@/styles.css";

const rootElement: HTMLElement | null = document.querySelector("#root");

if (rootElement === null) {
  throw new Error("Root element was not found.");
}

const root: Root = createRoot(rootElement);

root.render(
  <StrictMode>
    <App />
  </StrictMode>,
);
