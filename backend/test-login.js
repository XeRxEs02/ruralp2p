const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
const User = require('./models/User');

require('dotenv').config();

async function testLogin() {
	try {
		const mongoUri = process.env.MONGODB_URI || 'mongodb+srv://ruralconnect:ruralconnect@ruralconnect.lnubbq5.mongodb.net/?appName=ruralconnect';
		await mongoose.connect(mongoUri);
		console.log('Connected to MongoDB');

		const user = await User.findOne({ uniqueId: 'BORROWER001' });
		if (!user) {
			console.log('User not found');
			return;
		}

		console.log('User found:', user.email);
		console.log('Has password:', !!user.password);

		// Test password comparison
		const isValid = await user.comparePassword('borrower123');
		console.log('Password valid:', isValid);

		// Test direct bcrypt compare
		const directCompare = await bcrypt.compare('borrower123', user.password);
		console.log('Direct bcrypt compare:', directCompare);

	} catch (error) {
		console.error('Error:', error);
	} finally {
		await mongoose.connection.close();
		process.exit(0);
	}
}

testLogin();
