import { EventEmitter } from 'events';
import { Logger } from 'homebridge';
import { isRecoverableConnectionError } from './utils';

const OPERATION_RETRIES = 3;
const DEVICE_EVENTS = [
  'powerChanged',
  'modeChanged',
  'fanSpeedChanged',
  'childLockChanged',
  'filterLifeChanged',
  'pm2.5Changed',
  'temperatureChanged',
  'relativeHumidityChanged',
];

export class ResilientMiioDevice extends EventEmitter {
  private attachedDevice?: EventEmitter;
  private readonly forwarders = new Map<string, (...args: unknown[]) => void>();
  private readonly deviceErrorListener = (error: unknown) => {
    this.log.warn('miio device emitted an error event', error);
  };

  private detachEventForwarding() {
    if (!this.attachedDevice) {
      return;
    }

    DEVICE_EVENTS.forEach((eventName) => {
      const listener = this.forwarders.get(eventName);
      if (listener) {
        this.attachedDevice?.off(eventName, listener);
      }
    });
    this.attachedDevice.off('error', this.deviceErrorListener);
    this.attachedDevice = undefined;
  }

  constructor(
    private readonly connectDevice: () => Promise<any>,
    private readonly resetConnection: () => void,
    private readonly log: Pick<Logger, 'warn'>,
  ) {
    super();
  }

  attachEventForwarding(device: EventEmitter) {
    if (this.attachedDevice === device) {
      return;
    }

    this.detachEventForwarding();

    this.attachedDevice = device;

    DEVICE_EVENTS.forEach((eventName) => {
      const listener = (...args: unknown[]) => this.emit(eventName, ...args);
      this.forwarders.set(eventName, listener);
      device.on(eventName, listener);
    });
    device.on('error', this.deviceErrorListener);
  }

  async invoke(methodName: string, ...args: unknown[]) {
    let lastError: unknown;

    for (let attempt = 0; attempt < OPERATION_RETRIES; attempt += 1) {
      try {
        const device = await this.connectDevice();
        this.attachEventForwarding(device);
        const candidateMethod = (device as Record<string, unknown>)[methodName];

        if (typeof candidateMethod !== 'function') {
          throw new Error(`Unsupported miio method: ${methodName}`);
        }

        return await (
          candidateMethod as (
            this: unknown,
            ...argList: unknown[]
          ) => Promise<unknown>
        ).apply(device, args);
      } catch (error) {
        lastError = error;

        if (!isRecoverableConnectionError(error)) {
          break;
        }

        this.log.warn(
          `Recoverable error while calling '${methodName}', reconnecting (attempt ${attempt + 1}/${OPERATION_RETRIES})`,
          error,
        );
        this.detachEventForwarding();
        this.resetConnection();
      }
    }

    throw lastError;
  }
}
