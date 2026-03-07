import type { LogLevel } from "../config/seedstrConfig";

const ORDER: Record<LogLevel, number> = {
  debug: 10,
  info: 20,
  warn: 30,
  error: 40
};

export function createLogger(level: LogLevel) {
  const minimum = ORDER[level] ?? ORDER.info;

  function log(logLevel: LogLevel, ...args: unknown[]): void {
    if ((ORDER[logLevel] ?? 999) < minimum) return;
    console[logLevel === "debug" ? "log" : logLevel](`[${logLevel.toUpperCase()}]`, ...args);
  }

  return {
    debug: (...args: unknown[]) => log("debug", ...args),
    info: (...args: unknown[]) => log("info", ...args),
    warn: (...args: unknown[]) => log("warn", ...args),
    error: (...args: unknown[]) => log("error", ...args)
  };
}
