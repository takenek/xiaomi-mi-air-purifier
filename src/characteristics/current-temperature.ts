import { Service, Characteristic } from 'homebridge';
import { reportSetupError } from '../utils';

// https://developers.homebridge.io/#/characteristic/CurrentTemperature
export function add(
  maybeDevice: Promise<any>,
  service: Service,
  characteristic: typeof Characteristic.CurrentTemperature,
) {
  maybeDevice.then((device) => {
    device.on('temperatureChanged', ({ value }) => {
      service.updateCharacteristic(characteristic, value);
    });
  }).catch((error) => reportSetupError('current-temperature', error));

  return service.getCharacteristic(characteristic).onGet(
    // Temperature { value: 23.4, unit: 'C' }
    async () => {
      const device = await maybeDevice;
      return (await device.temperature()).value;
    },
  );
}
