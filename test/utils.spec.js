const test = require('node:test');
const assert = require('node:assert/strict');

const {
  retry,
  isRecoverableConnectionError,
  reportSetupError,
} = require('../dist/utils');

test('retry: retries for EINTR and then succeeds', async () => {
  let calls = 0;

  const result = await retry(
    async () => {
      calls += 1;
      if (calls < 3) {
        const error = new Error('Interrupted system call');
        error.code = 'EINTR';
        throw error;
      }

      return 'ok';
    },
    1,
    5,
    isRecoverableConnectionError,
  );

  assert.equal(result, 'ok');
  assert.equal(calls, 3);
});

test('retry: retries for EALREADY and then succeeds', async () => {
  let calls = 0;

  const result = await retry(
    async () => {
      calls += 1;
      if (calls < 2) {
        const error = new Error('Operation already in progress');
        error.code = 'EALREADY';
        throw error;
      }

      return 123;
    },
    1,
    5,
    isRecoverableConnectionError,
  );

  assert.equal(result, 123);
  assert.equal(calls, 2);
});

test('retry: retries recoverable synchronous throws', async () => {
  let calls = 0;

  const result = await retry(
    () => {
      calls += 1;
      if (calls < 3) {
        const error = new Error('Socket not connected');
        error.code = 'ENOTCONN';
        throw error;
      }

      return Promise.resolve('ok-sync');
    },
    1,
    5,
    isRecoverableConnectionError,
  );

  assert.equal(result, 'ok-sync');
  assert.equal(calls, 3);
});

test('retry: does not retry non-recoverable errors', async () => {
  let calls = 0;
  await assert.rejects(
    retry(
      async () => {
        calls += 1;
        const error = new Error('Invalid token');
        error.code = 'EAUTH';
        throw error;
      },
      1,
      5,
      isRecoverableConnectionError,
    ),
    /Invalid token/,
  );

  assert.equal(calls, 1);
});

test('retry: abort signal stops pending retries', async () => {
  const controller = new AbortController();
  let calls = 0;

  const pending = retry(
    async () => {
      calls += 1;
      const error = new Error('Connection reset by peer');
      error.code = 'ECONNRESET';
      throw error;
    },
    100,
    5,
    isRecoverableConnectionError,
    controller.signal,
  );

  setTimeout(() => controller.abort(), 10);

  await assert.rejects(pending, (error) => {
    assert.equal(error.name, 'AbortError');
    return true;
  });

  assert.equal(calls, 1);
});

test('isRecoverableConnectionError: timeout messages are recoverable', () => {
  assert.equal(isRecoverableConnectionError(new Error('Socket timeout')), true);
});

test('isRecoverableConnectionError: ENOTCONN and EHOSTUNREACH are recoverable', () => {
  const notConn = new Error('Socket not connected');
  notConn.code = 'ENOTCONN';

  const hostUnreachable = new Error('No route to host');
  hostUnreachable.code = 'EHOSTUNREACH';

  assert.equal(isRecoverableConnectionError(notConn), true);
  assert.equal(isRecoverableConnectionError(hostUnreachable), true);
});


test('isRecoverableConnectionError: known socket errors are recoverable', () => {
  const recoverableCodes = [
    'ETIMEDOUT',
    'ECONNRESET',
    'ECONNREFUSED',
    'ENETUNREACH',
    'EPIPE',
    'EAI_AGAIN',
  ];

  recoverableCodes.forEach((code) => {
    const error = new Error(`recoverable ${code}`);
    error.code = code;
    assert.equal(isRecoverableConnectionError(error), true, code);
  });
});


test('reportSetupError: warns once per context and message fingerprint', async () => {
  const warnings = [];
  const warningHandler = (warning) => {
    warnings.push(warning.message);
  };

  process.on('warning', warningHandler);

  reportSetupError('active', new Error('connection failed'));
  reportSetupError('active', new Error('connection failed'));
  reportSetupError('active', new Error('different'));

  await new Promise((resolve) => setImmediate(resolve));

  process.off('warning', warningHandler);

  assert.equal(warnings.length, 2);
  assert.match(warnings[0], /active/);
  assert.match(warnings[0], /connection failed/);
  assert.match(warnings[1], /different/);
});


test('withTimeout: rejects with ETIMEDOUT when task hangs', async () => {
  const { withTimeout } = require('../dist/utils');

  await assert.rejects(
    withTimeout(new Promise(() => {}), 5, 'connect timeout'),
    (error) => {
      assert.equal(error.code, 'ETIMEDOUT');
      assert.match(error.message, /connect timeout/);
      return true;
    },
  );
});

test('retry: uses bounded exponential backoff options', async () => {
  const originalRandom = Math.random;
  Math.random = () => 0;

  const waits = [];
  const originalSetTimeout = global.setTimeout;
  global.setTimeout = ((fn, delay, ...rest) => {
    waits.push(delay);
    return originalSetTimeout(fn, 0, ...rest);
  });

  let calls = 0;
  try {
    const result = await retry(
      async () => {
        calls += 1;
        if (calls < 4) {
          const error = new Error('temporary timeout');
          error.code = 'ETIMEDOUT';
          throw error;
        }

        return 'ok';
      },
      2,
      5,
      isRecoverableConnectionError,
      undefined,
      { maxDelayMs: 5, jitterRatio: 0 },
    );

    assert.equal(result, 'ok');
    assert.deepEqual(waits.slice(0, 3), [2, 4, 5]);
  } finally {
    Math.random = originalRandom;
    global.setTimeout = originalSetTimeout;
  }
});
