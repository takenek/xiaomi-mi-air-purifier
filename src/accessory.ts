import {
  API,
  Logger,
  Service,
  AccessoryConfig,
  AccessoryPlugin,
} from 'homebridge';
import miio from '@rifat/miio';
import { retry, isDefined, isRecoverableConnectionError } from './utils';
import { ResilientMiioDevice } from './resilient-miio-device';
import { add as addActive } from './characteristics/air-purifier/active';
import { add as addCurrentAirPurifierState } from './characteristics/air-purifier/current-air-purifier-state';
import { add as addTargetAirPurifierState } from './characteristics/air-purifier/target-air-purifier-state';
import { add as addFilterLifeLevel } from './characteristics/air-purifier/filter-life-level';
import {
  add as addFilterChangeIndication,
  DEFAULT_FILTER_CHANGE_THRESHOLD,
} from './characteristics/air-purifier/filter-change-indication';
import { add as addRotationSpeed } from './characteristics/air-purifier/rotation-speed';
import { add as addLockPhysicalControls } from './characteristics/air-purifier/lock-physical-controls';
import { add as addAirQuality } from './characteristics/air-quality';
import { add as addPm2_5Density } from './characteristics/pm2_5-density';
import { add as addCurrentTemperature } from './characteristics/current-temperature';
import { add as addCurrentRelativeHumidity } from './characteristics/current-relative-humidity';

const RETRY_DELAY = 5000;
export interface XiaomiMiAirPurifierAccessoryConfig extends AccessoryConfig {
  token: string;
  address: string;
  enableAirQuality: boolean;
  enableTemperature: boolean;
  enableHumidity: boolean;
  enableFanSpeedControl: boolean;
  enableChildLockControl: boolean;
  filterChangeThreshold: number;
}

function isValidConfig(
  config: AccessoryConfig,
): config is XiaomiMiAirPurifierAccessoryConfig {
  return !!config.token && !!config.address;
}

export class XiaomiMiAirPurifierAccessory implements AccessoryPlugin {
  private readonly name?: string;
  protected readonly config?: XiaomiMiAirPurifierAccessoryConfig;

  private readonly airPurifierService?: Service;
  private readonly accessoryInformationService?: Service;
  private readonly filterMaintenanceService?: Service;
  private readonly airQualitySensorService?: Service;
  private readonly temperatureSensorService?: Service;
  private readonly humiditySensorService?: Service;

  private connection?: Promise<any>;
  private connectionAbortController?: AbortController;
  protected readonly maybeDevice?: Promise<any>;

  constructor(
    protected readonly log: Logger,
    config: AccessoryConfig,
    protected readonly api: API,
  ) {
    if (isValidConfig(config)) {
      this.config = config;

      const {
        Service: {
          AirPurifier,
          HumiditySensor,
          AirQualitySensor,
          TemperatureSensor,
          AccessoryInformation,
        },
        Characteristic,
      } = api.hap;

      this.name = config.name;

      const resilientDevice = new ResilientMiioDevice(
        () => this.connect(config),
        () => {
          this.connectionAbortController?.abort();
          this.connectionAbortController = undefined;
          this.connection = undefined;
        },
        this.log,
      );

      this.maybeDevice = this.connect(config)
        .then((device) => {
          resilientDevice.attachEventForwarding(device);
          this.log.info(`Connected to "${this.name}" @ ${config.address}!`);

          return new Proxy(resilientDevice, {
            get(target, prop, receiver) {
              // Avoid Promise thenable assimilation on the proxy object.
              // If a "then" function is exposed, Promise resolution treats this
              // object as a thenable and invokes it, which crashes because miio
              // devices do not implement a "then" method.
              if (prop === 'then' || prop === 'catch' || prop === 'finally') {
                return undefined;
              }

              if (typeof prop === 'string' && !(prop in target)) {
                return (...args: unknown[]) => target.invoke(prop, ...args);
              }

              return Reflect.get(target, prop, receiver);
            },
          });
        })
        .catch((error) => {
          this.log.error('Cannot initialize device connection.', error);
          throw error;
        });

      this.airPurifierService = new AirPurifier(this.name);
      addActive(
        this.maybeDevice,
        this.airPurifierService,
        Characteristic.Active,
      );
      addCurrentAirPurifierState(
        this.maybeDevice,
        this.airPurifierService,
        Characteristic.CurrentAirPurifierState,
      );
      addTargetAirPurifierState(
        this.maybeDevice,
        this.airPurifierService,
        Characteristic.TargetAirPurifierState,
      );

      if (config.enableFanSpeedControl) {
        addRotationSpeed(
          this.maybeDevice,
          this.airPurifierService,
          Characteristic.RotationSpeed,
        );
      }

      if (config.enableChildLockControl) {
        addLockPhysicalControls(
          this.maybeDevice,
          this.airPurifierService,
          Characteristic.LockPhysicalControls,
        );
      }

      if (config.enableAirQuality) {
        this.airQualitySensorService = new AirQualitySensor(
          `Air Quality on ${this.name}`,
        );
        addAirQuality(
          this.maybeDevice,
          this.airQualitySensorService,
          Characteristic.AirQuality,
        );
        addPm2_5Density(
          this.maybeDevice,
          this.airQualitySensorService,
          Characteristic.PM2_5Density,
        );
        addFilterLifeLevel(
          this.maybeDevice,
          this.airQualitySensorService,
          Characteristic.FilterLifeLevel,
        );
        addFilterChangeIndication(
          this.maybeDevice,
          this.airQualitySensorService,
          Characteristic.FilterChangeIndication,
          {
            filterChangeThreshold:
              config.filterChangeThreshold ?? DEFAULT_FILTER_CHANGE_THRESHOLD,
          },
        );
      }

      if (config.enableTemperature) {
        this.temperatureSensorService = new TemperatureSensor(
          `Temperature on ${this.name}`,
        );

        addCurrentTemperature(
          this.maybeDevice,
          this.temperatureSensorService,
          Characteristic.CurrentTemperature,
        );
      }

      if (config.enableHumidity) {
        this.humiditySensorService = new HumiditySensor(`Humidity on ${this.name}`);
        addCurrentRelativeHumidity(
          this.maybeDevice,
          this.humiditySensorService,
          Characteristic.CurrentRelativeHumidity,
        );
      }

      this.accessoryInformationService = new AccessoryInformation().setCharacteristic(
        Characteristic.Manufacturer,
        'Xiaomi Corporation',
      );

      this.log.info(`${this.name} finished initializing!`);
    } else {
      this.log.error('Your must provide IP address and token of the Air Purifier.');
    }
  }

  connect(config: XiaomiMiAirPurifierAccessoryConfig): Promise<any> {
    if (!this.connection) {
      const { address, token } = config;
      this.connectionAbortController = new AbortController();
      this.connection = retry(
        () => miio.device({ address, token }).then((device) => {
          this.log.debug(`Connection established to ${address}.`);
          return device;
        }),
        RETRY_DELAY,
        Number.POSITIVE_INFINITY,
        isRecoverableConnectionError,
        this.connectionAbortController.signal,
      );
    }

    return this.connection;
  }

  identify() {
    this.log.info(`Identifying "${this.name}" @ ${this.config?.address}`);
  }

  getServices(): Service[] {
    return [
      this.airPurifierService,
      this.airQualitySensorService,
      this.temperatureSensorService,
      this.humiditySensorService,
      this.filterMaintenanceService,
      this.accessoryInformationService,
    ].filter(isDefined);
  }
}
