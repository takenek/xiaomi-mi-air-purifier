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
