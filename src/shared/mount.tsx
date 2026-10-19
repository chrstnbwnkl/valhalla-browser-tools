import "../theme/theme.css";
import { StrictMode, type ReactNode } from "react";
import { createRoot } from "react-dom/client";

export function mount(app: ReactNode) {
  createRoot(document.getElementById("root")!).render(
    <StrictMode>{app}</StrictMode>,
  );
}
