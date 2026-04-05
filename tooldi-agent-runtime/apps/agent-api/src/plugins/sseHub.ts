import type { FastifyPluginAsync } from "fastify";

import type { PublicRunEvent } from "@tooldi/agent-contracts";

export interface BufferedSseEvent {
  eventId: string;
  event: PublicRunEvent;
}

export type SseListener = (bufferedEvent: BufferedSseEvent) => void;

export interface SseHub {
  publish(runId: string, bufferedEvent: BufferedSseEvent): Promise<number>;
  getBufferedEvents(runId: string, afterEventId?: string): Promise<BufferedSseEvent[]>;
  subscribe(runId: string, listener: SseListener): () => void;
}

class InMemorySseHub implements SseHub {
  private readonly listeners = new Map<string, Set<SseListener>>();
  private readonly buffers = new Map<string, BufferedSseEvent[]>();

  async publish(runId: string, bufferedEvent: BufferedSseEvent): Promise<number> {
    const buffer = this.buffers.get(runId) ?? [];
    buffer.push(bufferedEvent);
    this.buffers.set(runId, buffer);

    const listeners = this.listeners.get(runId);
    if (!listeners) {
      return 0;
    }

    for (const listener of listeners) {
      listener(bufferedEvent);
    }
    return listeners.size;
  }

  async getBufferedEvents(
    runId: string,
    afterEventId?: string,
  ): Promise<BufferedSseEvent[]> {
    const buffer = this.buffers.get(runId) ?? [];
    if (!afterEventId) {
      return [...buffer];
    }

    const index = buffer.findIndex((entry) => entry.eventId === afterEventId);
    if (index < 0) {
      return [...buffer];
    }
    return buffer.slice(index + 1);
  }

  subscribe(runId: string, listener: SseListener): () => void {
    const listeners = this.listeners.get(runId) ?? new Set<SseListener>();
    listeners.add(listener);
    this.listeners.set(runId, listeners);

    return () => {
      const current = this.listeners.get(runId);
      if (!current) {
        return;
      }
      current.delete(listener);
      if (current.size === 0) {
        this.listeners.delete(runId);
      }
    };
  }
}

export const sseHubPlugin: FastifyPluginAsync = async (app) => {
  app.decorate("sseHub", new InMemorySseHub());
};
