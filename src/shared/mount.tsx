import '../theme/theme.css';
import { StrictMode, type ReactNode } from 'react';
import { createRoot } from 'react-dom/client';

/** Renders a tool's root component into its page's #root. */
export function mount(app: ReactNode) {
  createRoot(document.getElementById('root')!).render(<StrictMode>{app}</StrictMode>);
}
