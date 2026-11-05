export function isSheetBackend() {
  const mode = String(import.meta.env.VITE_DATA_BACKEND || 'sheet').trim().toLowerCase();
  return mode === 'sheet';
}

export function isApiBackend() {
  return !isSheetBackend();
}
