/**
 * Main Server Module
 * Production-ready Express server for polluted cities backend
 * 
 * Sets up the Express application with all necessary middleware,
 * routes, error handling, and security features.
 */

const express = require('express')
const helmet = require('helmet')
const cors = require('cors')
const compression = require('compression')
const rateLimit = require('express-rate-limit')

const config = require('./config')
const logger = require('./utils/logger')
const { errorHandler, notFoundHandler } = require('./middleware/errorHandler')

// Import routes
const citiesRoutes = require('./routes/cities')

// Create Express application
const app = express()

// Security middleware
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      styleSrc: ["'self'", "'unsafe-inline'", "https://fonts.googleapis.com", "https://cdnjs.cloudflare.com"],
      scriptSrc: ["'self'", "'unsafe-inline'"],
      scriptSrcAttr: ["'unsafe-inline'"],
      imgSrc: ["'self'", "data:", "https:"],
      fontSrc: ["'self'", "https://fonts.gstatic.com", "https://cdnjs.cloudflare.com"],
    },
  },
  hsts: {
    maxAge: 31536000,
    includeSubDomains: true,
    preload: true
  }
}))

// CORS configuration
app.use(cors({
  origin: process.env.NODE_ENV === 'production' 
    ? ['https://your-frontend-domain.com'] 
    : true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization'],
  credentials: true
}))

// Compression middleware
app.use(compression({
  level: 6,
  threshold: 1024,
  filter: (req, res) => {
    if (req.headers['x-no-compression']) {
      return false
    }
    return compression.filter(req, res)
  }
}))

// Rate limiting
const limiter = rateLimit({
  windowMs: config.rateLimit.windowMs,
  max: config.rateLimit.maxRequests,
  message: {
    success: false,
    error: {
      message: 'Too many requests, please try again later.',
      code: 429
    },
    timestamp: new Date().toISOString()
  },
  standardHeaders: true,
  legacyHeaders: false,
  handler: (req, res) => {
    logger.warn('Rate limit exceeded', {
      ip: req.ip,
      userAgent: req.get('User-Agent')
    })
    res.status(429).json({
      success: false,
      error: {
        message: 'Too many requests, please try again later.',
        code: 429
      },
      timestamp: new Date().toISOString()
    })
  }
})

app.use(limiter)

// Body parsing middleware
app.use(express.json({ limit: '10mb' }))
app.use(express.urlencoded({ extended: true, limit: '10mb' }))

// Serve static files from public directory
app.use(express.static('public'))

// Request logging middleware
app.use((req, res, next) => {
  const start = Date.now()
  
  res.on('finish', () => {
    const duration = Date.now() - start
    logger.info('HTTP Request', {
      method: req.method,
      url: req.url,
      status: res.statusCode,
      duration: `${duration}ms`,
      ip: req.ip,
      userAgent: req.get('User-Agent')
    })
  })
  
  next()
})

// Health check endpoint
app.get('/health', (req, res) => {
  res.status(200).json({
    success: true,
    status: 'healthy',
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
    environment: config.server.nodeEnv,
    version: '1.0.0'
  })
})

// API routes
app.use('/cities', citiesRoutes)

// API documentation endpoint
app.get('/docs', (req, res) => {
  res.json({
    success: true,
    message: 'Polluted Cities API Documentation',
    version: '1.0.0',
    endpoints: {
      'GET /health': 'Health check endpoint',
      'GET /cities': 'Fetch polluted cities data with validation and enrichment (supports ?country=PL|DE|ES|FR&page=1&limit=10 query parameters)',
      'GET /docs': 'API documentation'
    },
    features: [
      'Fetches data from external pollution API',
      'Validates and filters corrupted/invalid entries',
      'Enriches cities with Wikipedia descriptions',
      'Groups cities by country',
      'Sorts by pollution levels',
      'Implements caching and rate limiting',
      'Production-ready error handling and logging'
    ],
    responseFormat: {
      success: 'boolean',
      data: {
        totalCities: 'number',
        totalCountries: 'number',
        countries: 'array of country objects with cities'
      },
      metadata: {
        timestamp: 'ISO string',
        version: 'string'
      }
    }
  })
})

// 404 handler for unmatched routes
app.use(notFoundHandler)

// Global error handler (must be last)
app.use(errorHandler)

// Graceful shutdown handling
process.on('SIGTERM', () => {
  logger.info('SIGTERM received, shutting down gracefully')
  process.exit(0)
})

process.on('SIGINT', () => {
  logger.info('SIGINT received, shutting down gracefully')
  process.exit(0)
})

// Unhandled promise rejection handler
process.on('unhandledRejection', (reason, promise) => {
  logger.error('Unhandled Rejection at:', {
    promise,
    reason,
    stack: reason.stack
  })
})

// Uncaught exception handler
process.on('uncaughtException', (error) => {
  logger.error('Uncaught Exception:', {
    error: error.message,
    stack: error.stack
  })
  process.exit(1)
})

// Start server
const PORT = config.server.port

app.listen(PORT, () => {
  logger.info('Server started successfully', {
    port: PORT,
    environment: config.server.nodeEnv,
    version: '1.0.0',
    timestamp: new Date().toISOString()
  })
  
  console.log(`🚀 Polluted Cities Backend Server running on port ${PORT}`)
  console.log(`📊 Environment: ${config.server.nodeEnv}`)
  console.log(`🎨 Beautiful Dashboard: http://localhost:${PORT}`)
  console.log(`🔗 Health check: http://localhost:${PORT}/health`)
  console.log(`📚 API docs: http://localhost:${PORT}/docs`)
  console.log(`🌍 Cities endpoint: http://localhost:${PORT}/cities`)
})

module.exports = app
