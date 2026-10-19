import { useEffect, useState } from 'react';
import { copyText } from '../clipboard';
import { Button, type ButtonProps } from './Button';

/** Copies `text` on click and says so for a moment. */
export function CopyButton({ text, children = 'Copy', ...props }: Omit<ButtonProps, 'onClick'> & { text: string }) {
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (!copied) return;
    const timer = setTimeout(() => setCopied(false), 1200);
    return () => clearTimeout(timer);
  }, [copied]);

  return (
    <Button
      {...props}
      onClick={async () => {
        await copyText(text);
        setCopied(true);
      }}
    >
      {copied ? 'Copied' : children}
    </Button>
  );
}
