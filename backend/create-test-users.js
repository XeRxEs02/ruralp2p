const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
const User = require('./models/User');

require('dotenv').config();

async function createTestUsers() {
	try {
		// Connect to MongoDB
		const mongoUri = process.env.MONGODB_URI || 'mongodb+srv://ruralconnect:ruralconnect@ruralconnect.lnubbq5.mongodb.net/?appName=ruralconnect';
		await mongoose.connect(mongoUri);
		console.log('Connected to MongoDB');

		// Create borrower user
		const borrower = new User({
			fullName: 'Test Borrower',
			email: 'borrower@test.com',
			password: 'temppwd', // Temporary password
			phone: '9876543210',
			role: 'Borrower',
			aadharNumber: '123456789012',
			kycVerified: true,
			faceVerified: true,
			uniqueId: 'BORROWER001',
			faceEmbedding: [0.1, 0.2, 0.3], // Mock embedding
			aadharHash: 'mockhash123',
			aadharSalt: 'mocksalt123',
			walletAddress: '0x1234567890123456789012345678901234567890'
		});

		// Create lender user
		const lender = new User({
			fullName: 'Test Lender',
			email: 'lender@test.com',
			password: 'temppwd', // Temporary password
			phone: '9876543211',
			role: 'Lender',
			aadharNumber: '123456789013',
			kycVerified: true,
			faceVerified: true,
			uniqueId: 'LENDER001',
			faceEmbedding: [0.4, 0.5, 0.6], // Mock embedding
			aadharHash: 'mockhash456',
			aadharSalt: 'mocksalt456',
			walletAddress: '0x0987654321098765432109876543210987654321'
		});

		// Save without password first
		await borrower.save();
		await lender.save();

		// Now update passwords directly
		const borrowerPassword = await bcrypt.hash('borrower123', 10);
		const lenderPassword = await bcrypt.hash('lender123', 10);

		await User.updateOne({ _id: borrower._id }, { password: borrowerPassword });
		await User.updateOne({ _id: lender._id }, { password: lenderPassword });

		console.log('✅ Test users created successfully!');
		console.log('Borrower:', {
			email: borrower.email,
			uniqueId: borrower.uniqueId,
			password: 'borrower123'
		});
		console.log('Lender:', {
			email: lender.email,
			uniqueId: lender.uniqueId,
			password: 'lender123'
		});

	} catch (error) {
		console.error('Error creating test users:', error);
	} finally {
		await mongoose.connection.close();
		process.exit(0);
	}
}

createTestUsers();
