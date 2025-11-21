/**
 * Twilio SMS Test Script
 * Run this to test your Twilio SMS configuration
 */

const twilioService = require('./services/twilioService');

async function testTwilioSMS() {
  console.log('🧪 Testing Twilio SMS Configuration...\n');

  try {
    // Test 1: Check service status
    console.log('1️⃣ Checking Twilio Service Status:');
    const status = twilioService.getStatus();
    console.log('   Mock Mode:', status.mockMode ? 'YES' : 'NO');
    console.log('   From Number:', status.fromNumber || 'Not set');
    console.log('   Templates:', status.templatesCount);
    console.log('');

    // Test 2: Validate a phone number
    console.log('2️⃣ Testing Phone Number Validation:');
    const testPhone = '+919876543210'; // Replace with your phone number
    const validation = await twilioService.validatePhoneNumber(testPhone);
    console.log('   Phone:', testPhone);
    console.log('   Valid:', validation.valid ? 'YES' : 'NO');
    if (validation.valid) {
      console.log('   Formatted:', validation.formattedNumber);
    } else {
      console.log('   Error:', validation.error);
    }
    console.log('');

    // Test 3: Send test SMS (only if not in mock mode)
    if (!status.mockMode) {
      console.log('3️⃣ Sending Test SMS:');
      const smsResult = await twilioService.sendSMS({
        to: testPhone, // Replace with your verified phone number
        message: '🧪 Twilio SMS Test from RuralConnect! Your SMS is working perfectly.',
        type: 'test'
      });

      console.log('   Success:', smsResult.success ? 'YES' : 'NO');
      if (smsResult.success) {
        console.log('   Message ID:', smsResult.messageId);
        console.log('   Status:', smsResult.status);
        console.log('   To:', smsResult.to);
      } else {
        console.log('   Error: SMS sending failed');
      }
    } else {
      console.log('3️⃣ Mock SMS Test:');
      console.log('   SMS would be sent to:', testPhone);
      console.log('   Check terminal output above for mock SMS content');
    }
    console.log('');

    // Test 4: Show available templates
    console.log('4️⃣ Available SMS Templates:');
    const templates = twilioService.getTemplates();
    Object.keys(templates).forEach(key => {
      console.log(`   ${key}: ${templates[key].substring(0, 50)}...`);
    });

  } catch (error) {
    console.error('❌ Test failed:', error.message);
  }
}

// Instructions
console.log('📱 Twilio SMS Setup Instructions:');
console.log('================================');
console.log('');
console.log('1. Go to https://www.twilio.com/console');
console.log('2. Sign up for a free trial account');
console.log('3. Get your Account SID and Auth Token from Dashboard');
console.log('4. Buy a phone number ($1/month) from Phone Numbers > Manage');
console.log('5. Verify your phone number for testing');
console.log('6. Update .env file with real credentials');
console.log('7. Set TWILIO_MOCK_MODE=false');
console.log('8. Restart the server');
console.log('9. Run this test script: node test-twilio-sms.js');
console.log('');
console.log('💰 Costs:');
console.log('- Phone Number: $1/month');
console.log('- SMS: $0.0075 per message');
console.log('- Trial: $15 free credit');
console.log('');

// Run the test
testTwilioSMS().then(() => {
  console.log('✅ Twilio SMS test completed!');
  process.exit(0);
}).catch(error => {
  console.error('❌ Test failed:', error);
  process.exit(1);
});
