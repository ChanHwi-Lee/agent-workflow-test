import { writeSync } from "node:fs";

export const loggerLevels = [
  "debug",
  "info",
  "warn",
  "error",
] as const;

export type LoggerLevel = (typeof loggerLevels)[number];

export type LogFields = Record<string, unknown>;

export interface Logger {
  readonly level: LoggerLevel;
  child(bindings: LogFields): Logger;
  debug(message: string, fields?: LogFields): void;
  info(message: string, fields?: LogFields): void;
  warn(message: string, fields?: LogFields): void;
  error(message: string, fields?: LogFields): void;
}

export interface CreateLoggerOptions {
  level?: LoggerLevel;
  bindings?: LogFields;
}

const levelPriority: Record<LoggerLevel, number> = {
  debug: 10,
  info: 20,
  warn: 30,
  error: 40,
};

class ConsoleLogger implements Logger {
  readonly level: LoggerLevel;
  private readonly bindings: LogFields;

  constructor(level: LoggerLevel, bindings: LogFields) {
    this.level = level;
    this.bindings = bindings;
  }

  child(bindings: LogFields): Logger {
    return new ConsoleLogger(this.level, {
      ...this.bindings,
      ...bindings,
    });
  }

  debug(message: string, fields?: LogFields): void {
    this.write("debug", message, fields);
  }

  info(message: string, fields?: LogFields): void {
    this.write("info", message, fields);
  }

  warn(message: string, fields?: LogFields): void {
    this.write("warn", message, fields);
  }

  error(message: string, fields?: LogFields): void {
    this.write("error", message, fields);
  }

  private write(level: LoggerLevel, message: string, fields?: LogFields): void {
    if (levelPriority[level] < levelPriority[this.level]) {
      return;
    }

    const payload = {
      timestamp: new Date().toISOString(),
      level,
      message,
      ...this.bindings,
      ...(fields ?? {}),
    };

    const line = JSON.stringify(payload);

    const fd = level === "warn" || level === "error" ? 2 : 1;
    writeSync(fd, `${line}\n`);
  }
}

export function createLogger(options: CreateLoggerOptions = {}): Logger {
  return new ConsoleLogger(options.level ?? "info", options.bindings ?? {});
}
