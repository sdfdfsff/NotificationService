const amqp = require("amqplib");
const nodemailer = require("nodemailer");
const winston = require("winston");
const { Pool } = require("pg");

class EmailService {
  constructor() {
    this.RABBITMQ_URL = process.env.RABBITMQ_URL || "amqp://localhost";
    this.QUEUE_NAME = "email";
    this.EMAIL_SERVICE_CONFIG = {
      host: process.env.EMAIL_HOST || "smtp.yandex.ru",
      port: process.env.EMAIL_PORT || 587,
      secure: false,
      auth: {
        user: process.env.EMAIL_USER || "iniyasd@yandex.ru",
        pass: process.env.EMAIL_PASS || "pvfoofckqgwxnuib",
      },
    };

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
        new winston.transports.File({ filename: "logs/email_service.log" }),
      ],
    });

    this.pool = new Pool(this.DB_CONFIG);
    this.transporter = nodemailer.createTransport(this.EMAIL_SERVICE_CONFIG);
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

  async connectRabbitMQ() {
    try {
      const connection = await amqp.connect(this.RABBITMQ_URL);
      const channel = await connection.createChannel();
      await channel.assertQueue(this.QUEUE_NAME, { durable: true });
      this.logger.info(
        `Connected to RabbitMQ, listening to queue: ${this.QUEUE_NAME}`
      );

      channel.consume(this.QUEUE_NAME, async (msg) => {
        if (msg) {
          const notification = JSON.parse(msg.content.toString());
          this.logger.info(
            `Received notification: ${JSON.stringify(notification)}`
          );

          try {
            await this.updateNotificationStatus(notification.id, "pending");
            await this.sendEmail(notification);
            await this.updateNotificationStatus(notification.id, "sent");
            channel.ack(msg);
          } catch (err) {
            this.logger.error(`Failed to process notification: ${err.message}`);
            if (msg.fields.redelivered) {
              channel.nack(msg, false, false);
            } else {
              channel.nack(msg, false, true);
            }
          }
        }
      });
    } catch (err) {
      this.logger.error("Failed to connect to RabbitMQ:", err);
      throw err;
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

  async sendEmail({ recipient, message }) {
    const mailOptions = {
      from: this.EMAIL_SERVICE_CONFIG.auth.user,
      to: recipient,
      subject: "Notification",
      text: message,
    };

    try {
      const info = await this.transporter.sendMail(mailOptions);
      this.logger.info(`Email sent: ${info.messageId}`);
    } catch (err) {
      this.logger.error(`Error sending email: ${err.message}`);
      throw err;
    }
  }

  async initialize() {
    await this.initializeDatabase();
    await this.connectRabbitMQ();
    this.logger.info("Email Service is running");
  }
}

(async () => {
  const emailService = new EmailService();
  await emailService.initialize();
})();

module.exports = new EmailService();
