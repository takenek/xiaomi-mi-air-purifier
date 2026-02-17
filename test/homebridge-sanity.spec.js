const test = require('node:test');
const assert = require('node:assert/strict');

const miioModulePath = require.resolve('@rifat/miio');
require.cache[miioModulePath] = {
  id: miioModulePath,
  filename: miioModulePath,
  loaded: true,
  exports: {
    device: async () => ({
      on() {},
      power: async () => false,
      changePower: async () => {},
      mode: async () => 0,
      changeMode: async () => {},
      changeFanSpeed: async () => {},
      fanSpeed: async () => 0,
    }),
  },
};

const registerPlugin = require('../dist/index.js');
const { XiaomiMiAirPurifierAccessory } = require('../dist/accessory.js');

test('Homebridge sanity: plugin registers accessory and initializes safely with invalid config', () => {
  const registrations = [];
  const api = {
    registerAccessory(pluginName, accessoryName, ctor) {
      registrations.push({ pluginName, accessoryName, ctor });
    },
    hap: {
      Service: {
        AirPurifier: function AirPurifier() {},
        HumiditySensor: function HumiditySensor() {},
        AirQualitySensor: function AirQualitySensor() {},
        TemperatureSensor: function TemperatureSensor() {},
        AccessoryInformation: function AccessoryInformation() {
          return { setCharacteristic() { return this; } };
        },
      },
      Characteristic: {},
    },
  };

  registerPlugin(api);

  assert.equal(registrations.length, 1);
  assert.equal(registrations[0].ctor, XiaomiMiAirPurifierAccessory);

  const errors = [];
  const accessory = new XiaomiMiAirPurifierAccessory(
    {
      info() {},
      error(...args) {
        errors.push(args);
      },
    },
    { name: 'invalid-config' },
    api,
  );

  assert.deepEqual(accessory.getServices(), []);
  assert.equal(errors.length, 1);
  assert.match(String(errors[0][0]), /must provide IP address and token/i);
});
