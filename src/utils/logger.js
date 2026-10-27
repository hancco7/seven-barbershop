const { createLogger, format, transports } = require("winston");
const path = require("path");

const { combine, timestamp, printf, colorize, errors, json } = format;

const devFormat = combine(
  colorize(),
  timestamp({ format: "HH:mm:ss" }),
  errors({ stack: true }),
  printf(({ level, message, timestamp, stack }) =>
    stack
      ? `${timestamp} [${level}] ${message}\n${stack}`
      : `${timestamp} [${level}] ${message}`
  )
);

const prodFormat = combine(
  timestamp(),
  errors({ stack: true }),
  json()
);

const logger = createLogger({
  level: process.env.LOG_LEVEL || (process.env.NODE_ENV === "production" ? "info" : "debug"),
  format: process.env.NODE_ENV === "production" ? prodFormat : devFormat,
  transports: [
    new transports.Console(),
    ...(process.env.NODE_ENV === "production"
      ? [
          new transports.File({
            filename: path.join(__dirname, "../../../logs/error.log"),
            level: "error",
            maxsize: 5 * 1024 * 1024,
            maxFiles: 5,
          }),
          new transports.File({
            filename: path.join(__dirname, "../../../logs/combined.log"),
            maxsize: 10 * 1024 * 1024,
            maxFiles: 10,
          }),
        ]
      : []),
  ],
  exitOnError: false,
});

module.exports = logger;
