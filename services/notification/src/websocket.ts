import { Server as SocketIOServer, Socket } from 'socket.io';
import { Server as HTTPServer } from 'http';
import Redis from 'ioredis';
import { createLogger } from '@battlescope/logger';
import { config } from './config';

const logger = createLogger('websocket');

export class WebSocketManager {
  private io: SocketIOServer;
  private redis: Redis;
  private userSockets: Map<string, Set<string>>; // userId -> Set of socketIds

  constructor(httpServer: HTTPServer) {
    this.io = new SocketIOServer(httpServer, {
      cors: {
        origin: config.cors.origin,
        credentials: true,
      },
      path: '/socket.io',
    });

    this.redis = new Redis({
      host: config.redis.host,
      port: config.redis.port,
      password: config.redis.password,
    });

    this.userSockets = new Map();

    this.setupEventHandlers();
  }

  private setupEventHandlers() {
    this.io.on('connection', (socket: Socket) => {
      logger.info('Client connected', { socketId: socket.id });

      // Handle authentication
      socket.on('authenticate', async (data: { userId: string; token?: string }) => {
        try {
          // In production, validate the token here
          // For now, we trust the userId from the client
          const userId = data.userId;

          if (!userId) {
            socket.emit('auth_error', { message: 'User ID required' });
            return;
          }

          // Store socket mapping
          if (!this.userSockets.has(userId)) {
            this.userSockets.set(userId, new Set());
          }
          this.userSockets.get(userId)!.add(socket.id);

          // Join user-specific room
          socket.join(`user:${userId}`);

          // Store in Redis for cross-instance communication
          await this.redis.sadd(`ws:user:${userId}`, socket.id);
          await this.redis.expire(`ws:user:${userId}`, 86400); // 24 hours

          socket.data.userId = userId;

          socket.emit('authenticated', { userId });
          logger.info('Client authenticated', { socketId: socket.id, userId });
        } catch (error) {
          logger.error('Authentication error', { error, socketId: socket.id });
          socket.emit('auth_error', { message: 'Authentication failed' });
        }
      });

      // Handle subscription to specific topics
      socket.on('subscribe', (data: { topic: string }) => {
        socket.join(data.topic);
        logger.debug('Client subscribed to topic', {
          socketId: socket.id,
          topic: data.topic,
        });
      });

      // Handle unsubscription
      socket.on('unsubscribe', (data: { topic: string }) => {
        socket.leave(data.topic);
        logger.debug('Client unsubscribed from topic', {
          socketId: socket.id,
          topic: data.topic,
        });
      });

      // Handle disconnection
      socket.on('disconnect', async () => {
        logger.info('Client disconnected', { socketId: socket.id });

        const userId = socket.data.userId;
        if (userId) {
          // Remove socket mapping
          const userSocketSet = this.userSockets.get(userId);
          if (userSocketSet) {
            userSocketSet.delete(socket.id);
            if (userSocketSet.size === 0) {
              this.userSockets.delete(userId);
            }
          }

          // Remove from Redis
          await this.redis.srem(`ws:user:${userId}`, socket.id);
        }
      });
    });
  }

  // Send notification to specific user
  async sendToUser(userId: string, notification: any): Promise<void> {
    try {
      // Send to all sockets for this user
      this.io.to(`user:${userId}`).emit('notification', notification);

      logger.debug('Sent notification to user', {
        userId,
        notificationId: notification.id,
      });
    } catch (error) {
      logger.error('Error sending notification to user', { error, userId });
    }
  }

  // Send notification to specific topic/room
  async sendToTopic(topic: string, notification: any): Promise<void> {
    try {
      this.io.to(topic).emit('notification', notification);

      logger.debug('Sent notification to topic', {
        topic,
        notificationId: notification.id,
      });
    } catch (error) {
      logger.error('Error sending notification to topic', { error, topic });
    }
  }

  // Broadcast to all connected clients
  async broadcast(notification: any): Promise<void> {
    try {
      this.io.emit('notification', notification);

      logger.debug('Broadcast notification', {
        notificationId: notification.id,
      });
    } catch (error) {
      logger.error('Error broadcasting notification', { error });
    }
  }

  // Get connected users count
  getConnectedUsersCount(): number {
    return this.userSockets.size;
  }

  // Get total connections count
  getTotalConnectionsCount(): number {
    let total = 0;
    for (const sockets of this.userSockets.values()) {
      total += sockets.size;
    }
    return total;
  }

  // Check if user is connected
  isUserConnected(userId: string): boolean {
    return this.userSockets.has(userId);
  }

  // Get socket count for user
  getUserSocketCount(userId: string): number {
    return this.userSockets.get(userId)?.size || 0;
  }

  // Close WebSocket server
  async close(): Promise<void> {
    logger.info('Closing WebSocket server...');

    // Disconnect all clients
    this.io.disconnectSockets();

    // Close Redis connection
    await this.redis.quit();

    logger.info('WebSocket server closed');
  }
}
