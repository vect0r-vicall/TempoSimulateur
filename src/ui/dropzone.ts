// SPDX-License-Identifier: AGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Victor Allombert
/** Wires the drop zone and the file input; `onFile` receives each dropped/chosen file. */
export function initDropzone(onFile: (file: File) => void): void {
  const zone = document.getElementById('dropzone') as HTMLElement;
  const input = document.getElementById('file-input') as HTMLInputElement;
  const take = (files: FileList | null | undefined) => {
    if (files) for (const f of Array.from(files)) onFile(f);
  };
  input.addEventListener('change', () => {
    take(input.files);
    input.value = '';
  });
  zone.addEventListener('dragover', (ev) => {
    ev.preventDefault();
    zone.classList.add('dragover');
  });
  zone.addEventListener('dragleave', () => zone.classList.remove('dragover'));
  zone.addEventListener('drop', (ev) => {
    ev.preventDefault();
    zone.classList.remove('dragover');
    take(ev.dataTransfer?.files);
  });
  // a file dropped outside the zone must not navigate away
  window.addEventListener('dragover', (ev) => ev.preventDefault());
  window.addEventListener('drop', (ev) => ev.preventDefault());
}
