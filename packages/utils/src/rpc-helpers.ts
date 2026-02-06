import type { BirpcOptions } from 'birpc'
import { parse, stringify } from 'flatted'

/**
 * Configuration for creating WebSocket RPC handlers
 */
export interface WebSocketRpcConfig<Methods> {
  /** WebSocket instance or message sender */
  sender: {
    send: (msg: string) => void
  }
  /** Message receiver registration */
  receiver: {
    on: (event: string, handler: (data: any) => void) => void
  }
  /** Optional event names to broadcast */
  eventNames?: string[]
  /** Custom timeout in milliseconds, -1 for no timeout */
  timeout?: number
}

/**
 * Creates standardized birpc options for WebSocket communication
 * with consistent error handling and serialization
 */
export function createWebSocketRpcOptions<Methods>(
  config: WebSocketRpcConfig<Methods>,
): Pick<BirpcOptions<Methods>, 'post' | 'on' | 'serialize' | 'deserialize' | 'timeout' | 'eventNames'> {
  const { sender, receiver, eventNames, timeout = -1 } = config

  return {
    post: (message) => {
      sender.send(message)
    },
    on: (handler) => {
      receiver.on('message', handler)
    },
    serialize: (data) => {
      return stringify(data, (_key, val) => {
        // Handle Error objects specially to preserve properties
        if (val instanceof Error) {
          const errorData: Record<string, any> = {
            __errorType: val.constructor.name,
            errorMessage: val.message,
            errorStack: val.stack,
          }
          
          // Capture additional enumerable properties
          for (const prop of Object.keys(val)) {
            errorData[prop] = (val as any)[prop]
          }
          
          return errorData
        }
        return val
      })
    },
    deserialize: parse,
    timeout,
    ...(eventNames && { eventNames }),
  }
}

/**
 * Configuration for WebSocket client with auto-reconnect
 */
export interface ReconnectConfig {
  enabled: boolean
  intervalMs: number
  maxAttempts: number
  timeoutMs: number
}

/**
 * Manages WebSocket reconnection logic
 */
export class ReconnectionManager {
  private attemptsRemaining: number
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null
  private connectionPromise: Promise<void> | null = null

  constructor(
    private config: ReconnectConfig,
    private createSocket: () => any,
    private registerHandlers: () => void,
  ) {
    this.attemptsRemaining = config.maxAttempts
  }

  initiateConnection(): Promise<void> {
    this.connectionPromise = new Promise((resolve, reject) => {
      const socket = this.createSocket()
      const timeoutHandle = setTimeout(() => {
        reject(new Error(
          `WebSocket connection timeout after ${this.config.timeoutMs}ms`,
        ))
      }, this.config.timeoutMs)

      const onOpen = () => {
        this.attemptsRemaining = this.config.maxAttempts
        clearTimeout(timeoutHandle)
        resolve()
      }

      if (socket.readyState === 1 || socket.OPEN === socket.readyState) {
        onOpen()
      }
      else {
        socket.addEventListener?.('open', onOpen) || socket.on?.('open', onOpen)
      }
    })

    this.registerHandlers()
    return this.connectionPromise
  }

  handleDisconnect(onReconnect: () => void): void {
    if (!this.config.enabled || this.attemptsRemaining <= 0) {
      return
    }

    this.attemptsRemaining--
    
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer)
    }

    this.reconnectTimer = setTimeout(() => {
      onReconnect()
    }, this.config.intervalMs)
  }

  reset(): void {
    this.attemptsRemaining = this.config.maxAttempts
  }

  cleanup(): void {
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer)
      this.reconnectTimer = null
    }
  }
}
