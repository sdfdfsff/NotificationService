const { connectRabbitMQ } = require("../rabbitmq");
const { Pool } = require("pg");

const pool = new Pool({
  user: process.env.POSTGRES_USER,
  host: process.env.POSTGRES_HOST,
  database: process.env.POSTGRES_DB,
  password: process.env.POSTGRES_PASSWORD,
  port: process.env.POSTGRES_PORT,
});

(async () => {
  const { channel } = await connectRabbitMQ("sms_notifications");
  console.log("SMS Service запущен и ожидает сообщений...");

  channel.consume("sms_notifications", async (msg) => {
    const notification = JSON.parse(msg.content.toString());
    const { id, recipient, message } = notification;

    try {
      console.log(
        `SMS отправлено на номер: ${recipient} с сообщением: ${message}`
      );

      await pool.query(
        "UPDATE notifications SET status = $1, updated_at = NOW() WHERE id = $2",
        ["delivered", id]
      );

      channel.ack(msg);
    } catch (error) {
      console.error(`Ошибка при обработке SMS ${id}:`, error);
      await pool.query(
        "UPDATE notifications SET status = $1, retries = retries + 1, updated_at = NOW() WHERE id = $2",
        ["error", id]
      );
      channel.ack(msg);
    }
  });
})();
