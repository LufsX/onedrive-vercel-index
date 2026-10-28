import axios from 'axios'

// Extend axios config type to include metadata
declare module 'axios' {
  export interface InternalAxiosRequestConfig {
    metadata?: { startTime: number }
  }
}

// Create axios instance with optimized settings
const axiosInstance = axios.create({
  timeout: 10000, // 10 second timeout
  headers: {
    'Content-Type': 'application/json',
  },
  // HTTP keep-alive for connection reuse
  httpAgent: undefined, // Will be set conditionally below
  httpsAgent: undefined,
})

// Only add agents in Node.js environment (server-side)
if (typeof window === 'undefined') {
  const http = require('http')
  const https = require('https')

  // Configure keep-alive for better performance
  axiosInstance.defaults.httpAgent = new http.Agent({
    keepAlive: true,
    keepAliveMsecs: 30000,
    maxSockets: 50,
    maxFreeSockets: 10,
    timeout: 60000,
  })

  axiosInstance.defaults.httpsAgent = new https.Agent({
    keepAlive: true,
    keepAliveMsecs: 30000,
    maxSockets: 50,
    maxFreeSockets: 10,
    timeout: 60000,
    // Reuse TLS sessions for better performance
    rejectUnauthorized: true,
  })
}

// Request interceptor for logging and debugging
axiosInstance.interceptors.request.use(
  config => {
    // Add request timestamp for performance monitoring
    config.metadata = { startTime: Date.now() }
    return config
  },
  error => {
    return Promise.reject(error)
  },
)

// Response interceptor for logging and error handling
axiosInstance.interceptors.response.use(
  response => {
    // Calculate request duration
    const duration = Date.now() - (response.config.metadata?.startTime || 0)
    if (duration > 2000) {
      console.warn(`Slow request: ${response.config.url} took ${duration}ms`)
    }
    return response
  },
  error => {
    // Enhanced error logging
    if (error.response) {
      console.error(`API Error: ${error.response.status} - ${error.config?.url}`)
    } else if (error.request) {
      console.error(`Network Error: No response received - ${error.config?.url}`)
    }
    return Promise.reject(error)
  },
)

export default axiosInstance
