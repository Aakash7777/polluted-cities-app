/**
 * Pollution API Service Module
 * Handles communication with the external pollution data API
 * 
 * Provides authenticated API calls with retry logic, error handling,
 * and proper response processing for the pollution cities data.
 */

const axios = require('axios')
const config = require('../config')
const logger = require('../utils/logger')
const cache = require('../utils/cache')

class PollutionApiService {
  constructor() {
    // Create axios instance with base configuration
    this.apiClient = axios.create({
      baseURL: config.pollutionApi.baseUrl,
      timeout: config.pollutionApi.timeout,
      headers: {
        'Content-Type': 'application/json',
        'User-Agent': 'PollutedCitiesBackend/1.0.0'
      }
    })

    // Authentication state
    this.authToken = null
    this.refreshToken = null
    this.tokenExpiry = null

    // Set up request/response interceptors
    this.setupInterceptors()
  }

  /**
   * Authenticate with the external API to get access token
   * @returns {Promise<Object>} Authentication response
   */
  async authenticate() {
    const cacheKey = 'pollution_api_auth'
    
    // Check if we have a valid cached token
    const cachedAuth = cache.get(cacheKey)
    if (cachedAuth && cachedAuth.expiry > Date.now()) {
      this.authToken = cachedAuth.token
      this.refreshToken = cachedAuth.refreshToken
      this.tokenExpiry = cachedAuth.expiry
      logger.info('Using cached authentication token')
      return cachedAuth
    }

    logger.info('Authenticating with external API')
    
    try {
      const response = await this.apiClient.post('/auth/login', {
        username: config.pollutionApi.username,
        password: config.pollutionApi.password
      })

      if (!response.data || !response.data.token) {
        throw new Error('Invalid authentication response: missing token')
      }

      // Store authentication data
      this.authToken = response.data.token
      this.refreshToken = response.data.refreshToken
      this.tokenExpiry = Date.now() + (response.data.expiresIn * 1000)

      // Cache the authentication data
      const authData = {
        token: this.authToken,
        refreshToken: this.refreshToken,
        expiry: this.tokenExpiry
      }
      cache.set(cacheKey, authData, response.data.expiresIn)

      logger.info('Successfully authenticated with external API', {
        expiresIn: response.data.expiresIn,
        tokenExpiry: new Date(this.tokenExpiry).toISOString()
      })

      return response.data
    } catch (error) {
      logger.error('Authentication failed', { error: error.message })
      throw new Error(`Authentication failed: ${error.message}`)
    }
  }

  /**
   * Refresh authentication token using refresh token
   * @returns {Promise<Object>} New authentication response
   */
  async refreshAuth() {
    if (!this.refreshToken) {
      throw new Error('No refresh token available')
    }

    logger.info('Refreshing authentication token')
    
    try {
      const response = await this.apiClient.post('/auth/refresh', {
        refreshToken: this.refreshToken
      })

      if (!response.data || !response.data.token) {
        throw new Error('Invalid refresh response: missing token')
      }

      // Update authentication data
      this.authToken = response.data.token
      this.refreshToken = response.data.refreshToken || this.refreshToken
      this.tokenExpiry = Date.now() + (response.data.expiresIn * 1000)

      // Update cache
      const cacheKey = 'pollution_api_auth'
      const authData = {
        token: this.authToken,
        refreshToken: this.refreshToken,
        expiry: this.tokenExpiry
      }
      cache.set(cacheKey, authData, response.data.expiresIn)

      logger.info('Successfully refreshed authentication token', {
        expiresIn: response.data.expiresIn,
        tokenExpiry: new Date(this.tokenExpiry).toISOString()
      })

      return response.data
    } catch (error) {
      logger.error('Token refresh failed', { error: error.message })
      // Clear invalid tokens
      this.authToken = null
      this.refreshToken = null
      this.tokenExpiry = null
      cache.delete('pollution_api_auth')
      throw new Error(`Token refresh failed: ${error.message}`)
    }
  }

  /**
   * Ensure we have a valid authentication token
   * @returns {Promise<void>}
   */
  async ensureAuthenticated() {
    // Check if we need to authenticate or refresh
    if (!this.authToken || (this.tokenExpiry && Date.now() >= this.tokenExpiry)) {
      if (this.refreshToken) {
        try {
          await this.refreshAuth()
        } catch (error) {
          logger.warn('Token refresh failed, re-authenticating', { error: error.message })
          await this.authenticate()
        }
      } else {
        await this.authenticate()
      }
    }
  }

  /**
   * Set up axios interceptors for logging and error handling
   */
  setupInterceptors() {
    // Request interceptor for authentication and logging
    this.apiClient.interceptors.request.use(
      async (config) => {
        // Skip authentication for login and refresh endpoints
        const isAuthEndpoint = config.url === '/auth/login' || config.url === '/auth/refresh'
        
        if (!isAuthEndpoint) {
          // Ensure we have a valid token before making the request
          await this.ensureAuthenticated()
          
          // Add authorization header with token
          config.headers.Authorization = `Bearer ${this.authToken}`
        }

        // Log detailed request information
        const fullUrl = `${config.baseURL}${config.url}`
        logger.info('🌐 Making external API request:', {
          method: config.method?.toUpperCase(),
          fullUrl: fullUrl,
          baseURL: config.baseURL,
          endpoint: config.url,
          auth: {
            type: isAuthEndpoint ? 'credentials' : 'bearer_token',
            token: isAuthEndpoint ? 'none' : this.authToken ? '***' : 'none'
          },
          headers: {
            'Content-Type': config.headers?.['Content-Type'],
            'User-Agent': config.headers?.['User-Agent'],
            'Authorization': config.headers?.Authorization ? 'Bearer ***' : 'none'
          },
          timeout: config.timeout,
          params: config.params || 'none',
          data: config.data || 'none'
        })
        
        // Also log in a more readable format
        console.log(`\n🔗 External API Call:`)
        console.log(`   Method: ${config.method?.toUpperCase()}`)
        console.log(`   URL: ${fullUrl}`)
        console.log(`   Auth Type: ${isAuthEndpoint ? 'Credentials' : 'Bearer Token'}`)
        console.log(`   Headers: ${JSON.stringify(config.headers, null, 2)}`)
        console.log(`   Timeout: ${config.timeout}ms`)
        console.log(`   Params: ${JSON.stringify(config.params || {}, null, 2)}`)
        console.log(`   Data: ${JSON.stringify(config.data || {}, null, 2)}\n`)
        
        return config
      },
      (error) => {
        logger.error('Pollution API request error', { error: error.message })
        return Promise.reject(error)
      }
    )

    // Response interceptor for logging and error handling
    this.apiClient.interceptors.response.use(
      (response) => {
        // Log detailed response information
        logger.info('✅ External API response received:', {
          status: response.status,
          statusText: response.statusText,
          url: response.config.url,
          fullUrl: `${response.config.baseURL}${response.config.url}`,
          dataLength: Array.isArray(response.data) ? response.data.length : 'N/A',
          dataType: typeof response.data,
          headers: response.headers
        })
        
        // Also log in a more readable format
        console.log(`\n✅ External API Response:`)
        console.log(`   Status: ${response.status} ${response.statusText}`)
        console.log(`   URL: ${response.config.baseURL}${response.config.url}`)
        console.log(`   Data Type: ${typeof response.data}`)
        
        // Log the actual response data structure
        if (response.data) {
          if (Array.isArray(response.data)) {
            console.log(`   Data Length: ${response.data.length}`)
            if (response.data.length > 0) {
              console.log(`   Sample Data: ${JSON.stringify(response.data[0], null, 2)}`)
            }
          } else if (typeof response.data === 'object') {
            console.log(`   Response Structure: ${JSON.stringify(Object.keys(response.data), null, 2)}`)
            if (response.data.meta) {
              console.log(`   Meta: ${JSON.stringify(response.data.meta, null, 2)}`)
            }
            if (response.data.results && Array.isArray(response.data.results)) {
              console.log(`   Results Count: ${response.data.results.length}`)
              if (response.data.results.length > 0) {
                console.log(`   Sample Result: ${JSON.stringify(response.data.results[0], null, 2)}`)
              }
            }
            // Log full response data for debugging
            console.log(`   Full Response Data: ${JSON.stringify(response.data, null, 2)}`)
          }
        }
        
        console.log(`   Headers: ${JSON.stringify(response.headers, null, 2)}\n`)
        
        return response
      },
      (error) => {
        this.handleApiError(error)
        return Promise.reject(error)
      }
    )
  }

  /**
   * Handle API errors with proper logging and categorization
   * @param {Error} error - Axios error object
   */
  handleApiError(error) {
    const errorInfo = {
      message: error.message,
      url: error.config?.url,
      method: error.config?.method,
      status: error.response?.status,
      statusText: error.response?.statusText
    }

    if (error.response) {
      // Server responded with error status
      logger.error('Pollution API server error', errorInfo)
    } else if (error.request) {
      // Request was made but no response received
      logger.error('Pollution API network error', errorInfo)
    } else {
      // Something else happened
      logger.error('Pollution API request setup error', errorInfo)
    }
  }

  /**
   * Fetch cities data from the pollution API with retry logic
   * Fetches all records for a specific country, filters them, then applies pagination with exactly 9 items per page
   * @param {Array<string>} countries - Array with single country code to fetch
   * @param {Object} pagination - Pagination parameters { page, limit } (optional)
   * @returns {Promise<Object>} Object with cities data and total count
   */
  async fetchCitiesData(countries = null, pagination = null) {
    // Always expect a single country - default to Poland if none specified
    const countryToFetch = countries && countries.length > 0 ? countries[0] : 'PL'
    
    // Create cache key for filtered data for this specific country
    const cacheKey = `pollution_cities_filtered_${countryToFetch}`
    
    // Check cache first for filtered data
    const cachedFilteredData = cache.get(cacheKey)
    if (cachedFilteredData) {
      logger.info('Returning cached filtered pollution data', {
        country: countryToFetch,
        filteredCityCount: cachedFilteredData.length
      })
      
      // Apply pagination to cached filtered data if requested
      if (pagination) {
        return this.applyPaginationToData(cachedFilteredData, pagination)
      }
      
      return {
        cities: cachedFilteredData,
        totalCount: cachedFilteredData.length
      }
    }

    logger.info('Fetching fresh pollution data from API for specific country', {
      country: countryToFetch
    })
    
    try {
      // Ensure we're authenticated before making the request
      await this.ensureAuthenticated()
      
      // Fetch all records for the specific country
      logger.info(`Fetching all pollution data for country: ${countryToFetch}`)
      const allCitiesData = await this.fetchCountryData(countryToFetch)

      logger.info('Successfully fetched all pollution data', {
        totalCities: allCitiesData.length,
        country: countryToFetch
      })

      // Filter all cities using Google Places validation
      const cityValidator = require('../utils/validation')
      const filteredCities = []
      
      logger.info('Starting city validation and filtering', {
        totalCitiesToFilter: allCitiesData.length
      })

      for (const cityData of allCitiesData) {
        try {
          const validationResult = await cityValidator.isValidCity(cityData)
                     if (validationResult.isValid) {
             // Use the corrected city name from Google Places API
             const correctedCityData = {
               ...cityData,
               city: validationResult.correctedName || cityData.city || cityData.name,
               name: validationResult.correctedName || cityData.name || cityData.city,
               cityName: validationResult.correctedName || cityData.cityName || cityData.city || cityData.name,
               correctedName: validationResult.correctedName // Store the corrected name for later use
             }
             filteredCities.push(correctedCityData)
           }
        } catch (error) {
          logger.warn('City validation failed, skipping city', {
            city: cityData.city || cityData.name,
            error: error.message
          })
        }
      }

             logger.info('City filtering completed', {
         originalCount: allCitiesData.length,
         filteredCount: filteredCities.length,
         filteredPercentage: ((filteredCities.length / allCitiesData.length) * 100).toFixed(1) + '%',
         country: countryToFetch
       })

       // Remove duplicate cities after name correction
       const uniqueCities = this.removeDuplicateCities(filteredCities)
       
       logger.info('Duplicate removal completed', {
         beforeDeduplication: filteredCities.length,
         afterDeduplication: uniqueCities.length,
         duplicatesRemoved: filteredCities.length - uniqueCities.length,
         country: countryToFetch
       })

       // Cache the deduplicated dataset for this specific country
       cache.set(cacheKey, uniqueCities)
      
             // Apply pagination if requested
       if (pagination) {
         return this.applyPaginationToData(uniqueCities, pagination)
       }
       
       return {
         cities: uniqueCities,
         totalCount: uniqueCities.length
       }
    } catch (error) {
      logger.error('Failed to fetch pollution data', { error: error.message, country: countryToFetch })
      throw error
    }
  }

  /**
   * Fetch all pollution data for a specific country
   * @param {string} country - Country code (PL, DE, ES, FR)
   * @returns {Promise<Array>} Array of cities data
   */
  async fetchCountryData(country) {
    const citiesData = []
    let page = 1
    let hasMorePages = true
    
    logger.info(`Starting to fetch all data for country: ${country}`)
    
    while (hasMorePages) {
      try {
        const response = await this.makeRequestWithRetry('/pollution', {
          params: {
            country: country,
            page: page,
            limit: 100 // Use maximum limit to reduce API calls
          }
        })

        if (!response.data || !response.data.results) {
          throw new Error(`Invalid response format for country ${country}: missing results`)
        }

        // Add country information to each city
        const citiesWithCountry = response.data.results.map(city => ({
          ...city,
          country: country
        }))
        
        citiesData.push(...citiesWithCountry)

        // Check if there are more pages
        if (response.data.meta && response.data.meta.totalPages) {
          hasMorePages = page < response.data.meta.totalPages
          page++
        } else {
          hasMorePages = false
        }

        logger.debug(`Fetched page ${page - 1} for country ${country}`, {
          citiesInPage: response.data.results.length,
          totalPages: response.data.meta?.totalPages || 1,
          totalCitiesSoFar: citiesData.length
        })

      } catch (error) {
        logger.error(`Failed to fetch data for country ${country}, page ${page}`, { 
          error: error.message 
        })
        throw error
      }
    }

    logger.info(`Completed fetching all data for country ${country}`, {
      totalCities: citiesData.length
    })

    return citiesData
  }

  /**
   * Apply pagination to the filtered dataset with exactly 9 items per page
   * @param {Array} filteredData - Complete filtered dataset
   * @param {Object} pagination - Pagination parameters { page, limit }
   * @returns {Object} Paginated result with cities and total count
   */
  applyPaginationToData(filteredData, pagination) {
    const { page, limit = 9 } = pagination // Default to 9 items per page
    const totalCount = filteredData.length
    const totalPages = Math.ceil(totalCount / limit)
    
    // Calculate start and end indices
    const startIndex = (page - 1) * limit
    const endIndex = startIndex + limit
    
    // Get the slice of data for the requested page
    const paginatedData = filteredData.slice(startIndex, endIndex)
    
    logger.info('Applied pagination to filtered data', {
      totalCount,
      totalPages,
      requestedPage: page,
      requestedLimit: limit,
      returnedCount: paginatedData.length,
      startIndex,
      endIndex,
      itemsPerPage: limit
    })
    
    return {
      cities: paginatedData,
      totalCount,
      totalPages,
      currentPage: page,
      limit
    }
  }

  /**
   * Make API request with retry logic
   * @param {string} endpoint - API endpoint
   * @param {Object} options - Request options
   * @returns {Promise<Object>} API response
   */
  async makeRequestWithRetry(endpoint, options = {}) {
    const maxRetries = config.pollutionApi.retries
    let lastError

    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        const response = await this.apiClient.get(endpoint, options)
        return response
      } catch (error) {
        lastError = error
        
        // Don't retry on client errors (4xx)
        if (error.response && error.response.status >= 400 && error.response.status < 500) {
          logger.warn('Client error, not retrying', {
            status: error.response.status,
            endpoint
          })
          throw error
        }

        // Log retry attempt
        if (attempt < maxRetries) {
          const delay = Math.pow(2, attempt) * 1000 // Exponential backoff
          logger.warn(`API request failed, retrying in ${delay}ms`, {
            attempt,
            maxRetries,
            endpoint,
            error: error.message
          })
          
          await this.sleep(delay)
        }
      }
    }

    // All retries failed
    logger.error('All retry attempts failed', {
      endpoint,
      maxRetries,
      lastError: lastError.message
    })
    
    throw lastError
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
   * Get API health status
   * @returns {Promise<Object>} Health status
   */
  async getHealthStatus() {
    try {
      const response = await this.apiClient.get('/health')
      return {
        status: 'healthy',
        response: response.data
      }
    } catch (error) {
      return {
        status: 'unhealthy',
        error: error.message
      }
    }
  }

  /**
   * Clear cached pollution data (both raw and filtered)
   * @param {string} country - Optional specific country to clear cache for
   */
  clearCache(country = null) {
    if (country) {
      // Clear cache for specific country
      const rawCacheKey = `pollution_cities_data_${country}`
      const filteredCacheKey = `pollution_cities_filtered_${country}`
      cache.delete(rawCacheKey)
      cache.delete(filteredCacheKey)
      logger.info('Cleared cache for specific country', { 
        country,
        rawCacheKey,
        filteredCacheKey
      })
    } else {
      // Clear all pollution data cache entries (both raw and filtered)
      const cacheKeys = cache.keys().filter(key => 
        key.startsWith('pollution_cities_data_') || 
        key.startsWith('pollution_cities_filtered_')
      )
      
      cacheKeys.forEach(key => cache.delete(key))
      logger.info('All pollution data cache entries cleared', { 
        clearedKeys: cacheKeys.length,
        keys: cacheKeys
      })
    }
  }

     /**
    * Remove duplicate cities after name correction
    * @param {Array} cities - Array of cities with corrected names
    * @returns {Array} Array with duplicates removed
    */
   removeDuplicateCities(cities) {
     const cityMap = new Map() // Map to store unique cities with their pollution values
     const duplicates = []

     for (const city of cities) {
       // Use the corrected name for duplicate detection
       const cityName = city.correctedName || city.city || city.name || city.cityName
       
       if (!cityName) {
         logger.warn('City without name found during deduplication', { city })
         continue
       }

       // Get pollution value
       const pollutionValue = city.aqi || city.pollution || city.airQualityIndex || 0

       // Create a unique key combining city name and country
       const uniqueKey = `${cityName.toLowerCase()}_${city.country}`
       
       if (cityMap.has(uniqueKey)) {
         // This is a duplicate - compare pollution values
         const existingCity = cityMap.get(uniqueKey)
         const existingPollution = existingCity.aqi || existingCity.pollution || existingCity.airQualityIndex || 0
         
         if (pollutionValue > existingPollution) {
           // Replace with the city that has higher pollution (more relevant for polluted cities API)
           cityMap.set(uniqueKey, city)
           duplicates.push({
             original: existingCity,
             replacedBy: city,
             duplicateKey: uniqueKey,
             reason: 'Higher pollution value'
           })
           logger.debug('Duplicate city replaced with higher pollution value', {
             cityName,
             country: city.country,
             oldPollution: existingPollution,
             newPollution: pollutionValue
           })
         } else {
           // Keep the existing city (higher pollution)
           duplicates.push({
             original: city,
             kept: existingCity,
             duplicateKey: uniqueKey,
             reason: 'Lower pollution value'
           })
           logger.debug('Duplicate city kept with existing higher pollution value', {
             cityName,
             country: city.country,
             existingPollution: existingPollution,
             newPollution: pollutionValue
           })
         }
       } else {
         // This is a new city
         cityMap.set(uniqueKey, city)
       }
     }

     const uniqueCities = Array.from(cityMap.values())

     if (duplicates.length > 0) {
       logger.info('Duplicate cities processed', {
         totalDuplicates: duplicates.length,
         keptCities: uniqueCities.length,
         duplicates: duplicates.map(d => ({
           cityName: d.original.correctedName || d.original.city || d.original.name,
           country: d.original.country,
           reason: d.reason
         }))
       })
     }

     return uniqueCities
   }

   /**
    * Clear authentication cache and tokens
    */
   clearAuthCache() {
     cache.delete('pollution_api_auth')
     this.authToken = null
     this.refreshToken = null
     this.tokenExpiry = null
     logger.info('Authentication cache cleared')
   }
}

module.exports = new PollutionApiService()
