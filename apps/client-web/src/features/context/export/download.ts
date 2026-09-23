/**
 * Starts a browser download for a generated document.
 *
 * The object URL must stay alive after the click (revoking it synchronously
 * cancels the transfer), and inside the embedded preview a framed document is
 * often not allowed to start a download, so the click is delegated to a
 * same-origin top-level window which keeps the intended file name.
 */
export function downloadBlob(blob: Blob, fileName: string): void {
  const url = URL.createObjectURL(blob);
  const release = () => window.setTimeout(() => URL.revokeObjectURL(url), 60_000);

  const clickHere = () => {
    const link = document.createElement("a");
    link.href = url;
    link.download = fileName;
    link.rel = "noopener";
    link.style.display = "none";
    document.body.appendChild(link);
    link.click();
    window.setTimeout(() => link.remove(), 0);
  };

  let framed: boolean;
  try {
    framed = window.self !== window.top;
  } catch {
    framed = true;
  }

  if (!framed) {
    clickHere();
    release();
    return;
  }

  const opened = window.open("", "_blank");
  if (!opened) {
    clickHere();
    release();
    return;
  }

  const anchor = opened.document.createElement("a");
  anchor.href = url;
  anchor.download = fileName;
  opened.document.body.appendChild(anchor);
  anchor.click();
  window.setTimeout(() => opened.close(), 1_000);
  release();
}
