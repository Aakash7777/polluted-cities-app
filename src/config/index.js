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

  // Pollution API configuration
  pollutionApi: {
    baseUrl: process.env.POLLUTION_API_BASE_URL || 'https://be-recruitment-task.onrender.com',
    username: process.env.POLLUTION_API_USERNAME || 'testuser',
    password: process.env.POLLUTION_API_PASSWORD || 'testpass',
    timeout: 10000, // 10 seconds timeout
    retries: 3
  },

  // Wikipedia API configuration
  wikipediaApi: {
    baseUrl: process.env.WIKIPEDIA_API_BASE_URL || 'https://en.wikipedia.org/api/rest_v1/page/summary',
    timeout: 8000, // 8 seconds timeout
    retries: 2
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

  // Google Places API configuration
  googlePlaces: {
    apiKey: process.env.GOOGLE_PLACES_API_KEY || 'AIzaSyDMp1mcNkz7742rs2YraNahayoT3f4c7aU',
    timeout: 5000, // 5 seconds timeout
    enabled: process.env.GOOGLE_PLACES_ENABLED !== 'false' // Enabled by default
  }
}

module.exports = config
