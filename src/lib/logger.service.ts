const winston = require('winston');

const isProd = process.env.NODE_ENV === 'production';

const fmt = isProd
  ? winston.format.combine(
      winston.format.timestamp({ format: 'HH:mm:ss' }),
      winston.format.errors({ stack: true }),
      winston.format.json()
    )
  : winston.format.combine(
      winston.format.timestamp({ format: 'HH:mm:ss' }),
      winston.format.colorize({ all: true }),
      winston.format.errors({ stack: true }),
      winston.format.printf(({ timestamp, level, message, stack, ...meta }) => {
        const m = Object.keys(meta).length ? ` ${JSON.stringify(meta, null, 2)}` : '';
        return `${String(timestamp)} [${level}]: ${String(stack || message)}${m}`;
      })
    );

export const logger = winston.createLogger({
  level: isProd ? 'info' : 'debug',
  format: fmt,
  transports: [new winston.transports.Console()],
});