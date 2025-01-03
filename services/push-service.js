const { connectRabbitMQ } = require("../rabbitmq");
const webPush = require("web-push");
const { Pool } = require("pg");
require("dotenv").config();

const pool = new Pool({
  user: process.env.POSTGRES_USER,
  host: process.env.POSTGRES_HOST,
  database: process.env.POSTGRES_DB,
  password: process.env.POSTGRES_PASSWORD,
  port: process.env.POSTGRES_PORT,
});

webPush.setVapidDetails(
  `mailto:${process.env.ADMIN_EMAIL}`,
  process.env.VAPID_PUBLIC_KEY,
  process.env.VAPID_PRIVATE_KEY
);

(async () => {
  const { channel } = await connectRabbitMQ("push_notifications");
  console.log("Push Service запущен и ожидает сообщений...");

  channel.consume("push_notifications", async (msg) => {
    const notification = JSON.parse(msg.content.toString());
    const { id, recipient, message } = notification;

    try {
      const subscription = JSON.parse(recipient);

      // Проверка длины ключей
      if (
        !subscription.keys ||
        subscription.keys.p256dh.length !== 65 ||
        subscription.keys.auth.length !== 22
      ) {
        throw new Error("Некорректный формат подписки (p256dh/auth).");
      }

      await webPush.sendNotification(subscription, message);

      await pool.query(
        "UPDATE notifications SET status = $1, updated_at = NOW() WHERE id = $2",
        ["delivered", id]
      );

      console.log(`Push-уведомление доставлено: ${id}`);
      channel.ack(msg);
    } catch (error) {
      console.error(`Ошибка при обработке push-уведомления ${id}:`, error);
      await pool.query(
        "UPDATE notifications SET status = $1, retries = retries + 1, updated_at = NOW() WHERE id = $2",
        ["error", id]
      );
      channel.ack(msg);
    }
  });
})();
