import { randomUUID } from 'node:crypto';
import { Kafka, logLevel } from 'kafkajs';

// Each disposable application owns one ordered partition and rebuilds its view.
// A fresh group prevents a committed offset from skipping projection history.
export async function connectLog({ topic, group, onEvent }) {
  const kafka = new Kafka({
    clientId: group,
    brokers: (process.env.KAFKA_BROKERS || 'redpanda:9092').split(','),
    logLevel: logLevel.ERROR,
    requestTimeout: 30000,
  });
  const admin = kafka.admin();
  const producer = kafka.producer({ idempotent: true, maxInFlightRequests: 1, allowAutoTopicCreation: false });
  const consumer = kafka.consumer({ groupId: `${group}-${randomUUID()}`, allowAutoTopicCreation: false });
  const pendingSends = new Set();
  let closing = false;
  let resolveReady, rejectReady;
  const ready = new Promise((resolve, reject) => { resolveReady = resolve; rejectReady = reject; });
  // Attach a rejection observer before the caller receives this promise.
  ready.catch(() => {});
  try {
    await admin.connect();
    const offsets = await admin.fetchTopicOffsets(topic);
    if (offsets.length !== 1 || offsets[0].partition !== 0) throw new Error(`${topic} must have exactly one partition`);
    if (BigInt(offsets[0].low) !== 0n) throw new Error(`${topic} history has expired; dispose of this lab before rebuilding its projection`);
    const replayEnd = BigInt(offsets[0].high);
    await admin.disconnect();
    await producer.connect();
    await consumer.connect();
    consumer.on(consumer.events.GROUP_JOIN, ({ payload }) => {
      if (replayEnd === 0n && payload.memberAssignment[topic]?.includes(0)) resolveReady();
    });
    consumer.on(consumer.events.CRASH, ({ payload }) => {
      rejectReady(payload.error);
      console.error('Authoritative log consumer failed:', payload.error);
      // Continuing to accept commands with a stopped projection is unsafe.
      process.exitCode = 1;
      void consumer.disconnect().finally(() => process.exit(1));
    });
    await consumer.subscribe({ topic, fromBeginning: true });
    await consumer.run({ eachMessage: async ({ partition, message }) => {
      if (message.value === null) throw new Error('Tombstones are not valid application events');
      await onEvent(JSON.parse(message.value.toString()), {
        key: message.key?.toString() ?? '', partition, offset: message.offset,
      });
      if (BigInt(message.offset) + 1n >= replayEnd) resolveReady();
    } });
    return {
      ready,
      async append(key, value) {
        if (closing) throw new Error('Log owner is closing');
        let deadline;
        const timeout = new Promise((_, reject) => {
          deadline = setTimeout(() => reject(new Error('Kafka acknowledgment timed out; completion is unknown')), 30000);
        });
        try {
          const send = producer.send({ topic, acks: -1, messages: [{ key, value: JSON.stringify(value) }] });
          pendingSends.add(send);
          void send.then(() => pendingSends.delete(send), () => pendingSends.delete(send));
          await Promise.race([send, timeout]);
        } catch (error) {
          error.outcomeUnknown = true;
          throw error;
        } finally {
          clearTimeout(deadline);
        }
      },
      async close() {
        closing = true;
        // An HTTP deadline does not cancel KafkaJS retries. Settle them before
        // disconnect/replay can establish a new writer's recovery boundary.
        for (const send of pendingSends) {
          try { await send; } catch { /* Append already reported an unknown outcome. */ }
        }
        await consumer.disconnect();
        await producer.disconnect();
      },
    };
  } catch (error) {
    rejectReady(error);
    await Promise.allSettled([admin.disconnect(), consumer.disconnect(), producer.disconnect()]);
    throw error;
  }
}
