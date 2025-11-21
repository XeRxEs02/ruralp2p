const mongoose = require('mongoose');
const path = require('path');

require('dotenv').config({ path: path.resolve(__dirname, '../.env') });

const User = require('../models/User');
const Notification = require('../models/Notification');

async function run() {
	try {
		const mongoUri = process.env.MONGODB_URI || 'mongodb+srv://ruralconnect:ruralconnect@ruralconnect.lnubbq5.mongodb.net/?appName=ruralconnect';
		await mongoose.connect(mongoUri);
		console.log('Connected to', mongoUri);

		// Clear all collections using raw MongoDB operations
		const db = mongoose.connection.db;

		// Drop the entire database to ensure clean state
		try {
			await db.dropDatabase();
			console.log('Database dropped successfully');
		} catch (dropError) {
			console.log('Database drop failed or not needed:', dropError.message);
		}

		// Clear all collections if they exist
		const collections = await db.listCollections().toArray();
		for (const collection of collections) {
			try {
				const result = await db.collection(collection.name).deleteMany({});
				console.log(`Deleted ${result.deletedCount} documents from ${collection.name}`);
			} catch (error) {
				console.log(`Error clearing ${collection.name}:`, error.message);
			}
		}

	} catch (err) {
		console.error('Error:', err.message);
	} finally {
		await mongoose.connection.close();
		process.exit(0);
	}
}

run();
