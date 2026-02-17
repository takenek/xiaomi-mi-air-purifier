import { Service, Characteristic } from 'homebridge';
import { reportSetupError } from '../utils';

// https://developers.homebridge.io/#/characteristic/CurrentRelativeHumidity
export function add(
  maybeDevice: Promise<any>,
  service: Service,
  characteristic: typeof Characteristic.CurrentRelativeHumidity,
) {
  maybeDevice.then((device) => {
    device.on('relativeHumidityChanged', (value: number) => {
      service.updateCharacteristic(characteristic, value);
    });
  }).catch((error) => reportSetupError('current-relative-humidity', error));

  return service.getCharacteristic(characteristic).onGet(async () => {
    const device = await maybeDevice;
    return await device.rh();
  });
}
