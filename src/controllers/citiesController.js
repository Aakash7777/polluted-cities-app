/**
 * Cities Controller Module
 * Main controller for handling cities endpoint requests
 * 
 * Orchestrates data fetching, validation, enrichment, and response formatting
 * for the polluted cities API endpoint.
 */

// const pollutionApiService = require('../services/pollutionApiService') // DEPRECATED - Using OpenAQ instead
const openaqService = require('../services/openaqService')
const wikipediaService = require('../services/wikipediaService')
const cityValidator = require('../utils/validation')
const databaseService = require('../services/databaseService')
const logger = require('../utils/logger')
const config = require('../config')

// Import fetch for Node.js (if not available globally)
const fetch = global.fetch || require('node-fetch')

class CitiesController {
  /**
   * Get polluted cities data with validation and enrichment
   * @param {Object} req - Express request object
   * @param {Object} res - Express response object
   */
  async getCities(req, res) {
    const startTime = Date.now()
    
    try {
      logger.info('Processing cities request', {
        userAgent: req.get('User-Agent'),
        ip: req.ip,
        query: req.query
      })

      // Step 1: Validate and parse query parameters
      const countries = this.parseAndValidateCountries(req.query.country)
      const pagination = this.parseAndValidatePagination(req.query.page, req.query.limit)
      const includeDescriptions = req.query.descriptions === 'true'
      
      // Step 2: Fetch filtered data from pollution API (validation already done in service)
      const pollutionResult = await this.fetchPollutionData(countries, pagination)
      const filteredCities = pollutionResult.cities
      const totalCount = pollutionResult.totalCount
      
      // Step 3: Enrich cities with Wikipedia descriptions if requested
      let enrichedCities = filteredCities
      if (includeDescriptions) {
        enrichedCities = await this.enrichCitiesWithDescriptions(filteredCities)
      }
      
      // Step 4: Format response
      const response = this.formatResponse(enrichedCities, countries, pagination, totalCount)
      
      const processingTime = Date.now() - startTime
      
      logger.info('Cities request completed successfully', {
        requestedCountry: countries[0],
        pagination,
        filteredCities: filteredCities.length,
        enrichedCities: enrichedCities.length,
        processingTime: `${processingTime}ms`
      })

      res.status(200).json(response)
      
    } catch (error) {
      const processingTime = Date.now() - startTime
      
      logger.error('Cities request failed', {
        error: error.message,
        stack: error.stack,
        processingTime: `${processingTime}ms`
      })

      // Return appropriate error response
      this.handleError(error, res)
    }
  }

  /**
   * Enhanced cities endpoint for React frontend (V2)
   * @param {Object} req - Express request object
   * @param {Object} res - Express response object
   */
  async getCitiesV2(req, res) {
    const startTime = Date.now()
    
    try {
      logger.info('Processing cities V2 request', {
        userAgent: req.get('User-Agent'),
        ip: req.ip,
        query: req.query
      })

      // Parse and validate query parameters
      const countries = this.parseAndValidateCountries(req.query.country)
      const pagination = this.parseAndValidatePagination(req.query.page, req.query.limit)
      const searchTerm = req.query.search ? req.query.search.trim() : null
      const includeBlocked = req.query.includeBlocked === 'true'
      
      // Fetch filtered data from our database
      const countryCode = countries[0]
      const dbResult = await this.getCitiesFromDatabase(countryCode, pagination, searchTerm)
      let filteredCities = dbResult.cities
      let totalCount = dbResult.totalCount
      
      // Store original count before filtering blocked cities
      const originalTotalCount = totalCount
      
      // Exclude blocked cities by default
      if (!includeBlocked) {
        filteredCities = await this.filterBlockedCities(filteredCities)
        // Keep original total count for pagination, but use filtered count for display
        // totalCount remains unchanged for pagination calculations
      }
      
      // Skip validation; only enrich with Wikipedia descriptions
      const enrichedCities = await this.enrichCitiesWithDescriptions(filteredCities)
      
      // Format response for React frontend
      const response = this.formatV2Response(enrichedCities, countries, pagination, totalCount, searchTerm)
      
      const processingTime = Date.now() - startTime
      
      logger.info('Cities V2 request completed successfully', {
        requestedCountry: countries[0],
        pagination,
        searchTerm,
        includeBlocked,
        filteredCities: filteredCities.length,
        enrichedCities: enrichedCities.length,
        processingTime: `${processingTime}ms`
      })

      res.status(200).json(response)
      
    } catch (error) {
      const processingTime = Date.now() - startTime
      
      logger.error('Cities V2 request failed', {
        error: error.message,
        stack: error.stack,
        processingTime: `${processingTime}ms`
      })

      this.handleError(error, res)
    }
  }





  /**
   * Mark a city as invalid
   * @param {Object} req - Express request object
   * @param {Object} res - Express response object
   */
  async markCityInvalid(req, res) {
    const startTime = Date.now()
    
    try {
      const cityName = decodeURIComponent(req.params.cityName)
      const { countryCode, reason } = req.body
      
      logger.info('Processing mark city invalid request', {
        cityName,
        countryCode,
        reason,
        userAgent: req.get('User-Agent'),
        ip: req.ip
      })

      // Validate required fields
      if (!countryCode) {
        throw new Error('Country code is required')
      }

      // Validate country code
      const available = this.getAvailableCountriesFromDatabase().map(c => c.code.toUpperCase())
      const normalizedCode = String(countryCode || '').toUpperCase()
      if (!available.includes(normalizedCode)) {
        throw new Error(`Unsupported country code: ${normalizedCode}`)
      }

      // Mark city as invalid in database
      const result = databaseService.markCityInvalid(cityName, normalizedCode)
      
      const response = {
        success: true,
        data: {
          cityName,
          countryCode,
          invalidCount: result.invalidCount,
          isBlocked: result.isBlocked,
          message: result.isBlocked 
            ? 'City has been blocked due to multiple invalid reports' 
            : 'City marked as invalid'
        },
        metadata: {
          timestamp: new Date().toISOString()
        }
      }
      
      const processingTime = Date.now() - startTime
      
      logger.info('Mark city invalid request completed successfully', {
        cityName,
        countryCode,
        invalidCount: result.invalidCount,
        isBlocked: result.isBlocked,
        processingTime: `${processingTime}ms`
      })

      res.status(200).json(response)
      
    } catch (error) {
      const processingTime = Date.now() - startTime
      
      logger.error('Mark city invalid request failed', {
        error: error.message,
        stack: error.stack,
        processingTime: `${processingTime}ms`
      })

      this.handleError(error, res)
    }
  }

  /**
   * Get list of invalid/blocked cities
   * @param {Object} req - Express request object
   * @param {Object} res - Express response object
   */
  async getInvalidCities(req, res) {
    const startTime = Date.now()
    
    try {
      const blockedOnly = req.query.blocked !== 'false' // Default to true
      const countryFilter = req.query.country
      
      logger.info('Processing get invalid cities request', {
        blockedOnly,
        countryFilter,
        userAgent: req.get('User-Agent'),
        ip: req.ip
      })

      // Get invalid cities from database
      let invalidCities = databaseService.getBlockedCities()
      
      // Apply country filter if provided
      if (countryFilter) {
        const availableCountries = this.getAvailableCountriesFromDatabase()
        const countryExists = availableCountries.some(c => c.code === countryFilter)
        if (!countryExists) {
          const availableCodes = availableCountries.map(c => c.code).join(', ')
          throw new Error(`Unsupported country code: ${countryFilter}. Available codes: ${availableCodes}`)
        }
        invalidCities = invalidCities.filter(city => city.countryCode === countryFilter)
      }
      
      // Filter by blocked status if requested
      if (blockedOnly) {
        invalidCities = invalidCities.filter(city => city.invalidCount >= 3)
      }
      
      const blockedCount = invalidCities.filter(city => city.invalidCount >= 3).length
      
      const response = {
        success: true,
        data: {
          cities: invalidCities,
          total: invalidCities.length,
          blockedCount
        },
        metadata: {
          timestamp: new Date().toISOString(),
          filters: {
            blockedOnly,
            country: countryFilter
          }
        }
      }
      
      const processingTime = Date.now() - startTime
      
      logger.info('Get invalid cities request completed successfully', {
        totalCities: invalidCities.length,
        blockedCount,
        processingTime: `${processingTime}ms`
      })

      res.status(200).json(response)
      
    } catch (error) {
      const processingTime = Date.now() - startTime
      
      logger.error('Get invalid cities request failed', {
        error: error.message,
        stack: error.stack,
        processingTime: `${processingTime}ms`
      })

      this.handleError(error, res)
    }
  }

  /**
   * Remove city from invalid list (admin function)
   * @param {Object} req - Express request object
   * @param {Object} res - Express response object
   */
  async removeInvalidCity(req, res) {
    const startTime = Date.now()
    
    try {
      const cityName = decodeURIComponent(req.params.cityName)
      const { countryCode } = req.body
      
      logger.info('Processing remove invalid city request', {
        cityName,
        countryCode,
        userAgent: req.get('User-Agent'),
        ip: req.ip
      })

      // Validate required fields
      if (!countryCode) {
        throw new Error('Country code is required')
      }

      // Validate country code
      const availableCountries = this.getAvailableCountriesFromDatabase()
      const countryExists = availableCountries.some(c => c.code === countryCode)
      if (!countryExists) {
        const availableCodes = availableCountries.map(c => c.code).join(', ')
        throw new Error(`Unsupported country code: ${countryCode}. Available codes: ${availableCodes}`)
      }

      // Remove city from invalid list
      const result = databaseService.removeInvalidCity(cityName, countryCode)
      
      const response = {
        success: result.success,
        data: {
          cityName,
          countryCode,
          message: result.message,
          changes: result.changes
        },
        metadata: {
          timestamp: new Date().toISOString()
        }
      }
      
      const processingTime = Date.now() - startTime
      
      logger.info('Remove invalid city request completed successfully', {
        cityName,
        countryCode,
        processingTime: `${processingTime}ms`
      })

      res.status(200).json(response)
      
    } catch (error) {
      const processingTime = Date.now() - startTime
      
      logger.error('Remove invalid city request failed', {
        error: error.message,
        stack: error.stack,
        processingTime: `${processingTime}ms`
      })

      this.handleError(error, res)
    }
  }

  /**
   * Get application statistics
   * @param {Object} req - Express request object
   * @param {Object} res - Express response object
   */
  async getStats(req, res) {
    const startTime = Date.now()
    
    try {
      logger.info('Processing get stats request', {
        userAgent: req.get('User-Agent'),
        ip: req.ip
      })

      // Get database statistics
      const dbStats = databaseService.getStats()
      
      // Get cache statistics
      const cache = require('../utils/cache')
      const cacheStats = cache.getStats()
      
      const response = {
        success: true,
        data: {
          database: dbStats,
          cache: {
            hitRate: cacheStats.hits / (cacheStats.hits + cacheStats.misses) || 0,
            totalKeys: cacheStats.keys
          },
          api: {
            totalRequests: 0, // Would need to implement request tracking
            averageResponseTime: 0
          }
        },
        metadata: {
          timestamp: new Date().toISOString()
        }
      }
      
      const processingTime = Date.now() - startTime
      
      logger.info('Get stats request completed successfully', {
        processingTime: `${processingTime}ms`
      })

      res.status(200).json(response)
      
    } catch (error) {
      const processingTime = Date.now() - startTime
      
      logger.error('Get stats request failed', {
        error: error.message,
        stack: error.stack,
        processingTime: `${processingTime}ms`
      })

      this.handleError(error, res)
    }
  }

  /**
   * Get all available countries
   * @param {Object} req - Express request object
   * @param {Object} res - Express response object
   */
  async getCountries(req, res) {
    const startTime = Date.now()
    
    try {
      logger.info('Processing get countries request', {
        userAgent: req.get('User-Agent'),
        ip: req.ip
      })

      // Ensure database is initialized
      if (!databaseService.initialized) {
        databaseService.initialize()
      }

      // Try to get countries from database first
      let countries = await this.getCountriesFromDatabase()
      
      // If no countries in database, use fallback list
      if (!countries || countries.length === 0) {
        logger.info('No countries in database, using fallback list')
        countries = this.getFallbackCountries()
      }

      // Sort countries alphabetically by name for frontend
      countries = countries.sort((a, b) => {
        const nameA = (a.name || '').toLowerCase()
        const nameB = (b.name || '').toLowerCase()
        if (nameA < nameB) return -1
        if (nameA > nameB) return 1
        return 0
      })

      const response = {
        success: true,
        data: {
          countries: countries,
          total: countries.length
        },
        metadata: {
          timestamp: new Date().toISOString(),
          version: '1.0.0'
        }
      }

      const processingTime = Date.now() - startTime
      
      logger.info('Get countries request completed successfully', {
        countryCount: countries.length,
        processingTime: `${processingTime}ms`
      })

      res.status(200).json(response)
      
    } catch (error) {
      const processingTime = Date.now() - startTime
      
      logger.error('Get countries request failed', {
        error: error.message,
        stack: error.stack,
        processingTime: `${processingTime}ms`
      })

      this.handleError(error, res)
    }
  }

  /**
   * Get countries from database with caching
   */
  async getCountriesFromDatabase() {
    try {
      // Get cache instance
      const cache = require('../utils/cache')
      
      // Create cache key for countries list
      const cacheKey = 'countries_list'
      
      // Try to get from cache first
      let countries = cache.get(cacheKey)
      
      if (countries) {
        logger.debug('Countries list cache hit')
        return countries
      }
      
      logger.debug('Countries list cache miss, querying database')
      
      countries = databaseService.db.prepare(`
        SELECT 
          country_code as code,
          country as name,
          country_id as id,
          COUNT(*) as location_count,
          COUNT(DISTINCT city) as city_count
        FROM locations
        GROUP BY country, country_code, country_id
        ORDER BY location_count DESC, country ASC
      `).all()
      
      // Cache the result for 30 minutes (1800 seconds)
      cache.set(cacheKey, countries, 1800)
      
      return countries
    } catch (error) {
      logger.warn('Failed to get countries from database:', error.message)
      return []
    }
  }

  /**
   * Get cities from database with pagination and filtering
   */
  async getCitiesFromDatabase(countryCode, pagination, searchTerm = null) {
    try {
      const { page = 1, limit = 10 } = pagination
      // Increase limit to get more cities for validation, then paginate after validation
      const fetchLimit = Math.max(limit * 5, 100) // Fetch 5x more or at least 100
      const offset = (page - 1) * limit
      
      // Get cache instance
      const cache = require('../utils/cache')
      
      // Create cache key for database query
      const cacheKey = `db_cities:${countryCode}:${page}:${limit}:${searchTerm || 'no_search'}`
      
      // Try to get from cache first (cache for 5 minutes)
      let cachedResult = cache.get(cacheKey)
      
      if (cachedResult) {
        logger.debug('Database cities cache hit', { countryCode, page, limit, searchTerm })
        return cachedResult
      }
      
      logger.debug('Database cities cache miss, querying database', { countryCode, page, limit, searchTerm })
      
      let query = `
        SELECT DISTINCT
          city,
          country,
          country_code,
          latitude,
          longitude,
          sensors,
          timezone
        FROM locations
        WHERE country_code = ?
          AND city IS NOT NULL
          AND TRIM(city) != ''
          AND LENGTH(TRIM(city)) >= 2
          AND city GLOB '*[A-Za-z]*'
      `
      
      const params = [countryCode]
      
      // Add search filter if provided
      if (searchTerm) {
        query += ` AND (city LIKE ? OR country LIKE ?)`
        params.push(`%${searchTerm}%`, `%${searchTerm}%`)
      }
      
      query += ` ORDER BY city ASC LIMIT ? OFFSET ?`
      params.push(fetchLimit, offset)
      
      const cities = databaseService.db.prepare(query).all(...params)
      
      // Get total count for pagination
      let countQuery = `
        SELECT COUNT(DISTINCT city) as total
        FROM locations
        WHERE country_code = ?
          AND city IS NOT NULL
          AND TRIM(city) != ''
          AND LENGTH(TRIM(city)) >= 2
          AND city GLOB '*[A-Za-z]*'
      `
      
      const countParams = [countryCode]
      
      if (searchTerm) {
        countQuery += ` AND (city LIKE ? OR country LIKE ?)`
        countParams.push(`%${searchTerm}%`, `%${searchTerm}%`)
      }
      
      const countResult = databaseService.db.prepare(countQuery).get(...countParams)
      const totalCount = countResult ? countResult.total : 0
      
      // Transform cities to match expected format
      const transformedCities = cities.map(city => {
        // Parse sensors JSON
        let sensors = []
        try {
          sensors = JSON.parse(city.sensors || '[]')
        } catch (e) {
          sensors = []
        }
        
        // Calculate mock AQI based on sensors (for demonstration)
        let aqi = 50 // Default moderate
        if (sensors.length > 0) {
          // Simple mock calculation based on number of sensors
          aqi = Math.min(300, 50 + (sensors.length * 25))
        }
        
                 return {
           name: city.city,
           city: city.city,
           cityName: city.city,
           country: city.country,
           countryCode: city.country_code,
           lat: city.latitude || 0,
           lon: city.longitude || 0,
           pollution: aqi,
           aqi: aqi,
           aqiLevel: this.getAQILevel(aqi),
           parameters: sensors,
           lastUpdated: new Date().toISOString(),
           source: 'OpenAQ Database',
           // Add fields needed for validation
           airQualityIndex: aqi,
           description: null // Will be populated by Wikipedia enrichment
         }
      })
      
      // Apply pagination after transformation
      const paginatedCities = transformedCities.slice(0, limit)
      
      const result = {
        cities: paginatedCities,
        totalCount: totalCount
      }
      
      // Cache the result for 5 minutes (300 seconds)
      cache.set(cacheKey, result, 300)
      
      return result
    } catch (error) {
      logger.error('Failed to get cities from database:', error.message)
      return { cities: [], totalCount: 0 }
    }
  }

  /**
   * Get fallback countries list
   */
  getFallbackCountries() {
    return [
      { code: 'US', name: 'United States' },
      { code: 'PL', name: 'Poland' },
      { code: 'DE', name: 'Germany' },
      { code: 'ES', name: 'Spain' },
      { code: 'FR', name: 'France' },
      { code: 'GB', name: 'United Kingdom' },
      { code: 'IT', name: 'Italy' },
      { code: 'NL', name: 'Netherlands' },
      { code: 'BE', name: 'Belgium' },
      { code: 'CH', name: 'Switzerland' },
      { code: 'AT', name: 'Austria' },
      { code: 'SE', name: 'Sweden' },
      { code: 'NO', name: 'Norway' },
      { code: 'DK', name: 'Denmark' },
      { code: 'FI', name: 'Finland' },
      { code: 'CA', name: 'Canada' },
      { code: 'AU', name: 'Australia' },
      { code: 'JP', name: 'Japan' },
      { code: 'KR', name: 'South Korea' },
      { code: 'CN', name: 'China' },
      { code: 'IN', name: 'India' },
      { code: 'BR', name: 'Brazil' },
      { code: 'MX', name: 'Mexico' },
      { code: 'AR', name: 'Argentina' },
      { code: 'CL', name: 'Chile' },
      { code: 'CO', name: 'Colombia' },
      { code: 'PE', name: 'Peru' },
      { code: 'ZA', name: 'South Africa' },
      { code: 'EG', name: 'Egypt' },
      { code: 'NG', name: 'Nigeria' },
      { code: 'KE', name: 'Kenya' },
      { code: 'MA', name: 'Morocco' },
      { code: 'TH', name: 'Thailand' },
      { code: 'VN', name: 'Vietnam' },
      { code: 'MY', name: 'Malaysia' },
      { code: 'SG', name: 'Singapore' },
      { code: 'ID', name: 'Indonesia' },
      { code: 'PH', name: 'Philippines' },
      { code: 'TR', name: 'Turkey' },
      { code: 'IL', name: 'Israel' },
      { code: 'AE', name: 'United Arab Emirates' },
      { code: 'SA', name: 'Saudi Arabia' },
      { code: 'QA', name: 'Qatar' },
      { code: 'KW', name: 'Kuwait' },
      { code: 'BH', name: 'Bahrain' },
      { code: 'OM', name: 'Oman' },
      { code: 'JO', name: 'Jordan' },
      { code: 'LB', name: 'Lebanon' },
      { code: 'CY', name: 'Cyprus' },
      { code: 'MT', name: 'Malta' },
      { code: 'IS', name: 'Iceland' },
      { code: 'IE', name: 'Ireland' },
      { code: 'PT', name: 'Portugal' },
      { code: 'GR', name: 'Greece' },
      { code: 'HR', name: 'Croatia' },
      { code: 'SI', name: 'Slovenia' },
      { code: 'SK', name: 'Slovakia' },
      { code: 'CZ', name: 'Czech Republic' },
      { code: 'HU', name: 'Hungary' },
      { code: 'RO', name: 'Romania' },
      { code: 'BG', name: 'Bulgaria' },
      { code: 'RS', name: 'Serbia' },
      { code: 'BA', name: 'Bosnia and Herzegovina' },
      { code: 'ME', name: 'Montenegro' },
      { code: 'MK', name: 'North Macedonia' },
      { code: 'AL', name: 'Albania' },
      { code: 'EE', name: 'Estonia' },
      { code: 'LV', name: 'Latvia' },
      { code: 'LT', name: 'Lithuania' },
      { code: 'LU', name: 'Luxembourg' },
      { code: 'MC', name: 'Monaco' },
      { code: 'LI', name: 'Liechtenstein' },
      { code: 'AD', name: 'Andorra' },
      { code: 'SM', name: 'San Marino' },
      { code: 'VA', name: 'Vatican City' }
    ]
  }

  /**
   * Parse and validate country code from query parameter
   * @param {string} countryParam - Single country code
   * @returns {Array<string>} Array with single valid country code
   */
  parseAndValidateCountries(countryParam) {
    // Get available countries from database
    const availableCountries = this.getAvailableCountriesFromDatabase()
    
    // If no country specified, default to first available country
    if (!countryParam) {
      const defaultCountry = availableCountries.length > 0 ? availableCountries[0].code : 'GH'
      logger.info('No country specified, defaulting to first available country', {
        defaultCountry: defaultCountry
      })
      return [defaultCountry]
    }

    // Parse and validate single country code
    const country = countryParam.trim().toUpperCase()

    // Check if the requested country exists in our database
    const countryExists = availableCountries.some(c => c.code === country)
    if (!countryExists) {
      const availableCodes = availableCountries.map(c => c.code).join(', ')
      throw new Error(`Unsupported country code: ${country}. Available codes: ${availableCodes}`)
    }

    logger.info('Validated country code', {
      requested: countryParam,
      validated: country
    })

    return [country]
  }

  /**
   * Get available countries from database with caching
   */
  getAvailableCountriesFromDatabase() {
    try {
      // Get cache instance
      const cache = require('../utils/cache')
      
      // Create cache key for available countries
      const cacheKey = 'available_countries'
      
      // Try to get from cache first
      let countries = cache.get(cacheKey)
      
      if (countries) {
        logger.debug('Available countries cache hit')
        return countries
      }
      
      logger.debug('Available countries cache miss, querying database')
      
      if (!databaseService.initialized) {
        databaseService.initialize()
      }
      
      countries = databaseService.db.prepare(`
        SELECT DISTINCT country_code as code, country as name
        FROM locations
        ORDER BY country ASC
      `).all()
      
      // Cache the result for 30 minutes (1800 seconds)
      cache.set(cacheKey, countries, 1800)
      
      return countries
    } catch (error) {
      logger.warn('Failed to get available countries from database, using fallback', { error: error.message })
      return [
        { code: 'GH', name: 'Ghana' },
        { code: 'IN', name: 'India' },
        { code: 'AR', name: 'Argentina' },
        { code: 'VN', name: 'Vietnam' },
        { code: 'MN', name: 'Mongolia' },
        { code: 'CN', name: 'China' },
        { code: 'BD', name: 'Bangladesh' },
        { code: 'SG', name: 'Singapore' },
        { code: 'CL', name: 'Chile' },
        { code: 'PL', name: 'Poland' }
      ]
    }
  }

  /**
   * Parse and validate pagination parameters
   * @param {string} pageParam - Page number
   * @param {string} limitParam - Items per page
   * @returns {Object} Pagination object with page and limit
   */
  parseAndValidatePagination(pageParam, limitParam) {
    // Defaults
    let page = 1
    let limit = 10 // Default to 10 items per page to align with frontend

    // Parse page parameter
    if (pageParam) {
      const parsedPage = parseInt(pageParam, 10)
      if (isNaN(parsedPage) || parsedPage < 1) {
        throw new Error('Page parameter must be a positive integer')
      }
      page = parsedPage
    }

    // Parse limit parameter (allow 1..50)
    if (limitParam !== undefined) {
      const parsedLimit = parseInt(limitParam, 10)
      if (isNaN(parsedLimit) || parsedLimit < 1) {
        throw new Error('Limit parameter must be a positive integer')
      }
      // Cap to avoid excessive payloads
      limit = Math.min(parsedLimit, 50)
    }

    logger.info('Validated pagination parameters', {
      page,
      limit
    })

    return { page, limit }
  }

  /**
   * Fetch pollution data from external API (OpenAQ or legacy mock API)
   * @param {Array<string>} countries - Array of country codes to fetch
   * @param {Object} pagination - Pagination parameters
   * @returns {Promise<Object>} Object with cities data and total count
   */
  async fetchPollutionData(countries, pagination) {
    try {
      // First, try to get data from OpenAQ AWS S3 database
      const openaqData = await this.fetchOpenAQData(countries, pagination)
      if (openaqData && openaqData.cities.length > 0) {
        logger.info('Using OpenAQ AWS S3 data for real air quality data')
        return openaqData
      }
      
      // Use OpenAQ API if enabled, otherwise fall back to legacy mock API
      if (config.openaq.enabled) {
        logger.info('Using OpenAQ API for real air quality data')
        const country = countries[0] // OpenAQ service expects single country
        const result = await openaqService.fetchCitiesData(country, pagination)
        
        // Transform OpenAQ data to match expected format
        const transformedCities = result.map(city => ({
          ...city,
          // Ensure all required fields are present
          name: city.name || city.city,
          city: city.city || city.name,
          cityName: city.cityName || city.name || city.city,
          pollution: city.pollution || city.aqi,
          aqi: city.aqi || city.pollution,
          aqiLevel: city.aqiLevel || 'moderate'
        }))

        logger.info('Successfully fetched OpenAQ pollution data', {
          cityCount: transformedCities.length,
          country: country,
          pagination,
          source: 'OpenAQ'
        })

        return { cities: transformedCities, totalCount: transformedCities.length }
      } else {
        logger.info('Pollution API disabled, using OpenAQ as fallback')
        const result = await openaqService.fetchCitiesData(countries[0], pagination)
        
        // Transform OpenAQ data to expected format
        const transformedCities = result.map(city => ({
          name: city.name,
          city: city.name,
          cityName: city.name,
          country: city.country,
          countryCode: city.countryCode,
          pollution: city.aqi || 0,
          aqiLevel: city.aqiLevel || 'moderate',
          description: city.description || `Air quality data for ${city.name}`,
          coordinates: city.coordinates || { latitude: 0, longitude: 0 }
        }))

        logger.info('Successfully fetched filtered pollution data', {
          cityCount: transformedCities.length,
          totalCount: transformedCities.length,
          country: countries[0],
          pagination,
          source: 'OpenAQ API'
        })

        return { cities: transformedCities, totalCount: transformedCities.length }
      }
    } catch (error) {
      logger.error('Failed to fetch pollution data', { error: error.message })
      throw new Error(`Failed to fetch pollution data: ${error.message}`)
    }
  }

  /**
   * Fetch data from OpenAQ AWS S3 database
   * @param {Array} countries - Array of country codes
   * @param {Object} pagination - Pagination parameters
   * @returns {Promise<Object|null>} Object with cities data and total count, or null if no data
   */
  async fetchOpenAQData(countries, pagination) {
    try {
      // Ensure database is initialized
      if (!databaseService.initialized) {
        databaseService.initialize()
      }

      const country = countries[0]
      const { page = 1, limit = 10 } = pagination
      const offset = (page - 1) * limit

      // Get all cities first, then apply pagination
      const citiesQuery = `
        SELECT DISTINCT
          city,
          country,
          locationId,
          parameter,
          value,
          unit,
          date,
          source
        FROM openaq_measurements
        WHERE country = ?
        ORDER BY city, date DESC
      `

      const allCities = databaseService.db.prepare(citiesQuery).all(country)
      
      // Get unique city names and apply pagination
      const uniqueCities = [...new Set(allCities.map(record => record.city))]
      const paginatedCities = uniqueCities.slice(offset, offset + limit)
      
      // Filter records for paginated cities
      const cities = allCities.filter(record => paginatedCities.includes(record.city))

      if (!cities || cities.length === 0) {
        logger.info('No OpenAQ AWS S3 data found for country', { country })
        return null
      }

      // Group by city and get latest measurements for each parameter
      const cityMap = new Map()
      
      for (const record of cities) {
        const cityKey = record.city
                 if (!cityMap.has(cityKey)) {
           cityMap.set(cityKey, {
             name: record.city,
             city: record.city,
             cityName: record.city,
             country: record.country,
             countryCode: record.country,
             lat: 0, // Default value since lat/lon not in table
             lon: 0, // Default value since lat/lon not in table
             pollution: 0,
             aqi: 0,
             aqiLevel: 'moderate',
             parameters: {},
             lastUpdated: record.date,
             source: record.source
           })
         }

        const city = cityMap.get(cityKey)
        city.parameters[record.parameter] = {
          value: parseFloat(record.value),
          unit: record.unit,
          date: record.date
        }

        // Calculate AQI based on PM10 or PM2.5 (simplified calculation)
        if (record.parameter === 'pm10') {
          const pm10Value = parseFloat(record.value)
          city.pollution = pm10Value
          city.aqi = pm10Value
          city.aqiLevel = this.calculateAQILevel(pm10Value, 'pm10')
        } else if (record.parameter === 'pm2_5') {
          const pm25Value = parseFloat(record.value)
          if (!city.pollution || city.pollution === 0) {
            city.pollution = pm25Value * 2.5 // Rough conversion to PM10 equivalent
            city.aqi = pm25Value * 2.5
            city.aqiLevel = this.calculateAQILevel(pm25Value, 'pm2_5')
          }
        }
      }

      const transformedCities = Array.from(cityMap.values())

      // Get total count for pagination
      const countQuery = `
        SELECT COUNT(DISTINCT city) as total
        FROM openaq_measurements
        WHERE country = ?
      `
      const countResult = databaseService.db.prepare(countQuery).get(country)
      const totalCount = countResult ? countResult.total : 0

      logger.info('Successfully fetched OpenAQ AWS S3 data', {
        cityCount: transformedCities.length,
        totalCount,
        country,
        pagination,
        source: 'OpenAQ AWS S3'
      })

      return { cities: transformedCities, totalCount }

    } catch (error) {
      logger.error('Failed to fetch OpenAQ AWS S3 data', { error: error.message })
      return null // Return null to fall back to other data sources
    }
  }

  /**
   * Calculate AQI level based on pollutant value
   * @param {number} value - Pollutant value
   * @param {string} parameter - Parameter type (pm10, pm2_5, etc.)
   * @returns {string} AQI level
   */
  calculateAQILevel(value, parameter) {
    if (parameter === 'pm10') {
      if (value <= 50) return 'good'
      if (value <= 100) return 'moderate'
      if (value <= 150) return 'unhealthy_sensitive'
      if (value <= 200) return 'unhealthy'
      if (value <= 300) return 'very_unhealthy'
      return 'hazardous'
    } else if (parameter === 'pm2_5') {
      if (value <= 12) return 'good'
      if (value <= 35.4) return 'moderate'
      if (value <= 55.4) return 'unhealthy_sensitive'
      if (value <= 150.4) return 'unhealthy'
      if (value <= 250.4) return 'very_unhealthy'
      return 'hazardous'
    }
    return 'moderate'
  }

  /**
   * Validate and filter cities data with caching
   * @param {Array} rawCitiesData - Raw cities data from API
   * @returns {Promise<Array>} Valid cities data
   */
  async validateAndFilterCities(rawCitiesData) {
    try {
      // Pre-filter: Remove obviously invalid city names (numeric codes, etc.)
      const preFilteredCities = rawCitiesData.filter(cityData => {
        const cityName = cityData.city || cityData.name || cityData.cityName || ''
        
        // Skip if city name is empty or null
        if (!cityName || cityName.trim() === '') {
          return false
        }
        
        // Skip if city name is purely numeric (like "007", "009", etc.)
        if (/^\d+$/.test(cityName.trim())) {
          logger.info('Filtering out numeric city name', { cityName })
          return false
        }
        
        // Skip if city name is too short (less than 2 characters)
        if (cityName.trim().length < 2) {
          logger.info('Filtering out too short city name', { cityName })
          return false
        }
        
        // Skip if city name contains only special characters
        if (/^[^a-zA-Z0-9\s]+$/.test(cityName.trim())) {
          logger.info('Filtering out special character only city name', { cityName })
          return false
        }
        
        return true
      })
      
      logger.info('Pre-filtering completed', {
        original: rawCitiesData.length,
        preFiltered: preFilteredCities.length,
        removed: rawCitiesData.length - preFilteredCities.length
      })

      // Get cache instance
      const cache = require('../utils/cache')
      const validCities = []
      const validationStats = await cityValidator.getValidationStats(preFilteredCities)
      let cacheHits = 0
      let cacheMisses = 0

      logger.info('City validation statistics', validationStats)

      for (const cityData of preFilteredCities) {
        const cityName = cityData.city || cityData.name || cityData.cityName || ''
        const countryCode = cityData.country || cityData.countryCode || ''
        
        // Create cache key for this city validation
        const cacheKey = `city_validation:${cityName.toLowerCase()}:${countryCode.toLowerCase()}`
        
        // Try to get from cache first
        let validationResult = cache.get(cacheKey)
        
        if (validationResult) {
          // Cache hit - use cached validation result
          cacheHits++
          logger.debug('City validation cache hit', { cityName, countryCode })
        } else {
          // Cache miss - validate with Google Places API
          cacheMisses++
          validationResult = await cityValidator.isValidCity(cityData)
          
          // Cache the result for 24 hours (86400 seconds)
          cache.set(cacheKey, validationResult, 86400)
          logger.debug('City validation cache miss, stored result', { cityName, countryCode })
        }
        
        if (validationResult.isValid) {
          // Use the corrected city name from Google Places API
          const correctedCityData = {
            ...cityData,
            city: validationResult.correctedName || cityData.city || cityData.name,
            name: validationResult.correctedName || cityData.name || cityData.city,
            cityName: validationResult.correctedName || cityData.cityName || cityData.city || cityData.name,
            correctedName: validationResult.correctedName // Store the corrected name for later use
          }
          // Normalize city data
          const normalizedCity = this.normalizeCityData(correctedCityData)
          validCities.push(normalizedCity)
        }
      }

      logger.info('City validation completed with caching', {
        total: preFilteredCities.length,
        valid: validCities.length,
        invalid: preFilteredCities.length - validCities.length,
        cacheHits,
        cacheMisses,
        cacheHitRate: cacheHits / (cacheHits + cacheMisses) || 0
      })

      // Remove duplicates after validation
      const uniqueCities = this.removeDuplicateCities(validCities)
      
      logger.info('Duplicate removal completed in controller', {
        beforeDeduplication: validCities.length,
        afterDeduplication: uniqueCities.length,
        duplicatesRemoved: validCities.length - uniqueCities.length
      })

      return uniqueCities
    } catch (error) {
      logger.error('City validation failed', { error: error.message })
      throw new Error(`City validation failed: ${error.message}`)
    }
  }

  /**
   * Normalize city data for consistent processing
   * @param {Object} cityData - Raw city data
   * @returns {Object} Normalized city data
   */
  normalizeCityData(cityData) {
    // Use the validation utility's normalization method
    const normalized = cityValidator.normalizeCityData(cityData)
    
    return {
      ...normalized,
      aqi: Math.round(normalized.aqi), // Round AQI to nearest integer
      timestamp: new Date().toISOString()
    }
  }

  /**
   * Enrich cities with Wikipedia descriptions with caching
   * @param {Array} validCities - Valid cities data
   * @returns {Promise<Array>} Enriched cities data
   */
  async enrichCitiesWithDescriptions(validCities) {
    try {
      const enrichedCities = []
      let successCount = 0
      let failureCount = 0
      let cacheHits = 0
      let cacheMisses = 0

      // Get cache instance
      const cache = require('../utils/cache')

      logger.info('Starting city enrichment process with caching', {
        cityCount: validCities.length
      })

      // Process cities in parallel with concurrency limit
      const concurrencyLimit = 5
      const chunks = this.chunkArray(validCities, concurrencyLimit)

      for (const chunk of chunks) {
                 const chunkPromises = chunk.map(async (city) => {
           try {
                   // Get city name from various possible field names
      const rawCityName = city.city || city.name || city.cityName || 'Unknown City'
      const countryCode = city.country || city.countryCode || ''
      
      // Use the corrected name from Google Places validation for Wikipedia search
      const cityValidator = require('../utils/validation')
      const correctedCityName = await cityValidator.getCorrectedCityName(rawCityName)
      
      // Create cache key for Wikipedia description
      const cacheKey = `wikipedia_description:${correctedCityName.toLowerCase()}:${countryCode.toLowerCase()}`
      
      // Try to get from cache first
      let description = cache.get(cacheKey)
      
      if (description) {
        // Cache hit - use cached description
        cacheHits++
        logger.debug('Wikipedia description cache hit', { cityName: correctedCityName, countryCode })
      } else {
        // Cache miss - fetch from Wikipedia API
        cacheMisses++
        description = await wikipediaService.getCityDescription(
          correctedCityName,
          city.country
        )
        
        // Cache the description for 7 days (604800 seconds)
        cache.set(cacheKey, description || 'No description available', 604800)
        logger.debug('Wikipedia description cache miss, stored result', { cityName: correctedCityName, countryCode })
      }

             const enrichedCity = {
               ...city,
               description: description || 'No description available'
             }

             successCount++
             return enrichedCity
                       } catch (error) {
              // Get city name from various possible field names
              const rawCityName = city.city || city.name || city.cityName || 'Unknown City'
              
              logger.warn('Failed to enrich city with description', {
                original: rawCityName,
                country: city.country,
                error: error.message
              })

             failureCount++
             return {
               ...city,
               description: 'No description available'
             }
           }
         })

        const chunkResults = await Promise.all(chunkPromises)
        enrichedCities.push(...chunkResults)

        // Small delay between chunks to be respectful to Wikipedia API
        if (chunks.indexOf(chunk) < chunks.length - 1) {
          await this.sleep(100)
        }
      }

      logger.info('City enrichment completed with caching', {
        total: validCities.length,
        success: successCount,
        failures: failureCount,
        cacheHits,
        cacheMisses,
        cacheHitRate: cacheHits / (cacheHits + cacheMisses) || 0
      })

      return enrichedCities
    } catch (error) {
      logger.error('City enrichment failed', { error: error.message })
      throw new Error(`City enrichment failed: ${error.message}`)
    }
  }

  /**
   * Split array into chunks for parallel processing
   * @param {Array} array - Array to chunk
   * @param {number} chunkSize - Size of each chunk
   * @returns {Array<Array>} Array of chunks
   */
  chunkArray(array, chunkSize) {
    const chunks = []
    for (let i = 0; i < array.length; i += chunkSize) {
      chunks.push(array.slice(i, i + chunkSize))
    }
    return chunks
  }

  /**
   * Format response for API endpoint
   * @param {Array} enrichedCities - Enriched cities data
   * @param {Array<string>} requestedCountries - Array with single country code
   * @param {Object} pagination - Pagination parameters
   * @param {number} totalCount - Total number of documents across all pages
   * @returns {Object} Formatted response
   */
  formatResponse(enrichedCities, requestedCountries, pagination, totalCount) {
         // Transform cities to match the required format
     const cities = enrichedCities.map(city => {
       // Handle different possible field names for city name and pollution data
       const rawCityName = city.city || city.name || city.cityName || 'Unknown City'
       const pollutionValue = city.aqi || city.pollution || city.airQualityIndex || 0
       const description = city.description || 'No description available'
       
       // Use the corrected name from Google Places validation (already applied during validation)
       const correctedCityName = city.correctedName || rawCityName
       
       return {
         name: correctedCityName,
         country: this.getCountryName(city.country),
         pollution: pollutionValue,
         description: description
       }
     })

    // With our new approach, pagination is handled on our side
    // The enrichedCities array already contains the correct page of data
    return {
      page: pagination.page,
      limit: pagination.limit,
      total: totalCount, // Total count from our pagination logic
      country: requestedCountries[0], // Single country code
      cities: cities
    }
  }

  /**
   * Filter cities by search term
   * @param {Array} cities - Array of cities
   * @param {string} searchTerm - Search term
   * @returns {Array} Filtered cities
   */
  filterCitiesBySearch(cities, searchTerm) {
    const lowerSearchTerm = searchTerm.toLowerCase()
    return cities.filter(city => {
      const cityName = city.city || city.name || city.cityName || ''
      const countryName = this.getCountryName(city.country)
      return cityName.toLowerCase().includes(lowerSearchTerm) || 
             countryName.toLowerCase().includes(lowerSearchTerm)
    })
  }

  /**
   * Filter out blocked cities
   * @param {Array} cities - Array of cities
   * @returns {Array} Filtered cities without blocked ones
   */
  async filterBlockedCities(cities) {
    const filteredCities = []
    
    for (const city of cities) {
      const cityName = city.city || city.name || city.cityName
      // Use countryCode if available, otherwise fall back to country
      const countryCode = city.countryCode || city.country
      
      if (!databaseService.isCityBlocked(cityName, countryCode)) {
        filteredCities.push(city)
      }
    }
    
    return filteredCities
  }

  /**
   * Format response for React frontend (V2)
   * @param {Array} enrichedCities - Enriched cities data
   * @param {Array<string>} requestedCountries - Array with single country code
   * @param {Object} pagination - Pagination parameters
   * @param {number} totalCount - Total number of documents
   * @param {string} searchTerm - Search term used
   * @returns {Object} Formatted response
   */
     formatV2Response(enrichedCities, requestedCountries, pagination, totalCount, searchTerm) {
     const cities = enrichedCities.map(city => {
       const rawCityName = city.city || city.name || city.cityName || 'Unknown City'
       const pollutionValue = city.aqi || city.pollution || city.airQualityIndex || 0
       const description = city.description || 'Description will be added soon'
       const correctedCityName = city.correctedName || rawCityName

      // Ensure we consistently expose ISO country code and human-readable name
      const code = city.countryCode || city.country
      const countryName = this.getCountryName(code)
      
      return {
        name: correctedCityName,
        country: countryName,
        countryCode: code,
        pollution: pollutionValue,
        description: description,
        aqiLevel: this.getAQILevel(pollutionValue),
        // Add additional fields for frontend
        lat: city.lat || 0,
        lon: city.lon || 0,
        parameters: city.parameters || [],
        lastUpdated: city.lastUpdated || new Date().toISOString(),
        source: city.source || 'OpenAQ Database'
      }
    })

    return {
      success: true,
      data: {
        cities,
        pagination: {
          page: pagination.page,
          limit: pagination.limit,
          total: totalCount,
          totalPages: Math.ceil(totalCount / pagination.limit)
        },
        filters: {
          country: requestedCountries[0],
          search: searchTerm
        }
      },
      metadata: {
        timestamp: new Date().toISOString(),
        version: '2.0.0'
      }
    }
  }

  /**
   * Get full country name from country code with caching
   * @param {string} countryCode - Country code
   * @returns {string} Full country name
   */
  getCountryName(countryCode) {
    try {
      // Get cache instance
      const cache = require('../utils/cache')
      
      // Create cache key for country name
      const cacheKey = `country_name:${countryCode.toLowerCase()}`
      
      // Try to get from cache first
      let countryName = cache.get(cacheKey)
      
      if (countryName) {
        return countryName
      }
      
      // Cache miss - query database
      if (!databaseService.initialized) {
        databaseService.initialize()
      }
      
      const result = databaseService.db.prepare(`
        SELECT country as name
        FROM locations
        WHERE country_code = ?
        LIMIT 1
      `).get(countryCode)
      
      countryName = result ? result.name : countryCode
      
      // Cache the result for 1 hour (3600 seconds)
      cache.set(cacheKey, countryName, 3600)
      
      return countryName
    } catch (error) {
      logger.warn('Failed to get country name from database, using code', { 
        countryCode, 
        error: error.message 
      })
      return countryCode
    }
  }

  /**
   * Get AQI level based on pollution value
   * @param {number} aqi - AQI value
   * @returns {string} AQI level
   */
  getAQILevel(aqi) {
    if (aqi <= 50) return 'good'
    if (aqi <= 100) return 'moderate'
    if (aqi <= 150) return 'unhealthy-sensitive'
    if (aqi <= 200) return 'unhealthy'
    if (aqi <= 300) return 'very-unhealthy'
    return 'hazardous'
  }


  /**
   * Handle errors and return appropriate HTTP response
   * @param {Error} error - Error object
   * @param {Object} res - Express response object
   */
  handleError(error, res) {
    let statusCode = 500
    let message = 'Internal server error'

    if (error.message.includes('Unsupported country code')) {
      statusCode = 400 // Bad Request
      message = error.message
    } else if (error.message.includes('Page parameter must be a positive integer') || 
               error.message.includes('Limit parameter must be a positive integer')) {
      statusCode = 400 // Bad Request
      message = error.message
    } else if (error.message.includes('Failed to fetch pollution data')) {
      statusCode = 503 // Service Unavailable
      message = 'Pollution data service is temporarily unavailable'
    } else if (error.message.includes('validation failed')) {
      statusCode = 422 // Unprocessable Entity
      message = 'Data validation failed'
    } else if (error.message.includes('enrichment failed')) {
      statusCode = 503 // Service Unavailable
      message = 'City enrichment service is temporarily unavailable'
    }

    res.status(statusCode).json({
      success: false,
      error: {
        message,
        code: statusCode
      },
      timestamp: new Date().toISOString()
    })
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
         } else {
           // Keep the existing city (higher pollution)
           duplicates.push({
             original: city,
             kept: existingCity,
             duplicateKey: uniqueKey,
             reason: 'Lower pollution value'
           })
         }
       } else {
         // This is a new city
         cityMap.set(uniqueKey, city)
       }
     }

     const uniqueCities = Array.from(cityMap.values())

     if (duplicates.length > 0) {
       logger.info('Duplicate cities processed in controller', {
         totalDuplicates: duplicates.length,
         keptCities: uniqueCities.length
       })
     }

     return uniqueCities
   }

   /**
    * Sleep utility for rate limiting
    * @param {number} ms - Milliseconds to sleep
    * @returns {Promise} Promise that resolves after delay
    */
   sleep(ms) {
     return new Promise(resolve => setTimeout(resolve, ms))
   }

  /**
   * Get city history data for the last 7 days
   * @param {Object} req - Express request object
   * @param {Object} res - Express response object
   */
  async getCityHistory(req, res) {
    const startTime = Date.now()
    
    try {
      const { cityName } = req.params
      
      logger.info('Processing city history request', {
        cityName,
        userAgent: req.get('User-Agent'),
        ip: req.ip
      })

      // Check if force refresh is requested
      const forceRefresh = req.query.refresh === 'true'
      
      // Check cache first (unless force refresh is requested)
      const cache = require('../utils/cache')
      const cacheKey = `city_history:${cityName.toLowerCase()}`
      const cachedData = cache.get(cacheKey)
      
      if (cachedData && !forceRefresh) {
        logger.info('City history cache hit', { cityName })
        const processingTime = Date.now() - startTime
        
        res.status(200).json({
          success: true,
          message: `History data retrieved for ${cityName} (cached)`,
          timestamp: new Date().toISOString(),
          data: cachedData,
          cached: true,
          processingTime: `${processingTime}ms`
        })
        return
      }
      
      if (forceRefresh) {
        logger.info('Force refresh requested, bypassing cache', { cityName })
        // Clear existing cache entry
        cache.del(cacheKey)
      }

      logger.info('City history cache miss, fetching from OpenAQ API', { cityName })

      // Step 1: Get location from database
      const location = await this.getLocationFromDatabase(cityName)
      if (!location) {
        return res.status(404).json({
          success: false,
          message: `City '${cityName}' not found in database`,
          timestamp: new Date().toISOString()
        })
      }

      // Step 2: Get sensors from OpenAQ API using location_id
      const sensors = await this.getSensorsFromOpenAQ(location.location_id)
      if (!sensors || sensors.length === 0) {
        return res.status(404).json({
          success: false,
          message: `No sensors found for city '${cityName}' (location_id: ${location.location_id})`,
          timestamp: new Date().toISOString()
        })
      }

      // Step 3: Calculate date range for last 7 days
      const dateRange = this.calculateLast7DaysRange()
      
      // Step 4: Fetch sensor data for each sensor
      const sensorData = await this.fetchSensorDataForHistory(sensors, dateRange)
      
      // Step 5: Aggregate and format data for frontend
      const aggregatedData = this.aggregateHistoryData(sensorData, location)
      
      // Cache the aggregated data for 1 hour (3600 seconds)
      cache.set(cacheKey, aggregatedData, 3600)
      logger.info('City history data cached', { cityName, cacheKey })
      
      const processingTime = Date.now() - startTime
      
      logger.info('City history request completed successfully', {
        cityName,
        locationId: location.location_id,
        sensorsCount: sensors.length,
        dataPoints: aggregatedData.dataPoints,
        processingTime: `${processingTime}ms`,
        cached: false
      })

      res.status(200).json({
        success: true,
        message: `History data retrieved for ${cityName}`,
        timestamp: new Date().toISOString(),
        data: aggregatedData,
        cached: false
      })
      
    } catch (error) {
      const processingTime = Date.now() - startTime
      
      logger.error('City history request failed', {
        cityName: req.params.cityName,
        error: error.message,
        stack: error.stack,
        processingTime: `${processingTime}ms`
      })

      this.handleError(error, res)
    }
  }

  /**
   * Get location from database by city name
   * @param {string} cityName - City name to search for
   * @returns {Object|null} Location object or null if not found
   */
  async getLocationFromDatabase(cityName) {
    try {
      // Ensure database is initialized
      if (!databaseService.initialized) {
        databaseService.initialize()
      }
      
      const location = databaseService.db.prepare(`
        SELECT * FROM locations 
        WHERE LOWER(city) = LOWER(?) 
          AND city IS NOT NULL 
          AND LENGTH(TRIM(city)) > 1
        LIMIT 1
      `).get(cityName)
      
      return location
    } catch (error) {
      logger.error('Error getting location from database', { cityName, error: error.message })
      throw error
    }
  }

  /**
   * Get sensors from OpenAQ API using location_id
   * @param {number} locationId - Location ID from database
   * @returns {Array} Array of sensor objects with id, name, and parameter info
   */
  async getSensorsFromOpenAQ(locationId) {
    try {
      const apiKey = config.openaq.apiKey
      const url = `https://api.openaq.org/v3/locations/${locationId}/sensors`
      
      console.log(`🔍 Fetching sensors for location ${locationId}...`)
      console.log(`URL: ${url}`)
      
      const response = await fetch(url, {
        headers: {
          'X-API-Key': apiKey,
          'Content-Type': 'application/json'
        }
      })
      
      console.log(`Response status: ${response.status} ${response.statusText}`)
      
      if (!response.ok) {
        logger.warn('OpenAQ API request failed for location sensors', {
          locationId,
          status: response.status,
          statusText: response.statusText
        })
        console.log(`❌ API request failed for location ${locationId}`)
        return []
      }
      
      const data = await response.json()
      
      console.log(`✅ API response for location ${locationId}:`)
      console.log('Meta:', JSON.stringify(data.meta, null, 2))
      console.log(`Results count: ${data.results ? data.results.length : 0}`)
      
      if (data.results && data.results.length > 0) {
        console.log('Sample sensor:', JSON.stringify(data.results[0], null, 2))
      }
      
      // Transform the sensors data to match our expected format
      const sensors = (data.results || []).map(sensor => ({
        id: sensor.id,
        name: sensor.name,
        units: sensor.parameter?.units || '',
        displayName: sensor.parameter?.displayName || sensor.parameter?.name || sensor.name,
        parameter: sensor.parameter
      }))
      
      console.log(`📡 Found ${sensors.length} sensors for location ${locationId}`)
      sensors.forEach((sensor, index) => {
        console.log(`Sensor ${index + 1}: ID=${sensor.id}, Name=${sensor.name}, Parameter=${sensor.displayName}`)
      })
      
      return sensors
    } catch (error) {
      logger.error('Error fetching sensors from OpenAQ API', {
        locationId,
        error: error.message
      })
      console.log(`❌ Error fetching sensors for location ${locationId}:`, error.message)
      return []
    }
  }

  /**
   * Calculate date range for last 7 days
   * @returns {Object} Object with dateFrom and dateTo in YYYY-MM-DD format
   */
  calculateLast7DaysRange() {
    const now = new Date()
    
    // Calculate date range: from 7 days ago to 1 day ago (fixed 7-day period)
    const dateTo = new Date(now.getTime() - (1 * 24 * 60 * 60 * 1000)) // 1 day ago
    const dateFrom = new Date(now.getTime() - (7 * 24 * 60 * 60 * 1000)) // 7 days ago
    
    // Format as YYYY-MM-DD only
    const dateFromStr = dateFrom.toISOString().split('T')[0]
    const dateToStr = dateTo.toISOString().split('T')[0]
    
    console.log('📅 Calculated date range:')
    console.log('  From:', dateFromStr)
    console.log('  To:', dateToStr)
    console.log('  Current time:', now.toISOString().split('T')[0])
    console.log('  Note: Using fixed 7-day period ending 1 day ago')
    
    return { dateFrom: dateFromStr, dateTo: dateToStr }
  }

  /**
   * Fetch sensor data for history from OpenAQ API
   * @param {Array} sensors - Array of sensor objects
   * @param {Object} dateRange - Date range object
   * @returns {Array} Array of sensor data objects
   */
  async fetchSensorDataForHistory(sensors, dateRange) {
    const sensorData = []
    const apiKey = config.openaq.apiKey
    
    console.log('🔍 Fetching sensor data for history...')
    console.log('📅 Date range:', dateRange)
    console.log('📡 Sensors to fetch:', sensors.length)
    
    for (const sensor of sensors) {
      try {
        const url = `https://api.openaq.org/v3/sensors/${sensor.id}/days`
        const params = new URLSearchParams({
          date_from: dateRange.dateFrom,
          date_to: dateRange.dateTo,
          limit: '100'
        })
        
        console.log(`\n🌐 Fetching data for sensor ${sensor.id} (${sensor.name})...`)
        console.log(`URL: ${url}?${params.toString()}`)
        
        const response = await fetch(`${url}?${params}`, {
          headers: {
            'X-API-Key': apiKey,
            'Content-Type': 'application/json'
          }
        })
        
        console.log(`Response status: ${response.status} ${response.statusText}`)
        
        if (!response.ok) {
          logger.warn('OpenAQ API request failed for sensor', {
            sensorId: sensor.id,
            status: response.status,
            statusText: response.statusText
          })
          console.log(`❌ API request failed for sensor ${sensor.id}`)
          continue
        }
        
        const data = await response.json()
        
        console.log(`✅ API response for sensor ${sensor.id}:`)
        console.log('Meta:', JSON.stringify(data.meta, null, 2))
        console.log(`Results count: ${data.results ? data.results.length : 0}`)
        
        if (data.results && data.results.length > 0) {
          console.log('Sample result:', JSON.stringify(data.results[0], null, 2))
        }
        
        sensorData.push({
          sensor,
          data: data.results || [],
          meta: data.meta || {}
        })
        
        // Rate limiting - small delay between requests
        await this.sleep(100)
        
      } catch (error) {
        logger.error('Error fetching sensor data', {
          sensorId: sensor.id,
          error: error.message
        })
        console.log(`❌ Error fetching sensor ${sensor.id}:`, error.message)
      }
    }
    
    console.log(`\n📊 Total sensor data collected: ${sensorData.length} sensors`)
    sensorData.forEach((item, index) => {
      console.log(`Sensor ${index + 1}: ${item.sensor.name} - ${item.data.length} data points`)
    })
    
    return sensorData
  }

  /**
   * Aggregate history data for frontend consumption
   * @param {Array} sensorData - Array of sensor data objects
   * @param {Object} location - Location object
   * @returns {Object} Aggregated data for frontend
   */
  aggregateHistoryData(sensorData, location) {
    console.log('🔍 Aggregating history data...')
    console.log('📊 Sensor data received:', sensorData.length, 'sensors')
    
    const aggregated = {
      city: location.city,
      country: location.country,
      countryCode: location.country_code,
      coordinates: {
        latitude: location.latitude,
        longitude: location.longitude
      },
      sensors: [],
      dataPoints: 0,
      dateRange: {
        from: null,
        to: null
      }
    }
    
    let totalDataPoints = 0
    let earliestDate = null
    let latestDate = null
    
    sensorData.forEach(({ sensor, data }) => {
      console.log(`📡 Processing sensor ${sensor.id} (${sensor.name}):`)
      console.log(`   Data points: ${data.length}`)
      
      if (data.length === 0) {
        console.log(`   ⚠️ No data for sensor ${sensor.id}`)
        return
      }
      
      // Log first and last data points to see the date range
      if (data.length > 0) {
        const firstItem = data[0]
        const lastItem = data[data.length - 1]
        console.log(`   📅 Date range: ${firstItem.period.datetimeFrom.utc} to ${lastItem.period.datetimeTo.utc}`)
        console.log(`   📊 Values: ${data.length} measurements`)
      }
      
      const sensorInfo = {
        id: sensor.id,
        name: sensor.name,
        units: sensor.units,
        displayName: sensor.displayName,
        dataPoints: data.length,
                 measurements: data.map(item => ({
           date: item.period.datetimeFrom.utc.split('T')[0], // Format as YYYY-MM-DD
           value: item.value,
           parameter: item.parameter.name,
           units: item.parameter.units,
           summary: item.summary,
           coverage: item.coverage
         }))
      }
      
      aggregated.sensors.push(sensorInfo)
      totalDataPoints += data.length
      
      // Track date range
      data.forEach(item => {
        const date = new Date(item.period.datetimeFrom.utc)
        if (!earliestDate || date < earliestDate) {
          earliestDate = date
        }
        if (!latestDate || date > latestDate) {
          latestDate = date
        }
      })
    })
    
         aggregated.dataPoints = totalDataPoints
     if (earliestDate && latestDate) {
       aggregated.dateRange.from = earliestDate.toISOString().split('T')[0] // Format as YYYY-MM-DD
       aggregated.dateRange.to = latestDate.toISOString().split('T')[0] // Format as YYYY-MM-DD
     }
    
    return aggregated
  }

  /**
   * Clear history cache for a specific city
   * @param {Object} req - Express request object
   * @param {Object} res - Express response object
   */
  async clearHistoryCache(req, res) {
    try {
      const { cityName } = req.params
      
      if (!cityName) {
        return res.status(400).json({
          success: false,
          message: 'City name is required',
          timestamp: new Date().toISOString()
        })
      }

      logger.info('Clearing history cache for city', { cityName })
      
      // Get cache instance
      const cache = require('../utils/cache')
      
      // Clear specific city history cache
      const cacheKey = `city_history:${cityName.toLowerCase()}`
      cache.del(cacheKey)
      
      logger.info('City history cache cleared successfully', { cityName, cacheKey })
      
      res.status(200).json({
        success: true,
        message: `History cache cleared for ${cityName}`,
        timestamp: new Date().toISOString(),
        clearedCacheKey: cacheKey
      })
    } catch (error) {
      logger.error('Failed to clear history cache', { error: error.message })
      this.handleError(error, res)
    }
  }

  /**
   * Clear all caches and force fresh data fetch
   * @param {Object} req - Express request object
   * @param {Object} res - Express response object
   */
  async clearCache(req, res) {
    try {
      logger.info('Clearing all caches')
      
      // Get cache instance
      const cache = require('../utils/cache')
      
             // Clear all cache keys related to cities API
       const cacheKeysToClear = [
         'countries_list',
         'available_countries',
         // Clear city validation cache (pattern matching)
         'city_validation:*',
         // Clear Wikipedia descriptions cache (pattern matching)
         'wikipedia_description:*',
         // Clear database cities cache (pattern matching)
         'db_cities:*',
         // Clear country names cache (pattern matching)
         'country_name:*',
         // Clear city history cache (pattern matching)
         'city_history:*'
       ]
      
      // Clear specific cache keys
      cacheKeysToClear.forEach(key => {
        if (key.includes('*')) {
          // Pattern matching - clear all keys that match the pattern
          cache.clearPattern(key)
        } else {
          cache.del(key)
        }
      })
      
      // Clear pollution data cache (legacy mock API)
      // pollutionApiService.clearCache() // DEPRECATED - Using OpenAQ instead
      
      // Clear OpenAQ cache if enabled
      if (config.openaq.enabled) {
        openaqService.clearCache()
      }
      
      // Clear Google Places validation cache
      // cityValidator.clearGooglePlacesCache() // DEPRECATED - Google Places API disabled
      
      logger.info('All caches cleared successfully')
      
      res.status(200).json({
        success: true,
        message: 'Cache cleared successfully. Next request will fetch fresh data with validation.',
        timestamp: new Date().toISOString(),
        dataSource: config.openaq.enabled ? 'OpenAQ' : 'Mock API',
        clearedCacheKeys: cacheKeysToClear
      })
    } catch (error) {
      logger.error('Failed to clear cache', { error: error.message })
      this.handleError(error, res)
    }
  }
}

module.exports = new CitiesController()
