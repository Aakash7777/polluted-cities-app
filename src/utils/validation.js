/**
 * Validation Utility Module
 * City validation using Google Places API with caching
 * 
 * Provides accurate city validation using Google Places API
 * with intelligent caching to minimize API calls.
 */

const config = require('../config')
const logger = require('./logger')
const cache = require('./cache')

class CityValidator {
  constructor() {
    this.validationRules = {
      minNameLength: config.cityValidation.minNameLength,
      maxNameLength: config.cityValidation.maxNameLength,
      allowedCountries: config.cityValidation.allowedCountries
    }
    
    // Cache configuration for Google Places validation
    this.cacheKey = 'google_places_validation'
    this.cacheTtl = 86400 // 24 hours - city names don't change often
  }

  /**
   * Validate if a city entry is valid and should be included
   * @param {Object} cityData - Raw city data from API
   * @returns {Promise<boolean>} True if city is valid
   */
  async isValidCity(cityData) {
    try {
      // Check if all required fields exist
      if (!this.hasRequiredFields(cityData)) {
        logger.debug('City filtered: missing required fields', { cityData })
        return false
      }

      // Get city name and pollution value (support multiple formats)
      const rawCityName = cityData.city || cityData.name || cityData.cityName || 'Unknown City'
      const pollutionValue = cityData.aqi || cityData.pollution || cityData.airQualityIndex || 0

      // Validate city name using Google Places API (handles typos and returns canonical name)
      const validationResult = await this.isValidCityName(rawCityName)
      if (!validationResult.isValid) {
        logger.debug('City filtered: invalid city name', { 
          original: rawCityName, 
          cityData 
        })
        return false
      }

      // Use the corrected name from Google Places API
      const correctedCityName = validationResult.correctedName || rawCityName

      // Validate country
      if (!this.isValidCountry(cityData.country)) {
        logger.debug('City filtered: invalid country', { country: cityData.country, cityData })
        return false
      }

      // Validate pollution data
      if (!this.isValidPollutionData({ aqi: pollutionValue })) {
        logger.debug('City filtered: invalid pollution data', { pollutionValue, cityData })
        return false
      }

      logger.debug('City passed validation', { 
        original: rawCityName, 
        corrected: correctedCityName,
        country: cityData.country, 
        pollutionValue 
      })
      
      // Return the corrected city name along with validation result
      return { isValid: true, correctedName: correctedCityName }
    } catch (error) {
      logger.error('Error validating city data', { error: error.message, cityData })
      return { isValid: false, correctedName: null }
    }
  }

  /**
   * Check if city data has all required fields
   * @param {Object} cityData - City data object
   * @returns {boolean} True if all required fields exist
   */
  hasRequiredFields(cityData) {
    // Support multiple possible field names for city name and pollution data
    const hasCityName = ['city', 'name', 'cityName'].some(field => 
      cityData.hasOwnProperty(field) && 
      cityData[field] !== null && 
      cityData[field] !== undefined
    )
    
    const hasCountry = cityData.hasOwnProperty('country') && 
      cityData.country !== null && 
      cityData.country !== undefined
    
    const hasPollutionData = ['aqi', 'pollution', 'airQualityIndex'].some(field => 
      cityData.hasOwnProperty(field) && 
      cityData[field] !== null && 
      cityData[field] !== undefined
    )
    
    return hasCityName && hasCountry && hasPollutionData
  }

  /**
   * Validate city name using Google Places API with caching
   * @param {string} cityName - City name to validate
   * @returns {Promise<Object>} Object with validation result and corrected name
   */
  async isValidCityName(cityName) {
    if (typeof cityName !== 'string') {
      return { isValid: false, correctedName: null }
    }

    const trimmedName = cityName.trim()
    
    // Check length constraints
    if (trimmedName.length < this.validationRules.minNameLength || 
        trimmedName.length > this.validationRules.maxNameLength) {
      return { isValid: false, correctedName: null }
    }

    // Use Google Places API for validation with caching
    try {
      return await this.validateWithGooglePlaces(trimmedName)
    } catch (error) {
      logger.warn('Google Places API validation failed', {
        cityName: trimmedName,
        error: error.message
      })
      // If API fails, allow the city to pass (fail open)
      return { isValid: true, correctedName: trimmedName }
    }
  }

  /**
   * Validate city name using Google Places API with caching
   * @param {string} cityName - City name to validate
   * @returns {Promise<Object>} Object with validation result and corrected name
   */
  async validateWithGooglePlaces(cityName) {
    // Check if Google API key is configured
    if (!config.googlePlaces?.apiKey) {
      logger.warn('Google Places API key not configured, skipping API validation')
      return { isValid: true, correctedName: cityName } // Allow validation to pass if API is not configured
    }

    // Check cache first
    const cacheKey = `${this.cacheKey}_${cityName.toLowerCase()}`
    const cachedResult = cache.get(cacheKey)
    
    if (cachedResult !== undefined) {
      logger.debug('Google Places validation result found in cache', { 
        cityName, 
        cachedResult 
      })
      return cachedResult
    }

    // Use Places Autocomplete API for better typo handling and canonical names
    const url = `https://maps.googleapis.com/maps/api/place/autocomplete/json?input=${encodeURIComponent(
      cityName
    )}&types=(cities)&key=${config.googlePlaces.apiKey}`

    try {
      const response = await fetch(url)
      const data = await response.json()

      if (!data.predictions || data.predictions.length === 0) {
        logger.debug('Google Places Autocomplete: No matching place found', { cityName })
        // Cache the negative result
        const result = { isValid: false, correctedName: null, reason: 'no_matching_place' }
        cache.set(cacheKey, result, this.cacheTtl)
        return result // No matching place
      }

      // Get the first prediction (most relevant)
      const prediction = data.predictions[0]
      
      // Validate that this is actually a city by checking place types
      const isValidCityType = prediction.types && (
        prediction.types.includes("locality") ||
        prediction.types.includes("administrative_area_level_1")
      )
      
      if (!isValidCityType) {
        logger.debug('Google Places Autocomplete: Place found but not a valid city type', { 
          cityName,
          placeTypes: prediction.types,
          description: prediction.description
        })
        // Cache the negative result
        const result = { isValid: false, correctedName: null, reason: 'invalid_city_type' }
        cache.set(cacheKey, result, this.cacheTtl)
        return result
      }
      
      // Extract the canonical name from the description
      // Format is usually "City Name, Country" or "City Name, State, Country"
      const description = prediction.description
      const correctedName = this.extractCityNameFromDescription(description)
      
      logger.debug('Google Places Autocomplete: Valid city confirmed', { 
        originalName: cityName,
        correctedName: correctedName,
        fullDescription: description,
        placeId: prediction.place_id,
        types: prediction.types,
        validTypes: prediction.types.filter(type => 
          ["locality", "administrative_area_level_1"].includes(type)
        )
      })

      // Cache the result with corrected name
      const result = { isValid: true, correctedName: correctedName, reason: 'valid_city' }
      cache.set(cacheKey, result, this.cacheTtl)
      
      return result
    } catch (error) {
      logger.error('Google Places Autocomplete API request failed', {
        cityName,
        error: error.message
      })
      throw error
    }
  }

  /**
   * Extract city name from Google Places description
   * @param {string} description - Full description from Google Places (e.g., "Tarnów, Poland")
   * @returns {string} Clean city name
   */
  extractCityNameFromDescription(description) {
    if (!description) return ''
    
    // Split by comma and take the first part (city name)
    const parts = description.split(',')
    const cityName = parts[0].trim()
    
    // Clean up any extra formatting
    return cityName
      .replace(/^\s+|\s+$/g, '') // Trim whitespace
      .replace(/\s+/g, ' ') // Normalize multiple spaces
  }



  /**
   * Validate country name
   * @param {string} countryName - Country name to validate
   * @returns {boolean} True if country is valid
   */
  isValidCountry(countryName) {
    if (typeof countryName !== 'string') {
      return false
    }

    const trimmedCountry = countryName.trim()
    
    // Check if country is in allowed list
    return this.validationRules.allowedCountries.has(trimmedCountry)
  }

  /**
   * Validate pollution data (AQI)
   * @param {Object} cityData - City data with AQI
   * @returns {boolean} True if AQI is valid
   */
  isValidPollutionData(cityData) {
    // Support multiple possible field names for pollution data
    const aqi = cityData.aqi || cityData.pollution || cityData.airQualityIndex

    // AQI should be a number
    if (typeof aqi !== 'number') {
      return false
    }

    // AQI should be within reasonable bounds (0-500+)
    if (aqi < 0 || aqi > 1000) {
      return false
    }

    // Check for NaN or Infinity
    if (!isFinite(aqi)) {
      return false
    }

    return true
  }



  /**
   * Normalize city name for consistent processing
   * @param {string} cityName - Raw city name
   * @returns {string} Normalized city name
   */
  normalizeCityName(cityName) {
    if (typeof cityName !== 'string') {
      return ''
    }

    // Clean and normalize the city name
    let normalized = cityName
      .trim()
      .replace(/\s+/g, ' ') // Replace multiple spaces with single space
      .replace(/[^\w\s\-\.]/g, '') // Remove special characters except hyphens and dots
      .replace(/^[^a-zA-Z]+/, '') // Remove leading non-letters
      .replace(/[^a-zA-Z]+$/, '') // Remove trailing non-letters

    // Properly capitalize: first letter uppercase, rest lowercase
    normalized = normalized.toLowerCase().replace(/\b\w/g, (char) => char.toUpperCase())

    return normalized
  }

  /**
   * Normalize city data to consistent format
   * @param {Object} cityData - Raw city data
   * @returns {Object} Normalized city data
   */
  normalizeCityData(cityData) {
    // Support multiple possible field names for city name and pollution data
    const cityName = cityData.city || cityData.name || cityData.cityName || 'Unknown City'
    const pollutionValue = cityData.aqi || cityData.pollution || cityData.airQualityIndex || 0
    
    return {
      city: this.normalizeCityName(cityName),
      country: cityData.country,
      aqi: pollutionValue
    }
  }

  /**
   * Get validation statistics for debugging
   * @param {Array} cities - Array of city data
   * @returns {Promise<Object>} Validation statistics
   */
  async getValidationStats(cities) {
    const stats = {
      total: cities.length,
      valid: 0,
      invalid: 0,
             reasons: {
         missingFields: 0,
         invalidCountry: 0,
         invalidAQI: 0,
         googlePlacesValidation: 0,
         invalidCityType: 0
       }
    }

    for (const city of cities) {
      // Get city name and pollution value (support both formats)
      const cityName = city.city || city.name
      const pollutionValue = city.aqi || city.pollution

      if (!this.hasRequiredFields(city)) {
        stats.reasons.missingFields++
        stats.invalid++
      } else if (!this.isValidCountry(city.country)) {
        stats.reasons.invalidCountry++
        stats.invalid++
      } else if (!this.isValidPollutionData({ aqi: pollutionValue })) {
        stats.reasons.invalidAQI++
        stats.invalid++
      } else {
                 // Final validation with Google Places API
         try {
           const validationResult = await this.validateWithGooglePlaces(cityName)
           if (!validationResult.isValid) {
             // Check if it's due to invalid city type or general validation failure
             if (validationResult.reason === 'invalid_city_type') {
               stats.reasons.invalidCityType++
             } else {
               stats.reasons.googlePlacesValidation++
             }
             stats.invalid++
           } else {
             stats.valid++
           }
         } catch (error) {
           logger.warn('Google Places validation failed for stats, counting as valid', {
             cityName,
             error: error.message
           })
           stats.valid++
         }
      }
    }

    return stats
  }

  /**
   * Get corrected city name from Google Places API
   * @param {string} cityName - Original city name
   * @returns {Promise<string>} Corrected city name or original if not found
   */
  async getCorrectedCityName(cityName) {
    try {
      const validationResult = await this.validateWithGooglePlaces(cityName)
      return validationResult.correctedName || cityName
    } catch (error) {
      logger.warn('Failed to get corrected city name', {
        cityName,
        error: error.message
      })
      return cityName
    }
  }

  /**
   * Clear Google Places validation cache
   */
  clearGooglePlacesCache() {
    // Get all cache keys that start with our cache key prefix
    const cacheKeys = cache.keys().filter(key => key.startsWith(this.cacheKey))
    
    cacheKeys.forEach(key => {
      cache.delete(key)
    })
    
    logger.info('Google Places validation cache cleared', {
      clearedKeys: cacheKeys.length
    })
  }
}

module.exports = new CityValidator()
