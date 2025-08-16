/**
 * Error Handling Middleware Module
 * Comprehensive error handling for Express application
 * 
 * Provides centralized error handling, logging, and response formatting
 * for all application errors and exceptions.
 */

const logger = require('../utils/logger')

/**
 * Global error handling middleware
 * @param {Error} err - Error object
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 * @param {Function} next - Express next function
 */
function errorHandler(err, req, res, next) {
  // Log the error with context
  logger.error('Unhandled error occurred', {
    error: err.message,
    stack: err.stack,
    url: req.url,
    method: req.method,
    ip: req.ip,
    userAgent: req.get('User-Agent'),
    timestamp: new Date().toISOString()
  })

  // Determine error type and appropriate response
  const { statusCode, message } = determineErrorResponse(err)

  // Send error response
  res.status(statusCode).json({
    success: false,
    error: {
      message,
      code: statusCode,
      ...(process.env.NODE_ENV === 'development' && { stack: err.stack })
    },
    timestamp: new Date().toISOString()
  })
}

/**
 * Determine appropriate error response based on error type
 * @param {Error} err - Error object
 * @returns {Object} Status code and message
 */
function determineErrorResponse(err) {
  // Default values
  let statusCode = 500
  let message = 'Internal server error'

  // Handle specific error types
  if (err.name === 'ValidationError') {
    statusCode = 400
    message = 'Validation error: ' + err.message
  } else if (err.name === 'CastError') {
    statusCode = 400
    message = 'Invalid data format'
  } else if (err.code === 'ENOTFOUND') {
    statusCode = 503
    message = 'External service unavailable'
  } else if (err.code === 'ECONNREFUSED') {
    statusCode = 503
    message = 'External service connection refused'
  } else if (err.code === 'ETIMEDOUT') {
    statusCode = 504
    message = 'External service timeout'
  } else if (err.response) {
    // Axios error with response
    statusCode = err.response.status
    message = `External API error: ${err.response.statusText}`
  } else if (err.request) {
    // Axios error without response
    statusCode = 503
    message = 'External service unavailable'
  } else if (err.status) {
    // Custom error with status
    statusCode = err.status
    message = err.message || 'Request failed'
  }

  return { statusCode, message }
}

/**
 * 404 handler for unmatched routes
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 */
function notFoundHandler(req, res) {
  logger.warn('Route not found', {
    url: req.url,
    method: req.method,
    ip: req.ip
  })

  res.status(404).json({
    success: false,
    error: {
      message: 'Route not found',
      code: 404
    },
    timestamp: new Date().toISOString()
  })
}

/**
 * Async error wrapper for route handlers
 * @param {Function} fn - Async route handler function
 * @returns {Function} Wrapped function with error handling
 */
function asyncHandler(fn) {
  return (req, res, next) => {
    Promise.resolve(fn(req, res, next)).catch(next)
  }
}

/**
 * Request validation middleware
 * @param {Object} schema - Joi validation schema
 * @returns {Function} Validation middleware
 */
function validateRequest(schema) {
  return (req, res, next) => {
    const { error } = schema.validate(req.body)
    
    if (error) {
      logger.warn('Request validation failed', {
        error: error.details[0].message,
        url: req.url,
        method: req.method
      })

      return res.status(400).json({
        success: false,
        error: {
          message: 'Validation error: ' + error.details[0].message,
          code: 400
        },
        timestamp: new Date().toISOString()
      })
    }
    
    next()
  }
}

module.exports = {
  errorHandler,
  notFoundHandler,
  asyncHandler,
  validateRequest
}
