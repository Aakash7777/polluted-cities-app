/**
 * API Routes Module
 * New API endpoints for React frontend integration
 * 
 * Provides RESTful API endpoints for the React frontend with
 * enhanced functionality for invalid cities and pollution history.
 */

const express = require('express')
const citiesController = require('../controllers/citiesController')
const { asyncHandler } = require('../middleware/errorHandler')

const router = express.Router()

/**
 * GET /api/cities
 * Enhanced cities endpoint for React frontend
 * 
 * Query Parameters:
 * - country (optional): Country code (PL, DE, ES, FR)
 * - page (optional): Page number for pagination
 * - limit (optional): Items per page (default: 10, min: 1, max: 50)
 * - search (optional): Search term for city names
 * - includeBlocked (optional): Include blocked cities (default: false)
 * 
 * Response format optimized for React frontend
 */
router.get('/cities', asyncHandler(citiesController.getCitiesV2.bind(citiesController)))

/**
 * GET /api/countries
 * Get all available countries
 * 
 * Response:
 * {
 *   "success": true,
 *   "data": {
 *     "countries": [
 *       {
 *         "code": "US",
 *         "name": "United States"
 *       }
 *     ],
 *     "total": 1
 *   },
 *   "metadata": {
 *     "timestamp": "2024-01-15T10:30:00.000Z",
 *     "version": "1.0.0"
 *   }
 * }
 */
router.get('/countries', asyncHandler(citiesController.getCountries.bind(citiesController)))

/**
 * GET /api/cities/history/:cityName
 * Get 7-day pollution history for a specific city
 * 
 * URL Parameters:
 * - cityName: Name of the city (URL encoded)
 * 
 * Query Parameters:
 * - country: Country code (PL, DE, ES, FR)
 * 
 * Response:
 * {
 *   "success": true,
 *   "data": {
 *     "cityName": "Warsaw",
 *     "countryCode": "PL",
 *     "history": [
 *       {
 *         "date": "2024-01-15",
 *         "aqi_value": 156,
 *         "level": "unhealthy"
 *       }
 *     ]
 *   },
 *   "metadata": {
 *     "timestamp": "2024-01-15T10:30:00.000Z",
 *     "days": 7
 *   }
 * }
 */
router.get('/cities/history/:cityName', asyncHandler(citiesController.getCityHistory.bind(citiesController)))

/**
 * DELETE /api/cities/history/:cityName/cache
 * Clear history cache for a specific city
 * 
 * URL Parameters:
 * - cityName: Name of the city (URL encoded)
 * 
 * Response:
 * {
 *   "success": true,
 *   "message": "History cache cleared for Warsaw",
 *   "timestamp": "2024-01-15T10:30:00.000Z",
 *   "clearedCacheKey": "city_history:warsaw"
 * }
 */
router.delete('/cities/history/:cityName/cache', asyncHandler(citiesController.clearHistoryCache.bind(citiesController)))

/**
 * POST /api/cities/:cityName/invalidate
 * Mark a city as invalid
 * 
 * URL Parameters:
 * - cityName: Name of the city (URL encoded)
 * 
 * Request Body:
 * {
 *   "countryCode": "PL",
 *   "reason": "Invalid data" (optional)
 * }
 * 
 * Response:
 * {
 *   "success": true,
 *   "data": {
 *     "cityName": "Warsaw",
 *     "countryCode": "PL",
 *     "invalidCount": 1,
 *     "isBlocked": false,
 *     "message": "City marked as invalid"
 *   },
 *   "metadata": {
 *     "timestamp": "2024-01-15T10:30:00.000Z"
 *   }
 * }
 */
router.post('/cities/:cityName/invalidate', asyncHandler(citiesController.markCityInvalid.bind(citiesController)))

/**
 * GET /api/cities/invalid
 * Get list of invalid/blocked cities
 * 
 * Query Parameters:
 * - blocked (optional): Only return blocked cities (default: true)
 * - country (optional): Filter by country code
 * 
 * Response:
 * {
 *   "success": true,
 *   "data": {
 *     "cities": [
 *       {
 *         "cityName": "Invalid City",
 *         "countryCode": "PL",
 *         "invalidCount": 3,
 *         "isBlocked": true,
 *         "lastMarkedAt": "2024-01-15T10:30:00.000Z"
 *       }
 *     ],
 *     "total": 1,
 *     "blockedCount": 1
 *   },
 *   "metadata": {
 *     "timestamp": "2024-01-15T10:30:00.000Z"
 *   }
 * }
 */
router.get('/cities/invalid', asyncHandler(citiesController.getInvalidCities.bind(citiesController)))

/**
 * DELETE /api/cities/:cityName/invalidate
 * Remove city from invalid list (admin function)
 * 
 * URL Parameters:
 * - cityName: Name of the city (URL encoded)
 * 
 * Request Body:
 * {
 *   "countryCode": "PL"
 * }
 * 
 * Response:
 * {
 *   "success": true,
 *   "data": {
 *     "cityName": "Warsaw",
 *     "countryCode": "PL",
 *     "message": "City removed from invalid list"
 *   },
 *   "metadata": {
 *     "timestamp": "2024-01-15T10:30:00.000Z"
 *   }
 * }
 */
router.delete('/cities/:cityName/invalidate', asyncHandler(citiesController.removeInvalidCity.bind(citiesController)))

/**
 * GET /api/stats
 * Get application statistics
 * 
 * Response:
 * {
 *   "success": true,
 *   "data": {
 *     "database": {
 *       "invalidCitiesCount": 5,
 *       "blockedCitiesCount": 2,
 *       "historyRecordsCount": 150
 *     },
 *     "cache": {
 *       "hitRate": 0.85,
 *       "totalKeys": 45
 *     },
 *     "api": {
 *       "totalRequests": 1250,
 *       "averageResponseTime": 245
 *     }
 *   },
 *   "metadata": {
 *     "timestamp": "2024-01-15T10:30:00.000Z"
 *   }
 * }
 */
router.get('/stats', asyncHandler(citiesController.getStats.bind(citiesController)))

module.exports = router
