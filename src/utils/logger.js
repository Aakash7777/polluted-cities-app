/**
 * Logger Utility Module
 * Production-ready logging configuration using Winston
 * 
 * Provides structured logging with different levels and formats
 * for development and production environments.
 */

const winston = require('winston')
const config = require('../config')

// Define log format for development
const developmentFormat = winston.format.combine(
  winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
  winston.format.errors({ stack: true }),
  winston.format.colorize(),
  winston.format.printf(({ timestamp, level, message, stack, ...meta }) => {
    let log = `${timestamp} [${level}]: ${message}`
    if (Object.keys(meta).length > 0) {
      log += ` ${JSON.stringify(meta)}`
    }
    if (stack) {
      log += `\n${stack}`
    }
    return log
  })
)

// Define log format for production
const productionFormat = winston.format.combine(
  winston.format.timestamp(),
  winston.format.errors({ stack: true }),
  winston.format.json()
)

// Create logger instance
const logger = winston.createLogger({
  level: config.logging.level,
  format: config.server.isProduction ? productionFormat : developmentFormat,
  defaultMeta: { service: 'polluted-cities-backend' },
  transports: [
    // Console transport for all environments
    new winston.transports.Console({
      format: config.server.isProduction ? productionFormat : developmentFormat
    })
  ]
})

// Add file transport for production
if (config.server.isProduction) {
  logger.add(new winston.transports.File({
    filename: 'logs/error.log',
    level: 'error',
    maxsize: 5242880, // 5MB
    maxFiles: 5
  }))
  
  logger.add(new winston.transports.File({
    filename: 'logs/combined.log',
    maxsize: 5242880, // 5MB
    maxFiles: 5
  }))
}

// Create a stream object for Morgan HTTP logging
logger.stream = {
  write: (message) => {
    logger.info(message.trim())
  }
}

module.exports = logger
