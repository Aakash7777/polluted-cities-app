/**
 * Wikipedia API Service Module
 * Handles communication with Wikipedia API for city descriptions
 * 
 * Provides efficient API calls with caching, rate limiting,
 * and error handling for fetching city descriptions.
 */

const axios = require('axios')
const config = require('../config')
const logger = require('../utils/logger')
const cache = require('../utils/cache')

class WikipediaService {
  constructor() {
    // Create axios instance for Wikipedia API
    this.apiClient = axios.create({
      baseURL: config.wikipediaApi.baseUrl,
      timeout: config.wikipediaApi.timeout,
      headers: {
        'Content-Type': 'application/json',
        'User-Agent': 'PollutedCitiesBackend/1.0.0 (https://github.com/your-repo)'
      }
    })

    this.setupInterceptors()
  }

  /**
   * Set up axios interceptors for logging and error handling
   */
  setupInterceptors() {
    this.apiClient.interceptors.request.use(
      (config) => {
        logger.debug('Wikipedia API request', {
          method: config.method,
          url: config.url
        })
        return config
      },
      (error) => {
        logger.error('Wikipedia API request error', { error: error.message })
        return Promise.reject(error)
      }
    )

    this.apiClient.interceptors.response.use(
      (response) => {
        logger.debug('Wikipedia API response', {
          status: response.status,
          url: response.config.url
        })
        return response
      },
      (error) => {
        this.handleApiError(error)
        return Promise.reject(error)
      }
    )
  }

  /**
   * Handle Wikipedia API errors
   * @param {Error} error - Axios error object
   */
  handleApiError(error) {
    const errorInfo = {
      message: error.message,
      url: error.config?.url,
      status: error.response?.status
    }

    if (error.response?.status === 404) {
      logger.debug('Wikipedia page not found', errorInfo)
    } else {
      logger.error('Wikipedia API error', errorInfo)
    }
  }

  /**
   * Get city description from Wikipedia
   * @param {string} cityName - Name of the city
   * @param {string} countryName - Name of the country
   * @returns {Promise<string|null>} City description or null if not found
   */
  async getCityDescription(cityName, countryName) {
    const cacheKey = `wikipedia_${this.sanitizeKey(cityName)}_${this.sanitizeKey(countryName)}`
    
    // Check cache first
    const cachedDescription = cache.get(cacheKey)
    if (cachedDescription !== undefined) {
      logger.debug('Returning cached Wikipedia description', { cityName })
      return cachedDescription
    }

    try {
      // Try different search strategies
      const description = await this.searchCityDescription(cityName, countryName)
      
      // Cache the result (including null for not found)
      cache.setWikipedia(cacheKey, description)
      
      return description
    } catch (error) {
      logger.error('Failed to fetch Wikipedia description', {
        cityName,
        countryName,
        error: error.message
      })
      
      // Cache null to avoid repeated failed requests
      cache.setWikipedia(cacheKey, null)
      return null
    }
  }

  /**
   * Search for city description using multiple strategies
   * @param {string} cityName - Name of the city
   * @param {string} countryName - Name of the country
   * @returns {Promise<string|null>} City description or null
   */
  async searchCityDescription(cityName, countryName) {
    const searchStrategies = [
      // Strategy 1: City name only
      () => this.fetchWikipediaPage(cityName),
      
      // Strategy 2: City, Country format
      () => this.fetchWikipediaPage(`${cityName}, ${countryName}`),
      
      // Strategy 3: City (Country) format
      () => this.fetchWikipediaPage(`${cityName} (${countryName})`),
      
      // Strategy 4: Clean city name
      () => this.fetchWikipediaPage(this.cleanCityName(cityName))
    ]

    for (const strategy of searchStrategies) {
      try {
        const description = await strategy()
        if (description) {
          return description
        }
      } catch (error) {
        // Continue to next strategy
        logger.debug('Wikipedia search strategy failed', {
          cityName,
          strategy: strategy.name,
          error: error.message
        })
      }
    }

    return null
  }

  /**
   * Fetch Wikipedia page and extract description
   * @param {string} pageTitle - Wikipedia page title
   * @returns {Promise<string|null>} Page description or null
   */
  async fetchWikipediaPage(pageTitle) {
    try {
      const response = await this.makeRequestWithRetry(`/${encodeURIComponent(pageTitle)}`)
      
      if (response.data && response.data.extract) {
        // Clean and truncate the description
        const description = this.cleanDescription(response.data.extract)
        return description
      }
      
      return null
    } catch (error) {
      if (error.response?.status === 404) {
        return null // Page not found
      }
      throw error
    }
  }

  /**
   * Make Wikipedia API request with retry logic
   * @param {string} endpoint - API endpoint
   * @returns {Promise<Object>} API response
   */
  async makeRequestWithRetry(endpoint) {
    const maxRetries = config.wikipediaApi.retries
    let lastError

    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        const response = await this.apiClient.get(endpoint)
        return response
      } catch (error) {
        lastError = error
        
        // Don't retry on 404 or client errors
        if (error.response && error.response.status >= 400 && error.response.status < 500) {
          throw error
        }

        if (attempt < maxRetries) {
          const delay = Math.pow(2, attempt) * 500 // Shorter delays for Wikipedia
          logger.debug(`Wikipedia API retry attempt ${attempt}`, {
            endpoint,
            delay
          })
          
          await this.sleep(delay)
        }
      }
    }

    throw lastError
  }

  /**
   * Clean and truncate Wikipedia description
   * @param {string} extract - Raw Wikipedia extract
   * @returns {string} Cleaned description
   */
  cleanDescription(extract) {
    if (!extract || typeof extract !== 'string') {
      return null
    }

    // Remove extra whitespace and newlines
    let cleaned = extract
      .replace(/\s+/g, ' ')
      .trim()
      .replace(/\n/g, ' ')

    // Truncate to reasonable length (max 300 characters)
    if (cleaned.length > 300) {
      cleaned = cleaned.substring(0, 297) + '...'
    }

    return cleaned
  }

  /**
   * Clean city name for better Wikipedia search
   * @param {string} cityName - Raw city name
   * @returns {string} Cleaned city name
   */
  cleanCityName(cityName) {
    return cityName
      .replace(/[^\w\s\-\.]/g, '') // Remove special characters
      .replace(/\s+/g, ' ') // Normalize whitespace
      .trim()
  }

  /**
   * Sanitize string for cache key
   * @param {string} str - String to sanitize
   * @returns {string} Sanitized string
   */
  sanitizeKey(str) {
    return str
      .toLowerCase()
      .replace(/[^\w]/g, '_')
      .replace(/_+/g, '_')
      .replace(/^_|_$/g, '')
  }

  /**
   * Sleep utility for retry delays
   * @param {number} ms - Milliseconds to sleep
   * @returns {Promise} Promise that resolves after delay
   */
  sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms))
  }

  /**
   * Get Wikipedia service health status
   * @returns {Promise<Object>} Health status
   */
  async getHealthStatus() {
    try {
      const response = await this.apiClient.get('/London')
      return {
        status: 'healthy',
        response: response.data ? 'Data received' : 'No data'
      }
    } catch (error) {
      return {
        status: 'unhealthy',
        error: error.message
      }
    }
  }
}

module.exports = new WikipediaService()
