const test = require('node:test');
const assert = require('node:assert/strict');

const { retry, isRecoverableConnectionError } = require('../dist/utils');

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
