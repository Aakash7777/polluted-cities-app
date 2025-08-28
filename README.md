# Polluted Cities App

A Node.js backend service that integrates data from an external pollution API and enriches it with Wikipedia descriptions. The service provides a clean, validated, and enriched dataset of the polluted cities by country.

## Features

- **Real Air Quality Data**: OpenAQ API integration for live air quality data from monitoring stations worldwide
- **Legacy API Support**: Fallback to mock pollution API when OpenAQ is disabled
- **Data Integration**: Fetches pollution data from external APIs with authentication
- **Advanced City Validation**: Google Places API integration for accurate city validation and name correction
- **Smart Duplicate Removal**: Intelligent deduplication with pollution-based selection
- **Data Enrichment**: Enriches cities with Wikipedia descriptions using corrected city names
- **Beautiful Frontend**: Modern, responsive web dashboard with glassmorphism design
- **Interactive UI**: Country filtering, pagination, and real-time data visualization
- **AQI Visualization**: Color-coded pollution levels with clear health indicators
- **Intelligent Caching**: Multi-layer caching for Google Places validation, pollution data, and Wikipedia descriptions
- **Rate Limiting**: Built-in rate limiting to respect external API limits
- **Error Handling**: Production-ready error handling and logging
- **Security**: Helmet.js security headers and CORS configuration
- **Monitoring**: Comprehensive logging with Winston
- **Performance**: Compression and optimization features
- **Server-side Pagination**: Accurate pagination with exactly 9 items per page

## Requirements

- Node.js >= 18.0.0 (tested with v20.19.3)
- npm >= 8.0.0

## Installation

1. **Clone the repository**
   ```bash
   git clone <repository-url>
   cd polluted-cities-backend
   ```

2. **Install dependencies**
   ```bash
   npm install
   ```

3. **Set up environment variables**
   ```bash
   cp env.example .env
   ```
   
   Edit `.env` file with your configuration:
   ```env
   PORT=3000
   NODE_ENV=development
   
   # Legacy Mock API (fallback)
   POLLUTION_API_BASE_URL=https://be-recruitment-task.onrender.com
   POLLUTION_API_USERNAME=testuser
   POLLUTION_API_PASSWORD=testpass
   
   # OpenAQ API (Real Air Quality Data)
   OPENAQ_API_BASE_URL=https://api.openaq.org
   OPENAQ_API_KEY=your_openaq_api_key_here
   OPENAQ_ENABLED=true
   
   # Google Places API (for city validation)
   GOOGLE_PLACES_API_KEY=your_google_places_api_key_here
   GOOGLE_PLACES_ENABLED=true
   ```

4. **Start the server**
   ```bash
   # Development mode
   npm run dev
   
   # Production mode
   npm start
   ```

5. **Access the dashboard**
   - Open your browser and go to `http://localhost:3000`
   - The beautiful dashboard will load automatically
   - Use the search form to filter by country and adjust pagination

## Quick Start

```bash
npm install
npm start
```

The server will start on `http://localhost:3000`

**Dashboard**: Visit `http://localhost:3000` to see the interactive pollution dashboard!

## API Documentation

### Base URL
```
http://localhost:3000
```

### Endpoints

#### GET /cities
Fetches polluted cities data with validation, enrichment, and duplicate removal.

**Query Parameters:**
- `country` (optional): Country code (PL, DE, ES, FR). Defaults to 'PL' (Poland)
- `page` (optional): Page number for pagination. Defaults to 1
- `limit` (optional): Items per page (fixed at 9). Ignored, always returns 9 items
- `descriptions` (optional): Include Wikipedia descriptions. Always enabled

**Response Format:**
```json
{
  "page": 1,
  "limit": 9,
  "total": 45,
  "country": "PL",
  "cities": [
    {
      "name": "Warsaw",
      "country": "Poland",
      "pollution": 156,
      "description": "Warsaw is the capital and largest city of Poland..."
    },
    {
      "name": "Kraków",
      "country": "Poland", 
      "pollution": 142,
      "description": "Kraków is the second-largest and one of the oldest cities in Poland..."
    }
  ]
}
```

#### POST /cities/clear-cache
Clears all cached data (pollution data, Google Places validation, Wikipedia descriptions).

**Response:**
```json
{
  "success": true,
  "message": "Cache cleared successfully. Next request will fetch fresh data with validation.",
  "timestamp": "2024-01-15T10:30:00.000Z"
}
```

#### GET /health
Health check endpoint.

**Response:**
```json
{
  "success": true,
  "status": "healthy",
  "timestamp": "2024-01-15T10:30:00.000Z",
  "uptime": 3600,
  "environment": "development",
  "version": "1.0.0"
}
```

#### GET /docs
API documentation endpoint.

#### GET /
Beautiful web dashboard for viewing pollution data with interactive features.

## Advanced City Validation Logic

The service implements comprehensive validation using Google Places API to determine whether an entry is a valid city:

### Validation Criteria

1. **Required Fields**: Must have `city`, `country`, and `pollution` fields
2. **Google Places API Validation**:
   - Uses Google Places Autocomplete API for accurate city validation
   - Validates place types: `"locality"` or `"administrative_area_level_1"`
   - Handles typos and returns canonical city names
   - 24-hour caching to minimize API calls
3. **Country Validation**: Must be in the allowed countries list (PL, DE, ES, FR)
4. **Pollution Validation**: Must be a number between 0-1000
5. **Duplicate Removal**: Intelligent deduplication keeping cities with higher pollution values

### Validation Flow
```
Input: "Tarnw" (typo)
↓
Google Places Autocomplete API
↓
Response: "Tarnów, Poland" with types: ["locality", "political", "geocode"]
↓
Check: types.includes("locality") → TRUE
↓
Result: Valid city, corrected name: "Tarnów"
```

### Invalid Entry Examples
- `"name": "Powerplant-North"` - Not a city (establishment)
- `"name": "Dstrt Zul"` - Not a city (district)
- `"name": "Unknown Point 12"` - Not a city (point of interest)
- `"country": "Unknown"` - Invalid country
- `"pollution": "invalid"` - Non-numeric pollution value

### Duplicate Handling
- **Scenario**: Two entries for "Warsaw" with different pollution values (45 vs 52)
- **Result**: Keeps the entry with pollution value 52 (higher pollution)

## Architecture

```
src/
├── config/           # Configuration management
├── controllers/      # Request handlers
├── middleware/       # Express middleware
├── routes/          # API routes
├── services/        # External API services
├── utils/           # Utility functions
└── server.js        # Main server file

public/               # Frontend files
├── index.html       # Main dashboard page
├── styles.css       # Beautiful CSS styling
├── script.js        # Interactive JavaScript
└── README.md        # Frontend documentation
```

### Key Components

- **Config Module**: Centralized configuration management with Google Places API settings
- **Logger**: Winston-based logging with different formats for dev/prod
- **Cache Manager**: Multi-layer in-memory caching with TTL for different data types
- **City Validator**: Google Places API integration for accurate city validation and name correction
- **OpenAQ Service**: Handles real air quality data from OpenAQ API with caching and error handling
- **Pollution API Service**: Handles external API communication with authentication and retry logic (legacy)
- **Wikipedia Service**: Manages Wikipedia API integration using corrected city names
- **Error Handler**: Global error handling middleware with detailed error categorization
- **Frontend Dashboard**: Beautiful, responsive web interface with interactive features
- **Duplicate Remover**: Intelligent deduplication with pollution-based selection

## Configuration

### Environment Variables

| Variable | Description | Default |
|----------|-------------|---------|
| `PORT` | Server port | 3000 |
| `NODE_ENV` | Environment | development |
| `POLLUTION_API_BASE_URL` | Legacy Pollution API URL | https://be-recruitment-task.onrender.com |
| `POLLUTION_API_USERNAME` | Legacy API username | testuser |
| `POLLUTION_API_PASSWORD` | Legacy API password | testpass |
| `OPENAQ_API_BASE_URL` | OpenAQ API URL | https://api.openaq.org |
| `OPENAQ_API_KEY` | OpenAQ API key (optional) | null |
| `OPENAQ_ENABLED` | Enable OpenAQ integration | true |
| `GOOGLE_PLACES_API_KEY` | Google Places API key | Required for city validation |
| `GOOGLE_PLACES_ENABLED` | Enable Google Places validation | true |
| `CACHE_TTL` | Cache TTL in seconds | 3600 |
| `WIKIPEDIA_CACHE_TTL` | Wikipedia cache TTL | 86400 |
| `GOOGLE_PLACES_CACHE_TTL` | Google Places cache TTL | 86400 |
| `RATE_LIMIT_WINDOW_MS` | Rate limit window | 900000 |
| `RATE_LIMIT_MAX_REQUESTS` | Max requests per window | 100 |
| `LOG_LEVEL` | Logging level | info |

## OpenAQ Integration

The backend integrates with the **OpenAQ API** to provide real air quality data from monitoring stations worldwide. OpenAQ is a free, open-source platform that aggregates air quality data from various sources.

### Features
- **Real-time Data**: Live air quality measurements from actual monitoring stations
- **Global Coverage**: Data from cities worldwide, including Poland, Germany, Spain, and France
- **Multiple Parameters**: PM2.5, PM10, and other air quality parameters
- **Automatic AQI Calculation**: Converts raw measurements to Air Quality Index levels
- **Intelligent Caching**: Caches data to reduce API calls and improve performance
- **Fallback Support**: Falls back to legacy mock API if OpenAQ is disabled

### Current Status
⚠️ **Note**: OpenAQ v3 API currently has limited data for the specific countries (PL, DE, ES, FR) used in this application. The API returns monitoring stations from other regions when queried for these countries.

### Configuration
```env
# Enable OpenAQ integration (default: false - requires API key)
OPENAQ_ENABLED=false

# OpenAQ API base URL (default: https://api.openaq.org)
OPENAQ_API_BASE_URL=https://api.openaq.org

# Required API key for v3 API access
OPENAQ_API_KEY=your_openaq_api_key_here
```

### Testing OpenAQ Integration
```bash
# Run the OpenAQ integration test
node test-openaq.js

# Test direct API calls
node test-openaq-direct.js
```

### Data Sources
- **Primary**: OpenAQ API (real air quality data)
- **Fallback**: Legacy mock API (when OpenAQ is disabled)

### Fallback Behavior
When OpenAQ is disabled or unavailable, the application automatically falls back to the legacy mock API to ensure continuous service.

## OpenAQ AWS S3 Integration (Advanced)

For comprehensive historical air quality data, the application supports downloading data from the OpenAQ AWS S3 archive.

### Features
- **Historical Data**: Download years of air quality measurements
- **Local Storage**: Store data in SQLite database for fast access
- **Global Coverage**: Access data from monitoring stations worldwide
- **Multiple Parameters**: PM2.5, PM10, O3, NO2, SO2, CO measurements
- **Batch Processing**: Process large datasets efficiently

### Requirements
- **AWS CLI**: Must be installed and configured (no credentials needed)
- **Storage Space**: ~1.5MB per location per year
- **Network**: Internet connection for downloading

### Usage
```bash
# Download real air quality data from AWS S3
node download-openaq-data.js

# Test the AWS S3 integration
node test-openaq-aws.js

# Manual download example:
aws s3 cp --no-sign-request --recursive \
  s3://openaq-data-archive/records/csv.gz/locationid=2178/year=2020/ \
  data
```

### Data Sources
- **Primary**: OpenAQ API (real-time data)
- **Historical**: OpenAQ AWS S3 Archive (bulk historical data)
- **Fallback**: Legacy mock API (when other sources unavailable)

## Production Deployment

### Environment Setup
```bash
NODE_ENV=production
PORT=3000
# Set other production environment variables
```

### Process Management
```bash
# Using PM2
npm install -g pm2
pm2 start src/server.js --name "polluted-cities-backend"

# Using Docker
docker build -t polluted-cities-backend .
docker run -p 3000:3000 polluted-cities-backend
```

## Testing

```bash
# Run tests
npm test

# Run tests in watch mode
npm run test:watch

# Run linting
npm run lint

# Fix linting issues
npm run lint:fix
```

## Performance Features

- **Multi-Layer Caching**: 
  - Pollution data caching (1 hour TTL)
  - Google Places validation caching (24 hours TTL)
  - Wikipedia descriptions caching (24 hours TTL)
- **Compression**: Gzip compression for responses
- **Rate Limiting**: Prevents API abuse
- **Concurrent Processing**: Parallel Wikipedia API calls with concurrency limits
- **Connection Pooling**: Optimized HTTP connections
- **Server-side Pagination**: Accurate pagination with exactly 9 items per page
- **Intelligent Deduplication**: Removes duplicates while keeping highest pollution values

## Security Features

- **Helmet.js**: Security headers
- **CORS**: Cross-origin resource sharing
- **Rate Limiting**: Request throttling
- **Input Validation**: Request validation
- **Error Sanitization**: Safe error responses

## Logging

The application uses Winston for logging with different configurations:

- **Development**: Colored console output with timestamps
- **Production**: JSON format with file rotation

Log levels: `error`, `warn`, `info`, `debug`

## Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Add tests
5. Run linting
6. Submit a pull request

## License

MIT License - see LICENSE file for details

## Support

For issues and questions:
1. Check the API documentation at `/docs`
2. Review the logs for error details
3. Check the health endpoint at `/health`
4. Open an issue in the repository

## API Rate Limits & Caching

- **Pollution API**: 3 retries with exponential backoff
- **Wikipedia API**: 2 retries with shorter delays, 5 concurrent requests max
- **Google Places API**: 24-hour caching to minimize API calls
- **Client Rate Limiting**: 100 requests per 15 minutes
- **Cache Management**: Clear cache endpoint for fresh data fetching

## Monitoring & Analytics

The application provides comprehensive monitoring and analytics:
- `/health` - Service health status
- `/docs` - API documentation
- **Validation Statistics**: Detailed logging of city validation results
- **Cache Performance**: Cache hit/miss ratios and TTL tracking
- **API Performance**: Response times and error rates for all external APIs
- **Duplicate Analytics**: Statistics on duplicate removal and pollution-based selection
- **Comprehensive Logging**: Structured logging with different levels for debugging

---

**Built with Node.js, Express, Google Places API, and best practices for production-ready applications.**

## Recent Updates

### v2.0.0 - Enhanced City Validation & Data Quality
- **Google Places API Integration**: Accurate city validation with place type checking
- **Canonical Name Correction**: Automatic typo correction and name standardization
- **Smart Duplicate Removal**: Intelligent deduplication with pollution-based selection
- **Enhanced Caching**: Multi-layer caching for optimal performance
- **Server-side Pagination**: Accurate pagination with exactly 9 items per page
- **Improved Error Handling**: Detailed error categorization and logging
- **Cache Management**: Clear cache endpoint for fresh data fetching


