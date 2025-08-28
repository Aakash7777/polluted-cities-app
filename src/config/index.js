/**
 * Application Configuration Module
 * Centralized configuration management for the polluted cities backend service
 * 
 * This module handles all environment variables and provides default values
 * for development and production environments.
 */

require('dotenv').config()

const config = {
  // Server configuration
  server: {
    port: process.env.PORT || 3000,
    nodeEnv: process.env.NODE_ENV || 'development',
    isProduction: process.env.NODE_ENV === 'production',
    isDevelopment: process.env.NODE_ENV === 'development'
  },

  // Pollution API configuration (legacy mock API) - DEPRECATED
  // Using OpenAQ API instead
  pollutionApi: {
    baseUrl: process.env.POLLUTION_API_BASE_URL || 'https://be-recruitment-task.onrender.com',
    username: process.env.POLLUTION_API_USERNAME || 'testuser',
    password: process.env.POLLUTION_API_PASSWORD || 'testpass',
    timeout: 10000, // 10 seconds timeout
    retries: 3,
    enabled: false // Disabled in favor of OpenAQ API
  },

  // OpenAQ API configuration
  openaq: {
    baseUrl: process.env.OPENAQ_API_BASE_URL || 'https://api.openaq.org',
    apiKey: process.env.OPENAQ_API_KEY || null, // Optional API key for higher rate limits
    timeout: 15000, // 15 seconds timeout
    retries: 3,
    enabled: process.env.OPENAQ_ENABLED === 'true' && process.env.OPENAQ_API_KEY // Only enable if explicitly set and API key provided
  },

  // Wikipedia API configuration
  wikipediaApi: {
    baseUrl: process.env.WIKIPEDIA_API_BASE_URL || 'https://en.wikipedia.org/api/rest_v1/page/summary',
    timeout: 8000, // 8 seconds timeout
    retries: 2
  },

  // Database configuration
  database: {
    path: process.env.DATABASE_PATH || './data/cities.db',
    enableWAL: process.env.DATABASE_WAL !== 'false', // Enable WAL mode by default
    cleanupInterval: parseInt(process.env.DATABASE_CLEANUP_INTERVAL) || 86400000, // 24 hours
    historyRetentionDays: parseInt(process.env.DATABASE_HISTORY_RETENTION_DAYS) || 30
  },

  // Cache configuration
  cache: {
    ttl: parseInt(process.env.CACHE_TTL) || 3600, // 1 hour default
    wikipediaTtl: parseInt(process.env.WIKIPEDIA_CACHE_TTL) || 86400, // 24 hours default
    checkPeriod: 600 // Check for expired keys every 10 minutes
  },

  // Rate limiting configuration
  rateLimit: {
    windowMs: parseInt(process.env.RATE_LIMIT_WINDOW_MS) || 900000, // 15 minutes
    maxRequests: parseInt(process.env.RATE_LIMIT_MAX_REQUESTS) || 100
  },

  // Logging configuration
  logging: {
    level: process.env.LOG_LEVEL || 'info',
    format: process.env.NODE_ENV === 'production' ? 'json' : 'simple'
  },

  // City validation configuration
  cityValidation: {
    minNameLength: 2,
    maxNameLength: 100,
    allowedCountries: new Set(['PL', 'DE', 'ES', 'FR']) // Using country codes as per API requirements
  },

  // Google Places API configuration - DEPRECATED
  // City validation now uses basic validation only
  googlePlaces: {
    apiKey: process.env.GOOGLE_PLACES_API_KEY || null,
    timeout: 5000, // 5 seconds timeout
    enabled: false // Disabled to remove external dependency
  }
}

module.exports = config
