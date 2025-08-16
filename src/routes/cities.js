/**
 * Cities Routes Module
 * API routes for cities endpoint
 * 
 * Defines the main cities endpoint with proper middleware
 * and error handling for the polluted cities API.
 */

const express = require('express')
const citiesController = require('../controllers/citiesController')
const { asyncHandler } = require('../middleware/errorHandler')

const router = express.Router()

/**
 * GET /cities
 * Fetch and return polluted cities data with validation and enrichment
 * 
 * Query Parameters:
 * - country (optional): Single country code (PL, DE, ES, FR)
 *   Examples: ?country=PL or ?country=DE or ?country=ES
 *   If not provided, defaults to Poland (PL)
 * - page (optional): Page number for pagination (default: 1, min: 1)
 *   Examples: ?page=1 or ?page=2
 * - limit (optional): Number of items per page (ignored, always 9)
 *   Examples: ?limit=10 (will be ignored, returns 9 items)
 * 
 * This endpoint:
 * 1. Validates requested country code and pagination parameters
 * 2. Fetches data from the pollution API for specified country
 * 3. Validates and filters out invalid/corrupted entries using Google Places API
 * 4. Enriches cities with Wikipedia descriptions (if requested)
 * 5. Applies pagination and returns formatted data
 * 
 * Response format:
 * {
 *   "page": number,
 *   "limit": number,
 *   "total": number,
 *   "country": "string",
 *   "cities": [
 *     {
 *       "name": "string",
 *       "country": "string",
 *       "pollution": number,
 *       "description": "string"
 *     }
 *   ]
 * }
 */
router.get('/', asyncHandler(citiesController.getCities.bind(citiesController)))

/**
 * POST /cities/clear-cache
 * Clear all cached pollution data and force fresh fetch
 * 
 * This endpoint:
 * 1. Clears all pollution data cache (raw and filtered)
 * 2. Clears Google Places validation cache
 * 3. Forces fresh data fetching and validation on next request
 * 
 * Response format:
 * {
 *   "success": true,
 *   "message": "Cache cleared successfully",
 *   "timestamp": "string"
 * }
 */
router.post('/clear-cache', asyncHandler(citiesController.clearCache.bind(citiesController)))

module.exports = router
