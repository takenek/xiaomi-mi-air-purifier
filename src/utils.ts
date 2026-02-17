/**
 * Wait for {delay} ms
 * @param delay in milliseconds
 */
export const wait = (delay: number) =>
  new Promise((resolve) => setTimeout(resolve, delay));

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
): Promise<T> =>
  task().catch((reason) => {
    if (retries > 0 && shouldRetry(reason)) {
      return wait(delay).then(() => retry(task, delay, retries - 1, shouldRetry));
    }
    return Promise.reject(reason);
  });

export const isDefined = <T>(value: T): value is NonNullable<T> =>
  value != null;
