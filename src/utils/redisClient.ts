import Redis from 'ioredis'

// Reuse one connection per module instance; Vercel instances do not share it.
let redisClient: Redis | null = null

export function getRedisClient(): Redis {
  if (!redisClient) {
    const redisUrl = process.env.REDIS_URL?.trim()
    if (!redisUrl) {
      throw Object.assign(new Error('Redis is not configured.'), { code: 'redis_not_configured' })
    }

    let parsed: URL
    try {
      parsed = new URL(redisUrl)
      if ((parsed.protocol !== 'redis:' && parsed.protocol !== 'rediss:') || !parsed.hostname) {
        throw new Error()
      }
      // ioredis decodes credentials before connecting; reject malformed escapes here as well.
      decodeURIComponent(parsed.username)
      decodeURIComponent(parsed.password)
    } catch {
      throw Object.assign(new Error('Redis URL configuration is invalid.'), { code: 'redis_invalid_url' })
    }

    redisClient = new Redis(parsed.href, {
      maxRetriesPerRequest: 3,
      // Managed Redis commands report availability without an extra INFO on every connection.
      enableReadyCheck: false,
      disableClientInfo: true,
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
      lazyConnect: true,

      // Command timeout
      commandTimeout: 5000,
    })

    // Error handling
    redisClient.on('error', () => {
      // Redis errors may include command arguments such as AUTH credentials.
      console.error('Redis Client Error: connection or command failed')
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
