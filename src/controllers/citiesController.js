/**
 * Cities Controller Module
 * Main controller for handling cities endpoint requests
 * 
 * Orchestrates data fetching, validation, enrichment, and response formatting
 * for the polluted cities API endpoint.
 */

const pollutionApiService = require('../services/pollutionApiService')
const wikipediaService = require('../services/wikipediaService')
const cityValidator = require('../utils/validation')
const logger = require('../utils/logger')

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
   * Parse and validate country code from query parameter
   * @param {string} countryParam - Single country code
   * @returns {Array<string>} Array with single valid country code
   */
  parseAndValidateCountries(countryParam) {
    const supportedCountries = ['PL', 'DE', 'ES', 'FR']
    
    // If no country specified, default to Poland (first country)
    if (!countryParam) {
      logger.info('No country specified, defaulting to Poland', {
        defaultCountry: 'PL'
      })
      return ['PL']
    }

    // Parse and validate single country code
    const country = countryParam.trim().toUpperCase()

    // Validate that the requested country is supported
    if (!supportedCountries.includes(country)) {
      throw new Error(`Unsupported country code: ${country}. Supported codes: ${supportedCountries.join(', ')}`)
    }

    logger.info('Validated country code', {
      requested: countryParam,
      validated: country
    })

    return [country]
  }

  /**
   * Parse and validate pagination parameters
   * @param {string} pageParam - Page number
   * @param {string} limitParam - Items per page
   * @returns {Object} Pagination object with page and limit (always 9 items per page)
   */
  parseAndValidatePagination(pageParam, limitParam) {
    // Default values - always use 9 items per page
    let page = 1
    const limit = 9 // Fixed at 9 items per page

    // Parse page parameter
    if (pageParam) {
      const parsedPage = parseInt(pageParam, 10)
      if (isNaN(parsedPage) || parsedPage < 1) {
        throw new Error('Page parameter must be a positive integer')
      }
      page = parsedPage
    }

    // Ignore limit parameter since we always use 9 items per page
    if (limitParam) {
      logger.info('Limit parameter ignored, using fixed 9 items per page', {
        requestedLimit: limitParam
      })
    }

    logger.info('Validated pagination parameters', {
      page,
      limit,
      note: 'Fixed at 9 items per page'
    })

    return { page, limit }
  }

  /**
   * Fetch pollution data from external API (now returns filtered data)
   * @param {Array<string>} countries - Array of country codes to fetch
   * @param {Object} pagination - Pagination parameters
   * @returns {Promise<Object>} Object with cities data and total count
   */
  async fetchPollutionData(countries, pagination) {
    try {
      const result = await pollutionApiService.fetchCitiesData(countries, pagination)
      
      // The service now always returns an object with cities and totalCount
      const { cities: citiesData, totalCount } = result

      if (!Array.isArray(citiesData)) {
        throw new Error('Invalid data format: expected array of cities')
      }

      logger.info('Successfully fetched filtered pollution data', {
        cityCount: citiesData.length,
        totalCount: totalCount,
        country: countries[0],
        pagination
      })

      return { cities: citiesData, totalCount }
    } catch (error) {
      logger.error('Failed to fetch pollution data', { error: error.message })
      throw new Error(`Failed to fetch pollution data: ${error.message}`)
    }
  }

  /**
   * Validate and filter cities data
   * @param {Array} rawCitiesData - Raw cities data from API
   * @returns {Promise<Array>} Valid cities data
   */
  async validateAndFilterCities(rawCitiesData) {
    try {
      const validCities = []
      const validationStats = await cityValidator.getValidationStats(rawCitiesData)

      logger.info('City validation statistics', validationStats)

      for (const cityData of rawCitiesData) {
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
           // Normalize city data
           const normalizedCity = this.normalizeCityData(correctedCityData)
           validCities.push(normalizedCity)
        }
      }

             logger.info('City validation completed', {
         total: rawCitiesData.length,
         valid: validCities.length,
         invalid: rawCitiesData.length - validCities.length
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
   * Enrich cities with Wikipedia descriptions
   * @param {Array} validCities - Valid cities data
   * @returns {Promise<Array>} Enriched cities data
   */
  async enrichCitiesWithDescriptions(validCities) {
    try {
      const enrichedCities = []
      let successCount = 0
      let failureCount = 0

      logger.info('Starting city enrichment process', {
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
      
      // Use the corrected name from Google Places validation for Wikipedia search
      const cityValidator = require('../utils/validation')
      const correctedCityName = await cityValidator.getCorrectedCityName(rawCityName)
      
      const description = await wikipediaService.getCityDescription(
        correctedCityName,
        city.country
      )

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

      logger.info('City enrichment completed', {
        total: validCities.length,
        success: successCount,
        failures: failureCount
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
   * Get full country name from country code
   * @param {string} countryCode - Country code (PL, DE, ES, FR)
   * @returns {string} Full country name
   */
  getCountryName(countryCode) {
    const countryMap = {
      'PL': 'Poland',
      'DE': 'Germany', 
      'ES': 'Spain',
      'FR': 'France'
    }
    return countryMap[countryCode] || countryCode
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
   * Clear all caches and force fresh data fetch
   * @param {Object} req - Express request object
   * @param {Object} res - Express response object
   */
  async clearCache(req, res) {
    try {
      logger.info('Clearing all caches')
      
      // Clear pollution data cache
      pollutionApiService.clearCache()
      
      // Clear Google Places validation cache
      cityValidator.clearGooglePlacesCache()
      
      logger.info('All caches cleared successfully')
      
      res.status(200).json({
        success: true,
        message: 'Cache cleared successfully. Next request will fetch fresh data with validation.',
        timestamp: new Date().toISOString()
      })
    } catch (error) {
      logger.error('Failed to clear cache', { error: error.message })
      this.handleError(error, res)
    }
  }
}

module.exports = new CitiesController()
