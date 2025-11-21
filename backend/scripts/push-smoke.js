const admin = require("firebase-admin");
const service = require("../firebase-adminsdk.json");
admin.initializeApp({ credential: admin.credential.cert(service) });

const token = process.env.TEST_FCM_TOKEN;
(async () => {
  const res = await admin.messaging().send({
    token,
    notification: { title: "RuralConnect Live", body: "Real FCM push test ✅" },
    data: { type: "smoke" }
  });
  console.log({ messageId: res });
})();
