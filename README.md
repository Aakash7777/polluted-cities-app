# Polluted Cities Backend API

A Node.js/Express backend API for the Polluted Cities Dashboard that provides air quality data for cities worldwide.

## Features

- 🌍 Fetch pollution data from OpenAQ API
- 📊 City validation and filtering
- 📚 Wikipedia descriptions for cities
- 🗄️ SQLite database for caching and invalid cities tracking
- 🔒 Rate limiting and security features
- 📈 Health monitoring endpoints

## API Endpoints

- `GET /health` - Health check
- `GET /api/cities` - Get cities with pollution data
- `GET /api/countries` - Get available countries
- `GET /api/cities/history/:cityName` - Get city pollution history
- `POST /api/cities/:cityName/invalidate` - Mark city as invalid
- `GET /api/cities/invalid` - Get invalid cities list

## Deployment on Render

### Prerequisites
- GitHub repository with your code
- Render account

### Steps

1. **Fork/Clone this repository**

2. **Connect to Render:**
   - Go to [render.com](https://render.com)
   - Sign up/Login with GitHub
   - Click "New +" → "Web Service"

3. **Configure the service:**
   - **Name**: `polluted-cities-backend`
   - **Environment**: `Node`
   - **Build Command**: `npm install`
   - **Start Command**: `npm start`
   - **Plan**: `Free`

4. **Environment Variables:**
   - `NODE_ENV`: `production`
   - `PORT`: `10000` (Render will override this)

5. **Deploy:**
   - Click "Create Web Service"
   - Render will automatically deploy your app

### Environment Variables (Optional)

```env
NODE_ENV=production
PORT=10000
OPENAQ_API_KEY=your_openaq_api_key_here
WIKIPEDIA_API_BASE_URL=https://en.wikipedia.org/api/rest_v1/page/summary
```

## Local Development

```bash
# Install dependencies
npm install

# Start development server
npm run dev

# Start production server
npm start
```

## Database

The application uses SQLite database (`data/cities.db`) for:
- Invalid cities tracking
- Pollution history caching
- City locations data

## Health Check

Visit `/health` endpoint to check if the service is running properly.

## API Documentation

Visit `/docs` endpoint for detailed API documentation.


