/**
 * Database Service Module
 * SQLite database management for invalid cities and pollution history
 * 
 * Handles database operations for tracking invalid cities and caching
 * pollution history data to reduce external API calls.
 */

const Database = require('better-sqlite3')
const path = require('path')
const fs = require('fs')
const config = require('../config')
const logger = require('../utils/logger')

class DatabaseService {
  constructor() {
    this.db = null
    this.initialized = false
  }

  /**
   * Initialize database connection and create tables
   */
  initialize() {
    try {
      // Ensure data directory exists
      const dataDir = path.join(process.cwd(), 'data')
      if (!fs.existsSync(dataDir)) {
        fs.mkdirSync(dataDir, { recursive: true })
        logger.info('Created data directory', { path: dataDir })
      }

      // Connect to SQLite database
      const dbPath = path.join(dataDir, 'cities.db')
      this.db = new Database(dbPath)
      
      // Enable WAL mode for better concurrency
      this.db.pragma('journal_mode = WAL')
      
      // Create tables
      this.createTables()
      
      this.initialized = true
      logger.info('Database initialized successfully', { 
        path: dbPath,
        tables: ['invalid_cities', 'pollution_history']
      })
      
    } catch (error) {
      logger.error('Database initialization failed', { error: error.message })
      throw error
    }
  }

  /**
   * Create database tables if they don't exist
   */
  createTables() {
    try {
      // Invalid cities table
      this.db.exec(`
        CREATE TABLE IF NOT EXISTS invalid_cities (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          city_name VARCHAR(255) NOT NULL,
          country_code VARCHAR(10) NOT NULL,
          invalid_count INTEGER DEFAULT 1,
          first_marked_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          last_marked_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          UNIQUE(city_name, country_code)
        )
      `)

      // Pollution history table
      this.db.exec(`
        CREATE TABLE IF NOT EXISTS pollution_history (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          city_name VARCHAR(255) NOT NULL,
          country_code VARCHAR(10) NOT NULL,
          date DATE NOT NULL,
          aqi_value INTEGER NOT NULL,
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          UNIQUE(city_name, country_code, date)
        )
      `)

      // Create indexes for better performance
      this.db.exec(`
        CREATE INDEX IF NOT EXISTS idx_invalid_cities_lookup 
        ON invalid_cities(city_name, country_code)
      `)

      this.db.exec(`
        CREATE INDEX IF NOT EXISTS idx_pollution_history_lookup 
        ON pollution_history(city_name, country_code, date)
      `)

      logger.info('Database tables created/verified')
    } catch (error) {
      logger.warn('Some database tables could not be created, continuing with basic functionality', { 
        error: error.message 
      })
    }
  }

  /**
   * Mark a city as invalid (increment count or create new record)
   * @param {string} cityName - Name of the city
   * @param {string} countryCode - Country code
   * @returns {Object} Result with new invalid count
   */
  markCityInvalid(cityName, countryCode) {
    try {
      // Check if invalid_cities table exists
      const tableExists = this.db.prepare(`
        SELECT name FROM sqlite_master WHERE type='table' AND name='invalid_cities'
      `).get()
      
      if (!tableExists) {
        logger.warn('invalid_cities table does not exist, skipping invalid city marking')
        return {
          success: false,
          invalidCount: 0,
          isBlocked: false,
          message: 'Invalid cities tracking not available'
        }
      }

      const stmt = this.db.prepare(`
        INSERT INTO invalid_cities (city_name, country_code, invalid_count, first_marked_at, last_marked_at)
        VALUES (?, ?, 1, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
        ON CONFLICT(city_name, country_code) DO UPDATE SET
          invalid_count = invalid_count + 1,
          last_marked_at = CURRENT_TIMESTAMP
        RETURNING invalid_count
      `)

      const result = stmt.get(cityName, countryCode)
      
      logger.info('City marked as invalid', {
        cityName,
        countryCode,
        invalidCount: result.invalid_count
      })

      return {
        success: true,
        invalidCount: result.invalid_count,
        isBlocked: result.invalid_count >= 3
      }
    } catch (error) {
      logger.error('Failed to mark city as invalid', {
        cityName,
        countryCode,
        error: error.message
      })
      return {
        success: false,
        invalidCount: 0,
        isBlocked: false,
        message: 'Failed to mark city as invalid'
      }
    }
  }

  /**
   * Get all cities that have been marked invalid 3 or more times
   * @returns {Array} Array of blocked cities
   */
  getBlockedCities() {
    try {
      // Check if invalid_cities table exists
      const tableExists = this.db.prepare(`
        SELECT name FROM sqlite_master WHERE type='table' AND name='invalid_cities'
      `).get()
      
      if (!tableExists) {
        logger.warn('invalid_cities table does not exist, returning empty blocked cities list')
        return []
      }

      const stmt = this.db.prepare(`
        SELECT city_name, country_code, invalid_count, last_marked_at
        FROM invalid_cities
        WHERE invalid_count >= 3
        ORDER BY last_marked_at DESC
      `)

      const blockedCities = stmt.all()
      
      logger.debug('Retrieved blocked cities', { count: blockedCities.length })
      
      return blockedCities.map(city => ({
        cityName: city.city_name,
        countryCode: city.country_code,
        invalidCount: city.invalid_count,
        lastMarkedAt: city.last_marked_at
      }))
    } catch (error) {
      logger.error('Failed to get blocked cities', { error: error.message })
      return [] // Return empty array instead of throwing
    }
  }

  /**
   * Check if a city is blocked (marked invalid 3+ times)
   * @param {string} cityName - Name of the city
   * @param {string} countryCode - Country code
   * @returns {boolean} True if city is blocked
   */
  isCityBlocked(cityName, countryCode) {
    try {
      // Check if invalid_cities table exists
      const tableExists = this.db.prepare(`
        SELECT name FROM sqlite_master WHERE type='table' AND name='invalid_cities'
      `).get()
      
      if (!tableExists) {
        return false // No table means no blocked cities
      }

      const stmt = this.db.prepare(`
        SELECT invalid_count
        FROM invalid_cities
        WHERE city_name = ? AND country_code = ?
      `)

      const result = stmt.get(cityName, countryCode)
      return result ? result.invalid_count >= 3 : false
    } catch (error) {
      logger.error('Failed to check if city is blocked', {
        cityName,
        countryCode,
        error: error.message
      })
      return false // Fail safe - don't block if we can't check
    }
  }

  /**
   * Cache pollution history data for a city
   * @param {string} cityName - Name of the city
   * @param {string} countryCode - Country code
   * @param {Array} historyData - Array of pollution data objects
   */
  cachePollutionHistory(cityName, countryCode, historyData) {
    try {
      const stmt = this.db.prepare(`
        INSERT INTO pollution_history (city_name, country_code, date, aqi_value)
        VALUES (?, ?, ?, ?)
        ON CONFLICT(city_name, country_code, date) DO UPDATE SET
          aqi_value = excluded.aqi_value,
          created_at = CURRENT_TIMESTAMP
      `)

      const insertMany = this.db.transaction((data) => {
        for (const item of data) {
          stmt.run(cityName, countryCode, item.date, item.aqi_value)
        }
      })

      insertMany(historyData)
      
      logger.info('Pollution history cached', {
        cityName,
        countryCode,
        recordsCount: historyData.length
      })
    } catch (error) {
      logger.error('Failed to cache pollution history', {
        cityName,
        countryCode,
        error: error.message
      })
      throw error
    }
  }

  /**
   * Get cached pollution history for a city (last 7 days)
   * @param {string} cityName - Name of the city
   * @param {string} countryCode - Country code
   * @returns {Array} Array of pollution history data
   */
  getPollutionHistory(cityName, countryCode) {
    try {
      const stmt = this.db.prepare(`
        SELECT date, aqi_value, created_at
        FROM pollution_history
        WHERE city_name = ? AND country_code = ?
        AND date >= date('now', '-7 days')
        ORDER BY date ASC
      `)

      const history = stmt.all(cityName, countryCode)
      
      logger.debug('Retrieved pollution history', {
        cityName,
        countryCode,
        recordsCount: history.length
      })
      
      return history.map(record => ({
        date: record.date,
        aqi_value: record.aqi_value,
        created_at: record.created_at
      }))
    } catch (error) {
      logger.error('Failed to get pollution history', {
        cityName,
        countryCode,
        error: error.message
      })
      throw error
    }
  }

  /**
   * Clear old pollution history data (older than 30 days)
   */
  cleanupOldHistory() {
    try {
      const stmt = this.db.prepare(`
        DELETE FROM pollution_history
        WHERE date < date('now', '-30 days')
      `)

      const result = stmt.run()
      
      if (result.changes > 0) {
        logger.info('Cleaned up old pollution history', {
          deletedRecords: result.changes
        })
      }
    } catch (error) {
      logger.error('Failed to cleanup old history', { error: error.message })
    }
  }

  /**
   * Remove city from invalid list
   * @param {string} cityName - Name of the city
   * @param {string} countryCode - Country code
   * @returns {Object} Result of removal operation
   */
  removeInvalidCity(cityName, countryCode) {
    try {
      const stmt = this.db.prepare(`
        DELETE FROM invalid_cities
        WHERE city_name = ? AND country_code = ?
      `)

      const result = stmt.run(cityName, countryCode)
      
      if (result.changes > 0) {
        logger.info('City removed from invalid list', {
          cityName,
          countryCode,
          changes: result.changes
        })

        return {
          success: true,
          message: 'City removed from invalid list',
          changes: result.changes
        }
      } else {
        logger.warn('City not found in invalid list', {
          cityName,
          countryCode
        })

        return {
          success: false,
          message: 'City not found in invalid list',
          changes: 0
        }
      }
    } catch (error) {
      logger.error('Failed to remove city from invalid list', {
        cityName,
        countryCode,
        error: error.message
      })
      throw error
    }
  }

  /**
   * Get database statistics
   * @returns {Object} Database statistics
   */
  getStats() {
    try {
      const invalidCitiesCount = this.db.prepare(`
        SELECT COUNT(*) as count FROM invalid_cities
      `).get().count

      const blockedCitiesCount = this.db.prepare(`
        SELECT COUNT(*) as count FROM invalid_cities WHERE invalid_count >= 3
      `).get().count

      const historyRecordsCount = this.db.prepare(`
        SELECT COUNT(*) as count FROM pollution_history
      `).get().count

      return {
        invalidCitiesCount,
        blockedCitiesCount,
        historyRecordsCount
      }
    } catch (error) {
      logger.error('Failed to get database stats', { error: error.message })
      return { error: error.message }
    }
  }

  /**
   * Close database connection
   */
  close() {
    if (this.db) {
      this.db.close()
      this.initialized = false
      logger.info('Database connection closed')
    }
  }
}

// Create singleton instance
const databaseService = new DatabaseService()

module.exports = databaseService
