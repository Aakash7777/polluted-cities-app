/**
 * Cache Utility Module
 * In-memory caching implementation using node-cache
 * 
 * Provides efficient caching for API responses to reduce
 * external API calls and improve performance.
 */

const NodeCache = require('node-cache')
const config = require('../config')
const logger = require('./logger')

class CacheManager {
  constructor() {
    // Initialize cache with configuration
    this.cache = new NodeCache({
      stdTTL: config.cache.ttl,
      checkperiod: config.cache.checkPeriod,
      useClones: false, // Better performance for objects
      deleteOnExpire: true
    })

    // Set up cache event listeners for monitoring
    this.setupEventListeners()
    
    logger.info('Cache manager initialized', {
      ttl: config.cache.ttl,
      checkPeriod: config.cache.checkPeriod
    })
  }

  /**
   * Set up cache event listeners for monitoring and debugging
   */
  setupEventListeners() {
    this.cache.on('expired', (key, value) => {
      logger.debug('Cache key expired', { key })
    })

    this.cache.on('flush', () => {
      logger.info('Cache flushed')
    })

    this.cache.on('del', (key, value) => {
      logger.debug('Cache key deleted', { key })
    })
  }

  /**
   * Get a value from cache
   * @param {string} key - Cache key
   * @returns {*} Cached value or undefined if not found
   */
  get(key) {
    const value = this.cache.get(key)
    if (value !== undefined) {
      logger.debug('Cache hit', { key })
    } else {
      logger.debug('Cache miss', { key })
    }
    return value
  }

  /**
   * Set a value in cache
   * @param {string} key - Cache key
   * @param {*} value - Value to cache
   * @param {number} ttl - Time to live in seconds (optional)
   */
  set(key, value, ttl = null) {
    const cacheTtl = ttl || config.cache.ttl
    this.cache.set(key, value, cacheTtl)
    logger.debug('Cache set', { key, ttl: cacheTtl })
  }

  /**
   * Set a Wikipedia-specific cache entry with longer TTL
   * @param {string} key - Cache key
   * @param {*} value - Value to cache
   */
  setWikipedia(key, value) {
    this.set(key, value, config.cache.wikipediaTtl)
  }

  /**
   * Delete a value from cache
   * @param {string} key - Cache key
   * @returns {boolean} True if key was deleted
   */
  delete(key) {
    const deleted = this.cache.del(key)
    if (deleted) {
      logger.debug('Cache key deleted', { key })
    }
    return deleted > 0
  }

  /**
   * Clear all cache entries
   */
  flush() {
    this.cache.flushAll()
    logger.info('Cache flushed')
  }

  /**
   * Get cache statistics
   * @returns {Object} Cache statistics
   */
  getStats() {
    return this.cache.getStats()
  }

  /**
   * Check if cache has a key
   * @param {string} key - Cache key
   * @returns {boolean} True if key exists
   */
  has(key) {
    return this.cache.has(key)
  }

  /**
   * Get multiple values from cache
   * @param {string[]} keys - Array of cache keys
   * @returns {Object} Object with key-value pairs
   */
  mget(keys) {
    return this.cache.mget(keys)
  }

  /**
   * Set multiple values in cache
   * @param {Object} keyValuePairs - Object with key-value pairs
   * @param {number} ttl - Time to live in seconds (optional)
   */
  mset(keyValuePairs, ttl = null) {
    const cacheTtl = ttl || config.cache.ttl
    this.cache.mset(keyValuePairs, cacheTtl)
    logger.debug('Cache mset', { 
      keys: Object.keys(keyValuePairs), 
      ttl: cacheTtl 
    })
  }
}

// Create singleton instance
const cacheManager = new CacheManager()

module.exports = cacheManager
