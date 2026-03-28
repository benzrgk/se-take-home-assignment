export class RealClock {
  now() {
    return Date.now();
  }

  setTimeout(callback, delayMs) {
    return globalThis.setTimeout(callback, delayMs);
  }

  clearTimeout(handle) {
    globalThis.clearTimeout(handle);
  }
}

export class ManualClock {
  constructor(startMs = Date.UTC(2026, 2, 28, 9, 0, 0)) {
    this.currentTimeMs = startMs;
    this.nextTimerId = 1;
    this.timers = [];
  }

  now() {
    return this.currentTimeMs;
  }

  setTimeout(callback, delayMs) {
    const handle = {
      id: this.nextTimerId++,
      runAt: this.currentTimeMs + delayMs,
      callback,
      cancelled: false,
    };

    this.timers.push(handle);
    this.timers.sort((left, right) => left.runAt - right.runAt || left.id - right.id);

    return handle;
  }

  clearTimeout(handle) {
    if (handle) {
      handle.cancelled = true;
    }
  }

  advance(delayMs) {
    const targetTime = this.currentTimeMs + delayMs;

    while (true) {
      const nextTimer = this.timers.find((timer) => !timer.cancelled && timer.runAt <= targetTime);

      if (!nextTimer) {
        break;
      }

      this.timers = this.timers.filter((timer) => timer.id !== nextTimer.id);
      this.currentTimeMs = nextTimer.runAt;
      nextTimer.callback();
    }

    this.currentTimeMs = targetTime;
  }
}

export function formatClockTime(input) {
  const date = input instanceof Date ? input : new Date(input);
  const hours = String(date.getHours()).padStart(2, "0");
  const minutes = String(date.getMinutes()).padStart(2, "0");
  const seconds = String(date.getSeconds()).padStart(2, "0");

  return `${hours}:${minutes}:${seconds}`;
}
