/** Triggers a file download of a blob without any network involvement. */
export function downloadBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.rel = 'noopener';
  a.style.display = 'none';
  document.body.appendChild(a);
  a.click();
  a.remove();
  // Give the browser time to start the download before revoking.
  setTimeout(() => URL.revokeObjectURL(url), 30_000);
}

export function safeFilename(name: string): string {
  const cleaned = name.replace(/[^\p{L}\p{N} _.-]+/gu, '').trim().replace(/\s+/g, '-');
  return cleaned.slice(0, 80) || 'artwork';
}
