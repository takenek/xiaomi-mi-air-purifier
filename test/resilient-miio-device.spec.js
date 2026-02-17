const test = require('node:test');
const assert = require('node:assert/strict');
const { EventEmitter } = require('node:events');

const { ResilientMiioDevice } = require('../dist/resilient-miio-device');

test('ResilientMiioDevice: reattaches event forwarding after recoverable reconnect', async () => {
  const firstDevice = new EventEmitter();
  const secondDevice = new EventEmitter();

  let switchedToSecond = false;
  firstDevice.power = async () => {
    const error = new Error('Socket not connected');
    error.code = 'ENOTCONN';
    throw error;
  };

  secondDevice.power = async () => true;

  const connectionResets = [];
  const resilient = new ResilientMiioDevice(
    async () => (switchedToSecond ? secondDevice : firstDevice),
    () => {
      switchedToSecond = true;
      connectionResets.push('reset');
    },
    { warn: () => {} },
  );

  let forwardedEvents = 0;
  resilient.on('powerChanged', () => {
    forwardedEvents += 1;
  });

  const result = await resilient.invoke('power');
  assert.equal(result, true);
  assert.equal(connectionResets.length, 1);

  firstDevice.emit('powerChanged', true);
  secondDevice.emit('powerChanged', true);

  assert.equal(forwardedEvents, 1);
});

test('ResilientMiioDevice: handles device error events without crashing', async () => {
  const device = new EventEmitter();
  device.power = async () => true;

  const warnings = [];
  const resilient = new ResilientMiioDevice(
    async () => device,
    () => {},
    {
      warn: (...args) => warnings.push(args),
    },
  );

  await resilient.invoke('power');

  assert.doesNotThrow(() => {
    device.emit('error', new Error('EHOSTUNREACH'));
  });
  assert.equal(warnings.length, 1);
});

test('ResilientMiioDevice: detaches stale event listeners after recoverable reconnect failure', async () => {
  const device = new EventEmitter();
  device.power = async () => true;

  let shouldFailToReconnect = false;
  const resilient = new ResilientMiioDevice(
    async () => {
      if (shouldFailToReconnect) {
        const error = new Error('host unreachable');
        error.code = 'EHOSTUNREACH';
        throw error;
      }

      return device;
    },
    () => {},
    { warn: () => {} },
  );

  let forwardedEvents = 0;
  resilient.on('powerChanged', () => {
    forwardedEvents += 1;
  });

  await resilient.invoke('power');

  shouldFailToReconnect = true;
  await assert.rejects(() => resilient.invoke('power'));

  device.emit('powerChanged', true);
  assert.equal(
    forwardedEvents,
    0,
    'stale device events should not be forwarded after reconnect failure',
  );
});

test('ResilientMiioDevice: reconnect cleanup supports emitters without off()', async () => {
  const listeners = new Map();
  const legacyEmitter = {
    on(event, handler) {
      listeners.set(event, handler);
      return this;
    },
    removeListener(event, handler) {
      if (listeners.get(event) === handler) {
        listeners.delete(event);
      }
      return this;
    },
    async power() {
      const error = new Error('socket not connected');
      error.code = 'ENOTCONN';
      throw error;
    },
  };

  const resilient = new ResilientMiioDevice(
    async () => legacyEmitter,
    () => {},
    { warn: () => {} },
  );

  await assert.rejects(() => resilient.invoke('power'));
  assert.equal(listeners.has('powerChanged'), false);
});
