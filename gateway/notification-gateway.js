const express = require("express");
const amqp = require("amqplib");
const { Pool } = require("pg");
require("dotenv").config();

const app = express();
const port = process.env.PORT || 3000;

const pool = new Pool({
  user: process.env.POSTGRES_USER,
  host: process.env.POSTGRES_HOST,
  database: process.env.POSTGRES_DB,
  password: process.env.POSTGRES_PASSWORD,
  port: process.env.POSTGRES_PORT,
});

app.use(express.json());

const rabbitMqUrl = process.env.RABBITMQ_URL;
let channel;

(async () => {
  const connection = await amqp.connect(rabbitMqUrl);
  channel = await connection.createChannel();
  await channel.assertQueue("notifications");
  await channel.assertQueue("push_notifications");
  console.log("RabbitMQ подключен.");
})();

app.post("/send", async (req, res) => {
  const {
    recipient,
    channel: notificationChannel,
    message,
    subscription,
  } = req.body;

  if (!recipient || !notificationChannel || !message) {
    return res
      .status(400)
      .send({ error: "Все поля (recipient, channel, message) обязательны." });
  }

  try {
    const result = await pool.query(
      "INSERT INTO notifications (recipient, channel, message, status, retries, created_at, updated_at) VALUES ($1, $2, $3, $4, $5, NOW(), NOW()) RETURNING *",
      [recipient, notificationChannel, message, "pending", 0]
    );

    const notification = result.rows[0];
    if (notificationChannel === "push" && subscription) {
      notification.recipient = JSON.stringify(subscription);
    }

    const queueName =
      notificationChannel === "email"
        ? "notifications"
        : notificationChannel === "push"
        ? "push_notifications"
        : null;

    if (!queueName) {
      return res
        .status(400)
        .send({ error: "Неподдерживаемый канал уведомлений." });
    }

    channel.sendToQueue(queueName, Buffer.from(JSON.stringify(notification)));

    res.status(201).send({
      message: "Уведомление отправлено в обработку.",
      notification,
    });
  } catch (error) {
    console.error("Ошибка:", error);
    res.status(500).send({ error: "Ошибка обработки уведомления." });
  }
});

app.listen(port, () => {
  console.log(`Notification Gateway запущен на http://localhost:${port}`);
});
