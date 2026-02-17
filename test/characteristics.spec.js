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
  const warnings = [];
  const unhandledHandler = (error) => {
    unhandled.push(error);
  };
  const warningHandler = (warning) => {
    warnings.push(warning.message);
  };

  process.on('unhandledRejection', unhandledHandler);
  process.on('warning', warningHandler);

  const maybeDevice = Promise.reject(new Error('connection failed'));
  addActive(maybeDevice, createServiceStub(), { ACTIVE: 1, INACTIVE: 0 });

  await new Promise((resolve) => setImmediate(resolve));

  process.off('unhandledRejection', unhandledHandler);
  process.off('warning', warningHandler);

  assert.equal(unhandled.length, 0);
  assert.equal(warnings.length, 1);
  assert.match(warnings[0], /active/);
  assert.match(warnings[0], /connection failed/);
});
