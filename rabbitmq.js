const amqp = require("amqplib");

const connectRabbitMQ = async (queueName) => {
  const connection = await amqp.connect(process.env.RABBITMQ_URL);
  const channel = await connection.createChannel();
  await channel.assertQueue(queueName);
  return { channel };
};

module.exports = { connectRabbitMQ };
