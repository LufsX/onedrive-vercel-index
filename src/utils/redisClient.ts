import Redis from 'ioredis'

// Singleton Redis client with connection pooling and optimization
let redisClient: Redis | null = null

export function getRedisClient(): Redis {
  if (!redisClient) {
    const redisUrl = process.env.REDIS_URL || ''

    redisClient = new Redis(redisUrl, {
      // Connection pool settings for better performance
      maxRetriesPerRequest: 3,
      enableReadyCheck: true,
      enableOfflineQueue: true,

      // Connection timeout optimizations
      connectTimeout: 10000,

      // Retry strategy for better reliability
      retryStrategy(times) {
        const delay = Math.min(times * 50, 2000)
        return delay
      },

      // Keep connection alive
      keepAlive: 30000,

      // Lazy connection - only connect when needed
      lazyConnect: false,

      // Command timeout
      commandTimeout: 5000,
    })

    // Error handling
    redisClient.on('error', err => {
      console.error('Redis Client Error:', err)
    })

    redisClient.on('connect', () => {
      console.log('Redis Client Connected')
    })
  }

  return redisClient
}

// Graceful shutdown
export async function closeRedisClient(): Promise<void> {
  if (redisClient) {
    await redisClient.quit()
    redisClient = null
  }
}
