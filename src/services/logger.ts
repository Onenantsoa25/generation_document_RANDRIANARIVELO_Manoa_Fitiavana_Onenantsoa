import winston from 'winston';
import { format } from 'winston';

const logFormat = format.printf(({ timestamp, level, message, batchId, documentId, userId, ...metadata }) => {
  const logEntry: any = {
    timestamp,
    level,
    message,
    ...metadata
  };
  
  if (batchId) logEntry.batchId = batchId;
  if (documentId) logEntry.documentId = documentId;
  if (userId) logEntry.userId = userId;
  
  return JSON.stringify(logEntry);
});

export const logger = winston.createLogger({
  level: process.env.LOG_LEVEL || 'info',
  format: format.combine(
    format.timestamp(),
    format.errors({ stack: true }),
    format.splat(),
    logFormat
  ),
  transports: [
    new winston.transports.Console({
      format: format.combine(
        format.colorize(),
        format.timestamp(),
        format.printf(({ timestamp, level, message, batchId, documentId, userId, ...metadata }) => {
          let logMsg = `${timestamp} [${level}] ${message}`;
          if (batchId) logMsg += ` [batchId=${batchId}]`;
          if (documentId) logMsg += ` [documentId=${documentId}]`;
          if (userId) logMsg += ` [userId=${userId}]`;
          if (Object.keys(metadata).length > 0 && metadata[Symbol.for('splat')] !== undefined) {
            logMsg += ` ${JSON.stringify(metadata)}`;
          }
          return logMsg;
        })
      )
    }),
    new winston.transports.File({
      filename: 'logs/error.log',
      level: 'error',
      format: format.combine(
        format.timestamp(),
        format.json()
      )
    }),
    new winston.transports.File({
      filename: 'logs/combined.log',
      format: format.combine(
        format.timestamp(),
        format.json()
      )
    })
  ]
});

export const createContextLogger = (context: { batchId?: string; documentId?: string; userId?: string }) => {
  return {
    info: (message: string, meta?: any) => {
      logger.info(message, { ...context, ...meta });
    },
    error: (message: string, meta?: any) => {
      logger.error(message, { ...context, ...meta });
    },
    warn: (message: string, meta?: any) => {
      logger.warn(message, { ...context, ...meta });
    },
    debug: (message: string, meta?: any) => {
      logger.debug(message, { ...context, ...meta });
    }
  };
};

export default logger;