/** Falls back to execCommand where the Clipboard API is unavailable. */
export async function copyText(text: string) {
  try {
    await navigator.clipboard.writeText(text);
  } catch {
    const scratch = Object.assign(document.createElement("textarea"), {
      value: text,
    });
    document.body.append(scratch);
    scratch.select();
    document.execCommand("copy");
    scratch.remove();
  }
}
