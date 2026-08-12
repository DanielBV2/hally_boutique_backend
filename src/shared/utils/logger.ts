import { pino } from "pino";
import { randomUUID } from "node:crypto";
import { pinoHttp, type HttpLogger } from "pino-http";

export function resolveLogLevel(nodeEnv?: string, logLevel?: string): string {
  if ((nodeEnv ?? process.env.NODE_ENV) === "test") return "silent";
  return logLevel ?? process.env.LOG_LEVEL ?? "info";
}

export const logger = pino({
  level: resolveLogLevel(process.env.NODE_ENV, process.env.LOG_LEVEL),
  ...(process.env.NODE_ENV === "development"
    ? {
        transport: {
          target: "pino-pretty",
          options: {
            colorize: true,
            translateTime: "SYS:HH:MM:ss",
            ignore: "pid,hostname",
          },
        },
      }
    : {}),
});

export const requestLogger: HttpLogger = pinoHttp({
  logger,
  genReqId: (req, res) => {
    const headerId = (req.headers["x-request-id"] as string | undefined) ?? randomUUID();
    res.setHeader("X-Request-Id", headerId);
    return headerId;
  },
  autoLogging: {
    ignore: (req) => req.url === "/health",
  },
});
