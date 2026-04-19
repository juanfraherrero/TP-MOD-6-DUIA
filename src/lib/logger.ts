type LogLevel = "debug" | "info" | "warn" | "error";

const C = {
  reset: "\x1b[0m",
  dim: "\x1b[2m",
  red: "\x1b[31m",
  green: "\x1b[32m",
  yellow: "\x1b[33m",
  blue: "\x1b[34m",
  magenta: "\x1b[35m",
  cyan: "\x1b[36m",
};

const LEVEL_COLOR: Record<LogLevel, string> = {
  debug: C.dim,
  info: C.cyan,
  warn: C.yellow,
  error: C.red,
};

const LEVEL_ORDER: Record<LogLevel, number> = {
  debug: 0,
  info: 1,
  warn: 2,
  error: 3,
};

const MIN_LEVEL = (process.env.LOG_LEVEL as LogLevel) || "debug";

function ts(): string {
  const d = new Date();
  const pad = (n: number, w = 2) => String(n).padStart(w, "0");
  return `${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}.${pad(d.getMilliseconds(), 3)}`;
}

function write(
  level: LogLevel,
  scope: string,
  msg: string,
  meta?: Record<string, unknown>,
) {
  if (LEVEL_ORDER[level] < LEVEL_ORDER[MIN_LEVEL]) return;
  const time = `${C.dim}${ts()}${C.reset}`;
  const lvl = `${LEVEL_COLOR[level]}${level.toUpperCase().padEnd(5)}${C.reset}`;
  const scp = `${C.magenta}${scope.padEnd(14)}${C.reset}`;
  const tail =
    meta && Object.keys(meta).length > 0
      ? ` ${C.dim}${JSON.stringify(meta)}${C.reset}`
      : "";
  console.log(`${time} ${lvl} ${scp} ${msg}${tail}`);
}

export type Logger = {
  debug: (msg: string, meta?: Record<string, unknown>) => void;
  info: (msg: string, meta?: Record<string, unknown>) => void;
  warn: (msg: string, meta?: Record<string, unknown>) => void;
  error: (msg: string, meta?: Record<string, unknown>) => void;
  time: (label: string) => () => void;
};

export function createLogger(scope: string): Logger {
  return {
    debug: (msg, meta) => write("debug", scope, msg, meta),
    info: (msg, meta) => write("info", scope, msg, meta),
    warn: (msg, meta) => write("warn", scope, msg, meta),
    error: (msg, meta) => write("error", scope, msg, meta),
    time: (label) => {
      const start = performance.now();
      return () => {
        const ms = Math.round(performance.now() - start);
        write("debug", scope, `${label} ${C.green}(${ms}ms)${C.reset}`);
      };
    },
  };
}
