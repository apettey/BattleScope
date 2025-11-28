import { Kafka, Producer, Consumer, logLevel } from 'kafkajs';
import type { Event } from '@battlescope/types';

export interface EventBusConfig {
  brokers: string[];
  clientId: string;
  groupId?: string;
}

export class EventBus {
  private kafka: Kafka;
  private producer: Producer | null = null;
  private consumer: Consumer | null = null;

  constructor(config: EventBusConfig) {
    this.kafka = new Kafka({
      clientId: config.clientId,
      brokers: config.brokers,
      logLevel: logLevel.ERROR,
      retry: {
        initialRetryTime: 300,
        retries: 8,
      },
    });
  }

  async getProducer(): Promise<Producer> {
    if (!this.producer) {
      this.producer = this.kafka.producer();
      await this.producer.connect();
    }
    return this.producer;
  }

  async getConsumer(groupId: string): Promise<Consumer> {
    if (!this.consumer) {
      this.consumer = this.kafka.consumer({ groupId });
      await this.consumer.connect();
    }
    return this.consumer;
  }

  async publish(topic: string, event: Event, partitionKey?: string): Promise<void> {
    const producer = await this.getProducer();
    await producer.send({
      topic,
      messages: [
        {
          key: partitionKey || event.type,
          value: JSON.stringify({
            ...event,
            timestamp: event.timestamp.toISOString(),
          }),
        },
      ],
    });
  }

  async subscribe(
    topic: string,
    groupId: string,
    handler: (event: Event) => Promise<void>
  ): Promise<void> {
    const consumer = await this.getConsumer(groupId);
    await consumer.subscribe({ topic, fromBeginning: true });

    await consumer.run({
      eachMessage: async ({ message }) => {
        if (!message.value) return;

        try {
          const raw = JSON.parse(message.value.toString());
          const event: Event = {
            ...raw,
            timestamp: new Date(raw.timestamp),
            data: {
              ...raw.data,
              // Convert date strings back to Date objects if needed
              ...(raw.data.killmailTime && { killmailTime: new Date(raw.data.killmailTime) }),
              ...(raw.data.startTime && { startTime: new Date(raw.data.startTime) }),
              ...(raw.data.endTime && { endTime: new Date(raw.data.endTime) }),
            },
          };

          await handler(event);
        } catch (error) {
          console.error('Failed to process event:', error);
        }
      },
    });
  }

  async disconnect(): Promise<void> {
    if (this.producer) {
      await this.producer.disconnect();
      this.producer = null;
    }
    if (this.consumer) {
      await this.consumer.disconnect();
      this.consumer = null;
    }
  }
}

export function getEventBusConfigFromEnv(): EventBusConfig {
  const brokers = process.env.KAFKA_BROKERS?.split(',') || ['localhost:9092'];
  const clientId = process.env.KAFKA_CLIENT_ID || 'battlescope';

  return {
    brokers,
    clientId,
  };
}

// Topic constants
export const Topics = {
  KILLMAILS: 'killmails',
  KILLMAILS_ENRICHED: 'killmails-enriched',
  BATTLES: 'battles',
  NOTIFICATIONS: 'notifications',
} as const;
