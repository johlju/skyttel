export function waitForAbortOrTimeout(
  delayMs: number,
  signal?: AbortSignal | null,
  onAbort?: () => void,
) {
  return new Promise<void>((resolve) => {
    const timer = setTimeout(resolve, delayMs);
    const finish = () => {
      clearTimeout(timer);
      onAbort?.();
      resolve();
    };
    if (signal?.aborted) finish();
    else signal?.addEventListener('abort', finish, { once: true });
  });
}
