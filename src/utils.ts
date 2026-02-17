/**
 * Wait for {delay} ms
 * @param delay in milliseconds
 */
const createAbortError = () => {
  const error = new Error('The operation was aborted');
  error.name = 'AbortError';
  return error;
};

type AbortSignalWithEventListener = AbortSignal & {
  addEventListener?: (
    event: 'abort',
    listener: () => void,
    options?: { once?: boolean },
  ) => void;
  removeEventListener?: (event: 'abort', listener: () => void) => void;
};

export const wait = (delay: number, signal?: AbortSignal) =>
  new Promise((resolve, reject) => {
    if (signal?.aborted) {
      reject(createAbortError());
      return;
    }

    const abortSignal = signal as AbortSignalWithEventListener | undefined;

    const timeout = setTimeout(() => {
      abortSignal?.removeEventListener?.('abort', onAbort);
      resolve(undefined);
    }, delay);

    function onAbort() {
      clearTimeout(timeout);
      abortSignal?.removeEventListener?.('abort', onAbort);
      reject(createAbortError());
    }

    abortSignal?.addEventListener?.('abort', onAbort, { once: true });
  });

export function reportSetupError(_context: string, _error: unknown): void {
  // The accessory constructor already logs connection bootstrap failures once.
  // Characteristic-level setup hooks intentionally swallow this to avoid
  // duplicate process warnings for each characteristic registration.
}

const RECOVERABLE_ERROR_CODES = new Set([
  'EINTR',
  'EALREADY',
  'ETIMEDOUT',
  'ECONNRESET',
  'ECONNREFUSED',
  'EHOSTUNREACH',
  'ENETUNREACH',
  'ENOTCONN',
  'EPIPE',
  'EAI_AGAIN',
]);

export function isRecoverableConnectionError(error: unknown): boolean {
  if (!error || typeof error !== 'object') {
    return false;
  }

  const maybeCode = (error as { code?: unknown }).code;
  const maybeMessage = (error as { message?: unknown }).message;

  if (typeof maybeCode === 'string' && RECOVERABLE_ERROR_CODES.has(maybeCode)) {
    return true;
  }

  if (typeof maybeMessage === 'string') {
    const normalizedMessage = maybeMessage.toLowerCase();
    return (
      normalizedMessage.includes('timeout') ||
      normalizedMessage.includes('timed out')
    );
  }

  return false;
}

export const retry = <T>(
  task: () => Promise<T>,
  delay: number,
  retries = Number.POSITIVE_INFINITY,
  shouldRetry: (reason: unknown) => boolean = () => true,
  signal?: AbortSignal,
): Promise<T> =>
  task().catch((reason) => {
    if (signal?.aborted) {
      return Promise.reject(createAbortError());
    }

    if (retries > 0 && shouldRetry(reason)) {
      return wait(delay, signal).then(() =>
        retry(task, delay, retries - 1, shouldRetry, signal),
      );
    }
    return Promise.reject(reason);
  });

export const isDefined = <T>(value: T): value is NonNullable<T> =>
  value != null;
