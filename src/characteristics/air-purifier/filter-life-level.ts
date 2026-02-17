import { Service, Characteristic, CharacteristicEventTypes } from 'homebridge';
import { reportSetupError } from '../../utils';

// https://developers.homebridge.io/#/characteristic/FilterLifeLevel
export function add(
  maybeDevice: Promise<any>,
  service: Service,
  characteristic: typeof Characteristic.FilterLifeLevel,
) {
  maybeDevice.then((device) => {
    device.on('filterLifeChanged', (value: number) => {
      service.updateCharacteristic(characteristic, value);
    });
  }).catch((error) => reportSetupError('filter-life-level', error));

  return service.getCharacteristic(characteristic).onGet(async () => {
    const device = await maybeDevice;
    return await device.filterLifeLevel();
  });
}
