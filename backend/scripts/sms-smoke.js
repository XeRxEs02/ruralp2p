const twilio = require("twilio");
const client = twilio(process.env.TWILIO_ACCOUNT_SID, process.env.TWILIO_AUTH_TOKEN);
(async () => {
  const r = await client.messages.create({
    body: "RuralConnect live SMS test ✅",
    from: process.env.TWILIO_PHONE_NUMBER,
    to: process.env.TEST_SMS_TO || "+91XXXXXXXXXX"
  });
  console.log({ sid: r.sid, status: r.status });
})();
