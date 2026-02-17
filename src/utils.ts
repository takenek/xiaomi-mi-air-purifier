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

export const withTimeout = <T>(
  task: Promise<T>,
  timeoutMs: number,
  message: string,
  signal?: AbortSignal,
): Promise<T> => {
  if (signal?.aborted) {
    return Promise.reject(createAbortError());
  }

  return new Promise((resolve, reject) => {
    let settled = false;

    const abortSignal = signal as AbortSignalWithEventListener | undefined;
    const timeout = setTimeout(() => {
      if (settled) {
        return;
      }

      settled = true;
      abortSignal?.removeEventListener?.('abort', onAbort);
      const error = new Error(message);
      (error as Error & { code: string }).code = 'ETIMEDOUT';
      reject(error);
    }, timeoutMs);

    const finalize = () => {
      clearTimeout(timeout);
      abortSignal?.removeEventListener?.('abort', onAbort);
    };

    function onAbort() {
      if (settled) {
        return;
      }

      settled = true;
      finalize();
      reject(createAbortError());
    }

    abortSignal?.addEventListener?.('abort', onAbort, { once: true });

    task.then(
      (value) => {
        if (settled) {
          return;
        }

        settled = true;
        finalize();
        resolve(value);
      },
      (error) => {
        if (settled) {
          return;
        }

        settled = true;
        finalize();
        reject(error);
      },
    );
  });
};

const reportedSetupErrors = new Set<string>();

export function reportSetupError(context: string, error: unknown): void {
  const details = error instanceof Error ? error : new Error(String(error));
  const fingerprint = `${context}:${details.message}`;

  if (reportedSetupErrors.has(fingerprint)) {
    return;
  }

  reportedSetupErrors.add(fingerprint);
  process.emitWarning(
    `[${context}] Failed to initialize device event subscription: ${details.message}`,
  );
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
  options?: {
    maxDelayMs?: number;
    jitterRatio?: number;
  },
): Promise<T> =>
  Promise.resolve()
    .then(() => task())
    .catch((reason) => {
      if (signal?.aborted) {
        return Promise.reject(createAbortError());
      }

      if (retries > 0 && shouldRetry(reason)) {
        const maxDelayMs = options?.maxDelayMs ?? delay;
        const jitterRatio = options?.jitterRatio ?? 0;
        const jitter = delay * jitterRatio * Math.random();
        const boundedDelay = Math.min(delay + jitter, maxDelayMs);

        return wait(boundedDelay, signal).then(() =>
          retry(task, Math.min(delay * 2, maxDelayMs), retries - 1, shouldRetry, signal, options),
        );
      }
      return Promise.reject(reason);
    });

export const isDefined = <T>(value: T): value is NonNullable<T> =>
  value != null;
