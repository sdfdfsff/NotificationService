const express = require("express");
const swaggerUi = require("swagger-ui-express");
const fs = require("fs");
const path = require("path");
const emailService = require("./service/email_service");
const smsService = require("./service/sms_service");
const pushService = require("./service/push_service");

const app = express();
app.use(express.json());

const swaggerDocument = JSON.parse(
  fs.readFileSync(path.join(__dirname, "swagger.json"), "utf-8")
);
app.use("/api-docs", swaggerUi.serve, swaggerUi.setup(swaggerDocument));

// Email
app.post("/email", async (req, res) => {
  const { recipient, message } = req.body;
  try {
    const notification = { type: "email", recipient, message };
    const notificationId = await emailService.saveNotificationToDB(
      notification,
      "pending"
    );
    await emailService.sendEmail({ recipient, message });
    await emailService.updateNotificationStatus(notificationId, "sent");
    res.status(200).send("Email sent successfully");
  } catch (error) {
    res.status(500).send(`Failed to send email: ${error.message}`);
  }
});

// Push
app.post("/push", async (req, res) => {
  const { recipient, message, media } = req.body;
  try {
    const notification = { type: "push", recipient, message };
    const notificationId = await pushService.saveNotificationToDB(
      notification,
      "pending"
    );
    await pushService.sendPushNotification({ recipient, message, media });
    await pushService.updateNotificationStatus(notificationId, "sent");
    res.status(200).send("Push notification sent successfully");
  } catch (error) {
    res.status(500).send(`Failed to send push notification: ${error.message}`);
  }
});

// SMS
app.post("/sms", async (req, res) => {
  const { recipient, message } = req.body;
  try {
    const notification = { type: "sms", recipient, message };
    const notificationId = await smsService.saveNotificationToDB(
      notification,
      "pending"
    );
    await smsService.sendSMS({ recipient, message });
    await smsService.updateNotificationStatus(notificationId, "sent");
    res.status(200).send("SMS sent successfully");
  } catch (error) {
    res.status(500).send(`Failed to send SMS: ${error.message}`);
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Unified service running on port ${PORT}`);
  console.log(`Swagger docs available at http://localhost:${PORT}/api-docs`);
});
