import { Kafka } from 'kafkajs';

let consumer = null;

export async function initKafkaConsumer(onMessage) {
  const brokers = process.env.KAFKA_BROKERS ? process.env.KAFKA_BROKERS.split(',') : ['localhost:9092'];
  
  const kafka = new Kafka({
    clientId: 'anviksha-scoring-engine',
    brokers: brokers,
  });

  consumer = kafka.consumer({ groupId: 'scoring-group' });

  try {
    await consumer.connect();
    console.log('[KAFKA] Connected to Redpanda/Kafka broker at', brokers);
    
    await consumer.subscribe({ topic: 'raw_transactions', fromBeginning: false });
    
    await consumer.run({
      eachMessage: async ({ topic, partition, message }) => {
        try {
          const transaction = JSON.parse(message.value.toString());
          // Pass the transaction back to the main app loop
          await onMessage(transaction);
        } catch (err) {
          console.error('[KAFKA] Error parsing message:', err.message);
        }
      },
    });
    
    console.log('[KAFKA] Consumer listening on topic: raw_transactions');
  } catch (err) {
    console.error('[KAFKA] Failed to connect to broker. Running in standalone generator mode.', err.message);
    consumer = null;
  }
}

export async function stopKafkaConsumer() {
  if (consumer) {
    await consumer.disconnect();
    console.log('[KAFKA] Consumer disconnected');
  }
}
