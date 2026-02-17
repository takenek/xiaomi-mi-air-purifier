const test = require('node:test');
const assert = require('node:assert/strict');

const { add: addActive } = require('../dist/characteristics/air-purifier/active');

function createServiceStub() {
  return {
    updateCharacteristic() {},
    getCharacteristic() {
      return {
        onGet() {
          return this;
        },
        onSet() {
          return this;
        },
      };
    },
  };
}

test('Active characteristic setup handles rejected maybeDevice without unhandled rejection', async () => {
  const unhandled = [];
  const handler = (error) => {
    unhandled.push(error);
  };
  process.on('unhandledRejection', handler);

  const maybeDevice = Promise.reject(new Error('connection failed'));
  addActive(maybeDevice, createServiceStub(), { ACTIVE: 1, INACTIVE: 0 });

  await new Promise((resolve) => setImmediate(resolve));
  process.off('unhandledRejection', handler);

  assert.equal(unhandled.length, 0);
});
