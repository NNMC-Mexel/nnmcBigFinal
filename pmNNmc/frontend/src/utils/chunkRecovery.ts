const RELOAD_PARAM = '__app_reload';
const RELOAD_STORAGE_KEY = 'nnmc_chunk_reload_at';
const RELOAD_COOLDOWN_MS = 60_000;

const CHUNK_ERROR_PATTERN =
  /ChunkLoadError|Loading chunk .* failed|dynamically imported module|Importing a module script failed|module script.*MIME type|expected a JavaScript-or-Wasm module script/i;

function errorMessage(error: unknown): string {
  if (error instanceof Error) return `${error.name}: ${error.message}`;
  if (typeof error === 'string') return error;
  return String((error as { message?: unknown })?.message || '');
}

export function isChunkLoadError(error: unknown): boolean {
  return CHUNK_ERROR_PATTERN.test(errorMessage(error));
}

export function forceFreshAppLoad(): void {
  const url = new URL(window.location.href);
  url.searchParams.set(RELOAD_PARAM, String(Date.now()));
  window.location.replace(url.toString());
}

export function recoverFromChunkError(error: unknown): boolean {
  if (!isChunkLoadError(error)) return false;

  const now = Date.now();
  const lastReload = Number(sessionStorage.getItem(RELOAD_STORAGE_KEY) || 0);
  if (now - lastReload < RELOAD_COOLDOWN_MS) return false;

  sessionStorage.setItem(RELOAD_STORAGE_KEY, String(now));
  forceFreshAppLoad();
  return true;
}

export function installChunkRecovery(): void {
  const currentUrl = new URL(window.location.href);
  if (currentUrl.searchParams.has(RELOAD_PARAM)) {
    currentUrl.searchParams.delete(RELOAD_PARAM);
    window.history.replaceState(
      window.history.state,
      '',
      `${currentUrl.pathname}${currentUrl.search}${currentUrl.hash}`
    );
  }

  window.addEventListener('vite:preloadError', (event) => {
    const preloadEvent = event as Event & { payload?: unknown };
    if (recoverFromChunkError(preloadEvent.payload)) {
      event.preventDefault();
    }
  });

  window.addEventListener('unhandledrejection', (event) => {
    if (recoverFromChunkError(event.reason)) {
      event.preventDefault();
    }
  });
}
