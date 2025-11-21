const mongoose = require('mongoose');
const User = require('./models/User');
const Loan = require('./models/Loan');
const Notification = require('./models/Notification');

require('dotenv').config();

async function simulateLoanRepayment() {
	try {
		// Connect to MongoDB
		const mongoUri = process.env.MONGODB_URI || 'mongodb+srv://ruralconnect:ruralconnect@ruralconnect.lnubbq5.mongodb.net/?appName=ruralconnect';
		await mongoose.connect(mongoUri);
		console.log('Connected to MongoDB');

		// Find test users
		const borrower = await User.findOne({ uniqueId: 'BORROWER001' });
		const lender = await User.findOne({ uniqueId: 'LENDER001' });

		if (!borrower || !lender) {
			console.error('Test users not found. Please run create-test-users.js first.');
			return;
		}

		console.log('Found test users:', {
			borrower: borrower.fullName,
			lender: lender.fullName
		});

		// Create a loan manually (simulating the API call)
		const loanData = {
			borrowerId: borrower._id,
			totalAmount: 10000,
			duration: 12,
			averageInterestRate: 10,
			purpose: 'Test loan for repayment simulation',
			status: 'ACTIVE', // Set to active since lender is funding
			lenders: [{
				lenderId: lender._id,
				amount: 10000,
				interestRate: 10,
				status: 'Active', // Pre-approve for simulation
				disbursedAt: new Date(),
			}],
			stateHistory: [{
				state: 'ACTIVE',
				timestamp: new Date(),
				reason: 'Loan created and funded for simulation',
			}],
			matchingScore: 0.8,
			matchedAt: new Date(),
			disbursedAt: new Date(),
		};

		const loan = new Loan(loanData);
		await loan.save();

		console.log('✅ Loan created:', {
			id: loan._id,
			amount: loan.totalAmount,
			status: loan.status
		});

		// Simulate repayment
		const repaymentAmount = 2000; // Partial repayment
		loan.totalRepaidAmount += repaymentAmount;

		// Check if fully repaid
		const totalOwed = loan.totalAmount + (loan.totalAmount * loan.averageInterestRate / 100);
		if (loan.totalRepaidAmount >= totalOwed) {
			loan.status = 'REPAID';
			loan.completedAt = new Date();
			loan.stateHistory.push({
				state: 'REPAID',
				timestamp: new Date(),
				reason: 'Loan fully repaid in simulation',
			});
		}

		await loan.save();

		// Create repayment notifications
		await Notification.create({
			recipientId: lender._id,
			senderId: borrower._id,
			type: 'PaymentReceived',
			title: 'Payment Received',
			message: `Payment of ₹${repaymentAmount} received for your loan portion.`,
			relatedLoanId: loan._id,
			priority: 'Medium',
			channels: {
				email: true,
				sms: false,
				push: true,
				inApp: true,
			},
		});

		await Notification.create({
			recipientId: borrower._id,
			type: 'General',
			title: 'Payment Successful',
			message: `Your payment of ₹${repaymentAmount} has been successfully processed.`,
			relatedLoanId: loan._id,
			priority: 'Medium',
			channels: {
				email: true,
				sms: true,
				push: true,
				inApp: true,
			},
		});

		console.log('✅ Loan repayment simulated:', {
			loanId: loan._id,
			repaymentAmount,
			totalRepaid: loan.totalRepaidAmount,
			totalOwed,
			status: loan.status,
			notificationsCreated: 2
		});

		// Get all notifications for borrower
		const borrowerNotifications = await Notification.find({ recipientId: borrower._id })
			.sort({ createdAt: -1 })
			.limit(5);

		console.log('📋 Borrower notifications:', borrowerNotifications.map(n => ({
			type: n.type,
			title: n.title,
			read: n.read
		})));

		// Get all loans
		const allLoans = await Loan.find({})
			.populate('borrowerId', 'fullName')
			.populate('lenders.lenderId', 'fullName')
			.sort({ createdAt: -1 });

		console.log('📊 All loans:', allLoans.map(l => ({
			id: l._id,
			borrower: l.borrowerId?.fullName,
			amount: l.totalAmount,
			status: l.status,
			repaid: l.totalRepaidAmount
		})));

	} catch (error) {
		console.error('Error in simulation:', error);
	} finally {
		await mongoose.connection.close();
		process.exit(0);
	}
}

simulateLoanRepayment();
