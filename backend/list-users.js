const mongoose = require('mongoose');
const User = require('./models/User');

require('dotenv').config();

async function listUsers() {
	try {
		const mongoUri = process.env.MONGODB_URI || 'mongodb+srv://ruralconnect:ruralconnect@ruralconnect.lnubbq5.mongodb.net/?appName=ruralconnect';
		await mongoose.connect(mongoUri);
		console.log('Connected to MongoDB');

		const users = await User.find({});
		console.log('Users in database:', users.length);
		users.forEach(user => {
			console.log(`- ${user.email}: aadhaar=${user.aadharNumber}, role=${user.role}, uniqueId=${user.uniqueId}, hasPassword=${!!user.password}`);
		});

	} catch (error) {
		console.error('Error:', error);
	} finally {
		await mongoose.connection.close();
		process.exit(0);
	}
}

listUsers();
