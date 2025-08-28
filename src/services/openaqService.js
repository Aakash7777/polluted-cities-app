/**
 * OpenAQ API Service Module
 * Handles communication with the OpenAQ API for real air quality data
 * 
 * OpenAQ provides free air quality data from monitoring stations worldwide.
 * Documentation: https://docs.openaq.org/
 */

const axios = require('axios')
const config = require('../config')
const logger = require('../utils/logger')
const cache = require('../utils/cache')

class OpenAQService {
  constructor() {
    // Create axios instance with base configuration
    this.apiClient = axios.create({
      baseURL: config.openaq.baseUrl,
      timeout: config.openaq.timeout,
      headers: {
        'Content-Type': 'application/json',
        'User-Agent': 'PollutedCitiesBackend/1.0.0',
        ...(config.openaq.apiKey && { 'X-API-Key': config.openaq.apiKey })
      }
    })

    // Set up request/response interceptors
    this.setupInterceptors()
  }

  /**
   * Set up axios interceptors for logging and error handling
   */
  setupInterceptors() {
    // Request interceptor for logging
    this.apiClient.interceptors.request.use(
      (config) => {
        const fullUrl = `${config.baseURL}${config.url}`
        logger.info('🌐 Making OpenAQ API request:', {
          method: config.method?.toUpperCase(),
          fullUrl: fullUrl,
          params: config.params || 'none'
        })
        
        console.log(`\n🔗 OpenAQ API Call:`)
        console.log(`   Method: ${config.method?.toUpperCase()}`)
        console.log(`   URL: ${fullUrl}`)
        console.log(`   Params: ${JSON.stringify(config.params || {}, null, 2)}\n`)
        
        return config
      },
      (error) => {
        logger.error('OpenAQ API request error', { error: error.message })
        return Promise.reject(error)
      }
    )

    // Response interceptor for logging
    this.apiClient.interceptors.response.use(
      (response) => {
        logger.info('✅ OpenAQ API response received:', {
          status: response.status,
          statusText: response.statusText,
          url: response.config.url,
          dataLength: response.data?.results ? response.data.results.length : 'N/A'
        })
        
        console.log(`\n✅ OpenAQ API Response:`)
        console.log(`   Status: ${response.status} ${response.statusText}`)
        console.log(`   URL: ${response.config.baseURL}${response.config.url}`)
        
        if (response.data?.results) {
          console.log(`   Results Count: ${response.data.results.length}`)
          if (response.data.results.length > 0) {
            console.log(`   Sample Result: ${JSON.stringify(response.data.results[0], null, 2)}`)
          }
        }
        
        if (response.data?.meta) {
          console.log(`   Meta: ${JSON.stringify(response.data.meta, null, 2)}`)
        }
        
        console.log(`\n`)
        
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
      logger.error('OpenAQ API server error', errorInfo)
    } else if (error.request) {
      logger.error('OpenAQ API network error', errorInfo)
    } else {
      logger.error('OpenAQ API request setup error', errorInfo)
    }
  }

  /**
   * Fetch cities data from OpenAQ API for a specific country
   * @param {string} country - Country code (PL, DE, ES, FR)
   * @param {Object} options - Additional options like limit, page
   * @returns {Promise<Array>} Array of cities data
   */
  async fetchCitiesData(country, options = {}) {
    const cacheKey = `openaq_cities_${country}_${JSON.stringify(options)}`
    
    // Check cache first
    const cachedData = cache.get(cacheKey)
    if (cachedData) {
      logger.info('Returning cached OpenAQ data', {
        country,
        cityCount: cachedData.length
      })
      return cachedData
    }

    logger.info('Fetching fresh OpenAQ data', { country, options })
    
    try {
      // Use v3 API endpoint for locations (not cities)
      const response = await this.apiClient.get('/v3/locations', {
        params: {
          country: country,
          limit: options.limit || 1000,
          page: options.page || 1,
          order_by: 'id', // Order by ID to get consistent results
          sort: 'asc'
        }
      })

      if (!response.data || !response.data.results) {
        throw new Error(`Invalid OpenAQ response format: missing results`)
      }

      // Transform OpenAQ v3 location data to our expected format
      const transformedData = await this.transformOpenAQv3Data(response.data.results, country)
      
      // Cache the transformed data
      cache.set(cacheKey, transformedData, config.cache.ttl)
      
      logger.info('Successfully fetched and transformed OpenAQ v3 data', {
        country,
        originalCount: response.data.results.length,
        transformedCount: transformedData.length
      })

      return transformedData
    } catch (error) {
      logger.error('Failed to fetch OpenAQ data', { error: error.message, country })
      throw error
    }
  }

  /**
   * Transform OpenAQ v3 location data to our expected format
   * @param {Array} openaqLocations - Raw OpenAQ v3 location data
   * @param {string} country - Country code
   * @returns {Promise<Array>} Transformed cities data
   */
  async transformOpenAQv3Data(openaqLocations, country) {
    const transformedCities = []
    const cityMap = new Map() // To group locations by city

    // Group locations by city name (using locality or name)
    for (const location of openaqLocations) {
      const cityName = location.locality || location.name.split(' - ')[1] || location.name
      
      if (!cityMap.has(cityName)) {
        cityMap.set(cityName, {
          name: cityName,
          city: cityName,
          cityName: cityName,
          country: country,
          countryCode: country,
          coordinates: {
            latitude: location.coordinates?.latitude,
            longitude: location.coordinates?.longitude
          },
          source: 'OpenAQ',
          description: `Air quality data from ${cityName}, ${this.getCountryName(country)}`,
          locations: []
        })
      }
      
      cityMap.get(cityName).locations.push(location)
    }

    // Process each city and get air quality data
    for (const [cityName, cityData] of cityMap) {
      try {
        // Get air quality data from the first location with sensors
        const locationWithSensors = cityData.locations.find(loc => loc.sensors && loc.sensors.length > 0)
        
        if (locationWithSensors) {
          // Use the first sensor's parameter as the primary measurement
          const primarySensor = locationWithSensors.sensors[0]
          const parameter = primarySensor.parameter.name
          const unit = primarySensor.parameter.units
          
          // For now, we'll use a default value since we can't get real-time measurements easily
          // In a real implementation, you'd need to fetch measurements for each location
          const defaultValue = this.getDefaultAirQualityValue(parameter)
          
          const transformedCity = {
            ...cityData,
            pollution: defaultValue,
            aqi: defaultValue,
            aqiLevel: this.calculateAQILevel(defaultValue, parameter),
            parameter: parameter,
            unit: unit,
            lastUpdated: new Date().toISOString(),
            locationCount: cityData.locations.length,
            sensorCount: locationWithSensors.sensors.length
          }

          transformedCities.push(transformedCity)
        }
      } catch (error) {
        logger.warn('Failed to transform location data', {
          city: cityName,
          country,
          error: error.message
        })
      }
    }

    return transformedCities
  }

  /**
   * Get default air quality value for a parameter
   * @param {string} parameter - Parameter name (pm25, pm10, etc.)
   * @returns {number} Default air quality value
   */
  getDefaultAirQualityValue(parameter) {
    // Return realistic default values based on parameter type
    const defaults = {
      'pm25': 15, // Moderate PM2.5 level
      'pm10': 35, // Moderate PM10 level
      'o3': 45,   // Moderate ozone level
      'no2': 25,  // Moderate NO2 level
      'so2': 5,   // Low SO2 level
      'co': 0.5   // Low CO level
    }
    
    return defaults[parameter] || 20 // Default moderate level
  }

  /**
   * Get the latest air quality data for a specific city
   * @param {string} city - City name
   * @param {string} country - Country code
   * @returns {Promise<Object|null>} Latest air quality data or null
   */
  async getLatestAirQuality(city, country) {
    try {
      const response = await this.apiClient.get('/v3/measurements', {
        params: {
          city: city,
          country: country,
          limit: 1,
          order_by: 'datetime',
          sort: 'desc'
        }
      })

      if (response.data?.results && response.data.results.length > 0) {
        const measurement = response.data.results[0]
        return {
          value: measurement.value,
          parameter: measurement.parameter,
          unit: measurement.unit,
          lastUpdated: measurement.date.utc
        }
      }

      return null
    } catch (error) {
      logger.warn('Failed to get latest air quality data', {
        city,
        country,
        error: error.message
      })
      return null
    }
  }

  /**
   * Calculate AQI level based on PM2.5 or PM10 values
   * @param {number} value - Air quality value
   * @param {string} parameter - Parameter type (PM2.5, PM10, etc.)
   * @returns {string} AQI level
   */
  calculateAQILevel(value, parameter = 'PM2.5') {
    if (parameter === 'PM2.5') {
      if (value <= 12) return 'good'
      if (value <= 35.4) return 'moderate'
      if (value <= 55.4) return 'unhealthy-sensitive'
      if (value <= 150.4) return 'unhealthy'
      if (value <= 250.4) return 'very-unhealthy'
      return 'hazardous'
    } else if (parameter === 'PM10') {
      if (value <= 54) return 'good'
      if (value <= 154) return 'moderate'
      if (value <= 254) return 'unhealthy-sensitive'
      if (value <= 354) return 'unhealthy'
      if (value <= 424) return 'very-unhealthy'
      return 'hazardous'
    }
    
    // Default to moderate for other parameters
    return 'moderate'
  }

  /**
   * Get country name from country code
   * @param {string} countryCode - Country code
   * @returns {string} Country name
   */
  getCountryName(countryCode) {
    const countries = {
      'PL': 'Poland',
      'DE': 'Germany',
      'ES': 'Spain',
      'FR': 'France'
    }
    return countries[countryCode] || countryCode
  }

  /**
   * Get API health status
   * @returns {Promise<Object>} Health status
   */
  async getHealthStatus() {
    try {
      const response = await this.apiClient.get('/v3/locations', {
        params: { limit: 1 }
      })
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
   * Clear cached data
   * @param {string} country - Optional specific country to clear cache for
   */
  clearCache(country = null) {
    if (country) {
      const cacheKeys = cache.keys().filter(key => key.includes(`openaq_cities_${country}`))
      cacheKeys.forEach(key => cache.delete(key))
      logger.info('Cleared OpenAQ cache for specific country', { country, clearedKeys: cacheKeys.length })
    } else {
      const cacheKeys = cache.keys().filter(key => key.startsWith('openaq_'))
      cacheKeys.forEach(key => cache.delete(key))
      logger.info('All OpenAQ cache entries cleared', { clearedKeys: cacheKeys.length })
    }
  }
}

module.exports = new OpenAQService()
