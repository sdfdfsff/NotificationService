const amqp = require("amqplib");
const nodemailer = require("nodemailer");
require("dotenv").config();

const rabbitMqUrl = process.env.RABBITMQ_URL;
let channel;

(async () => {
  const connection = await amqp.connect(rabbitMqUrl);
  channel = await connection.createChannel();
  await channel.assertQueue("email_notifications");

  channel.consume("email_notifications", async (msg) => {
    const notification = JSON.parse(msg.content.toString());

    try {
      const transporter = nodemailer.createTransport({
        service: "Yandex",
        auth: {
          user: process.env.EMAIL_SERVICE_USER,
          pass: process.env.EMAIL_SERVICE_PASSWORD,
        },
      });

      const mailOptions = {
        from: process.env.EMAIL_SERVICE_USER,
        to: notification.recipient,
        subject: "Уведомление",
        text: notification.message,
      };

      await transporter.sendMail(mailOptions);
      console.log(`Email отправлен: ${notification.id}`);
    } catch (error) {
      console.error(`Ошибка: ${error.message}`);
    }
  });
})();
