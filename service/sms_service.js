const amqp = require("amqplib");
const winston = require("winston");
const { Pool } = require("pg");

class SMSService {
  constructor() {
    this.RABBITMQ_URL = process.env.RABBITMQ_URL || "amqp://localhost";
    this.QUEUE_NAME = "sms_notifications";
    this.DB_CONFIG = {
      user: process.env.DB_USER || "postgres",
      host: process.env.DB_HOST || "localhost",
      database: process.env.DB_NAME || "notifications_db",
      password: process.env.DB_PASS || "123",
      port: process.env.DB_PORT || 5432,
    };

    this.logger = winston.createLogger({
      level: "info",
      format: winston.format.json(),
      transports: [
        new winston.transports.Console(),
        new winston.transports.File({ filename: "logs/sms_service.log" }),
      ],
    });

    this.pool = new Pool(this.DB_CONFIG);
  }

  async initializeDatabase() {
    const client = await this.pool.connect();
    try {
      await client.query(`
        CREATE TABLE IF NOT EXISTS notifications (
          id SERIAL PRIMARY KEY,
          type VARCHAR(50) NOT NULL,
          recipient VARCHAR(255) NOT NULL,
          message TEXT NOT NULL,
          status VARCHAR(50) NOT NULL DEFAULT 'pending',
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        );
      `);
      this.logger.info("Database initialized successfully.");
    } catch (err) {
      this.logger.error("Error initializing database:", err);
      throw err;
    } finally {
      client.release();
    }
  }

  async saveNotificationToDB(notification, status) {
    const client = await this.pool.connect();
    try {
      const result = await client.query(
        "INSERT INTO notifications (type, recipient, message, status) VALUES ($1, $2, $3, $4) RETURNING id",
        [
          notification.type,
          notification.recipient,
          notification.message,
          status,
        ]
      );
      this.logger.info(
        `Notification saved to DB with ID: ${result.rows[0].id}`
      );
      return result.rows[0].id;
    } catch (err) {
      this.logger.error("Error saving notification to DB:", err);
      throw err;
    } finally {
      client.release();
    }
  }

  async updateNotificationStatus(notificationId, status) {
    const client = await this.pool.connect();
    try {
      await client.query(
        "UPDATE notifications SET status = $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2",
        [status, notificationId]
      );
    } catch (err) {
      this.logger.error("Error updating notification status:", err);
      throw err;
    } finally {
      client.release();
    }
  }

  async sendSMS({ recipient, message }) {
    if (!/^\+?\d+$/.test(recipient)) {
      throw new Error("Invalid recipient");
    }

    this.logger.info(`Sending SMS to ${recipient}: ${message}`);
    await new Promise((resolve) => setTimeout(resolve, 1000)); // Симуляция отправки
    this.logger.info("SMS sent successfully.");
  }

  async initializeRabbitMQ() {
    try {
      const connection = await amqp.connect(this.RABBITMQ_URL);
      const channel = await connection.createChannel();
      await channel.assertQueue(this.QUEUE_NAME, { durable: true });

      channel.consume(this.QUEUE_NAME, async (msg) => {
        if (msg) {
          const notification = JSON.parse(msg.content.toString());
          this.logger.info(
            `Received SMS notification: ${msg.content.toString()}`
          );

          try {
            await this.sendSMS(notification);
            await this.updateNotificationStatus(notification.id, "sent");
            channel.ack(msg); // Подтверждаем обработку сообщения
          } catch (error) {
            this.logger.error(
              `Error processing SMS notification: ${error.message}`
            );
            // ack не вызывается, сообщение останется в очереди
          }
        }
      });

      this.logger.info(
        "RabbitMQ consumer is running and listening for SMS notifications..."
      );
    } catch (err) {
      this.logger.error(`Error initializing RabbitMQ: ${err.message}`);
      throw err;
    }
  }

  async initialize() {
    await this.initializeDatabase();
    await this.initializeRabbitMQ();
    this.logger.info("SMS Service is running");
  }
}

(async () => {
  const smsService = new SMSService();
  await smsService.initialize();
})();

module.exports = new SMSService();
