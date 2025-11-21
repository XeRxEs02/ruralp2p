const express = require('express');
const router = express.Router();
const NotificationController = require('../controllers/notificationController');
const { body } = require('express-validator');
const rateLimit = require('express-rate-limit');

// Rate limiting for notification endpoints
const notificationRateLimit = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100, // Limit each IP to 100 notification requests per windowMs
  message: {
    success: false,
    message: 'Too many notification requests, please try again later'
  },
  standardHeaders: true,
  legacyHeaders: false
});

const bulkNotificationRateLimit = rateLimit({
  windowMs: 60 * 60 * 1000, // 1 hour
  max: 10, // Limit bulk notifications to 10 per hour
  message: {
    success: false,
    message: 'Bulk notification rate limit exceeded'
  }
});

/**
 * @swagger
 * components:
 *   schemas:
 *     Notification:
 *       type: object
 *       required:
 *         - userId
 *         - type
 *         - title
 *       properties:
 *         userId:
 *           type: string
 *           description: MongoDB ObjectId of the user
 *         userType:
 *           type: string
 *           enum: [borrower, lender, admin]
 *           default: borrower
 *         type:
 *           type: string
 *           enum: [loan_approved, loan_rejected, payment_successful, payment_failed, repayment_due, document_verified, loan_completed]
 *           description: Type of notification
 *         title:
 *           type: string
 *           maxLength: 100
 *           description: Notification title
 *         message:
 *           type: string
 *           maxLength: 500
 *           description: Notification message body
 *         priority:
 *           type: string
 *           enum: [low, medium, high, urgent]
 *           default: medium
 *         channels:
 *           type: object
 *           properties:
 *             sms:
 *               type: boolean
 *               default: true
 *             push:
 *               type: boolean
 *               default: true
 *             email:
 *               type: boolean
 *               default: false
 *             inApp:
 *               type: boolean
 *               default: true
 *         scheduledFor:
 *           type: string
 *           format: date-time
 *           description: Schedule notification for future delivery
 *         templateVariables:
 *           type: object
 *           description: Variables for template processing
 *         metadata:
 *           type: object
 *           description: Additional notification metadata
 * 
 *     BulkNotification:
 *       type: object
 *       required:
 *         - recipients
 *         - type
 *         - title
 *       properties:
 *         recipients:
 *           type: array
 *           items:
 *             type: object
 *             required:
 *               - userId
 *             properties:
 *               userId:
 *                 type: string
 *               userType:
 *                 type: string
 *                 enum: [borrower, lender, admin]
 *               phoneNumber:
 *                 type: string
 *               fcmToken:
 *                 type: string
 *               email:
 *                 type: string
 *               variables:
 *                 type: object
 *         type:
 *           type: string
 *         title:
 *           type: string
 *           maxLength: 100
 *         message:
 *           type: string
 *           maxLength: 500
 *         priority:
 *           type: string
 *           enum: [low, medium, high, urgent]
 *           default: medium
 *         channels:
 *           type: object
 *         templateVariables:
 *           type: object
 *         batchSize:
 *           type: integer
 *           minimum: 1
 *           maximum: 100
 *           default: 50
 */

/**
 * @swagger
 * /api/notifications/send:
 *   post:
 *     summary: Send notification to a single user
 *     tags: [Notifications]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/Notification'
 *     responses:
 *       201:
 *         description: Notification created and queued for delivery
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 message:
 *                   type: string
 *                 data:
 *                   type: object
 *                   properties:
 *                     notificationId:
 *                       type: string
 *                     userId:
 *                       type: string
 *                     type:
 *                       type: string
 *                     status:
 *                       type: string
 *                     channels:
 *                       type: object
 *       400:
 *         description: Validation error
 *       429:
 *         description: Rate limit exceeded
 *       500:
 *         description: Internal server error
 */
router.post('/send',
  notificationRateLimit,
  NotificationController.validateSendNotification,
  NotificationController.sendNotification
);

/**
 * @swagger
 * /api/notifications/send-bulk:
 *   post:
 *     summary: Send notifications to multiple users
 *     tags: [Notifications]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/BulkNotification'
 *     responses:
 *       200:
 *         description: Bulk notifications processed
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 message:
 *                   type: string
 *                 data:
 *                   type: object
 *                   properties:
 *                     total:
 *                       type: integer
 *                     successful:
 *                       type: integer
 *                     failed:
 *                       type: integer
 *                     notifications:
 *                       type: array
 *       400:
 *         description: Validation error
 *       429:
 *         description: Rate limit exceeded
 *       500:
 *         description: Internal server error
 */
router.post('/send-bulk',
  bulkNotificationRateLimit,
  NotificationController.validateBulkSend,
  NotificationController.sendBulkNotifications
);

/**
 * @swagger
 * /api/notifications/status/{notificationId}:
 *   get:
 *     summary: Get notification status and delivery details
 *     tags: [Notifications]
 *     parameters:
 *       - in: path
 *         name: notificationId
 *         required: true
 *         schema:
 *           type: string
 *         description: Notification ID
 *     responses:
 *       200:
 *         description: Notification status retrieved successfully
 *       404:
 *         description: Notification not found
 *       500:
 *         description: Internal server error
 */
router.get('/status/:notificationId', NotificationController.getNotificationStatus);

/**
 * @swagger
 * /api/notifications/user/{userId}:
 *   get:
 *     summary: Get notifications for a user
 *     tags: [Notifications]
 *     parameters:
 *       - in: path
 *         name: userId
 *         required: true
 *         schema:
 *           type: string
 *         description: User ID
 *       - in: query
 *         name: page
 *         schema:
 *           type: integer
 *           default: 1
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *           default: 20
 *       - in: query
 *         name: type
 *         schema:
 *           type: string
 *         description: Filter by notification type
 *       - in: query
 *         name: unreadOnly
 *         schema:
 *           type: boolean
 *           default: false
 *         description: Return only unread notifications
 *       - in: query
 *         name: priority
 *         schema:
 *           type: string
 *           enum: [low, medium, high, urgent]
 *         description: Filter by priority
 *     responses:
 *       200:
 *         description: User notifications retrieved successfully
 *       403:
 *         description: Access denied
 *       500:
 *         description: Internal server error
 */
router.get('/user/:userId', require('../middleware/auth').authenticateToken, async (req, res) => {
  try {
    // Users can only access their own notifications
    if (req.params.userId !== req.user.id) {
      return res.status(403).json({
        success: false,
        message: 'Access denied: Can only access your own notifications'
      });
    }

    // Call the controller method
    return NotificationController.getUserNotifications(req, res);
  } catch (error) {
    console.error('Error getting user notifications:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to get notifications',
      error: process.env.NODE_ENV === 'development' ? error.message : 'Internal server error'
    });
  }
});

/**
 * @swagger
 * /api/notifications/mark-read/{notificationId}:
 *   post:
 *     summary: Mark notification as read
 *     tags: [Notifications]
 *     parameters:
 *       - in: path
 *         name: notificationId
 *         required: true
 *         schema:
 *           type: string
 *         description: Notification ID
 *     requestBody:
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               userId:
 *                 type: string
 *                 description: User ID (if not authenticated)
 *     responses:
 *       200:
 *         description: Notification marked as read
 *       404:
 *         description: Notification not found
 *       500:
 *         description: Internal server error
 */
router.post('/mark-read/:notificationId', NotificationController.markNotificationAsRead);

/**
 * @swagger
 * /api/notifications/process-offline-queue:
 *   post:
 *     summary: Process offline queued notifications
 *     tags: [Notifications]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - userId
 *             properties:
 *               userId:
 *                 type: string
 *                 description: User ID
 *     responses:
 *       200:
 *         description: Offline notification queue processed
 *       500:
 *         description: Internal server error
 */
router.post('/process-offline-queue', NotificationController.processOfflineQueue);

/**
 * @swagger
 * /api/notifications/retry/{notificationId}:
 *   post:
 *     summary: Retry failed notifications
 *     tags: [Notifications]
 *     parameters:
 *       - in: path
 *         name: notificationId
 *         required: true
 *         schema:
 *           type: string
 *         description: Notification ID
 *     requestBody:
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               channels:
 *                 type: array
 *                 items:
 *                   type: string
 *                   enum: [sms, push, email, websocket]
 *                 description: Specific channels to retry
 *     responses:
 *       200:
 *         description: Notification retry initiated
 *       404:
 *         description: Notification not found
 *       500:
 *         description: Internal server error
 */
router.post('/retry/:notificationId', NotificationController.retryNotification);

/**
 * @swagger
 * /api/notifications/analytics:
 *   get:
 *     summary: Get notification analytics and statistics
 *     tags: [Notifications]
 *     parameters:
 *       - in: query
 *         name: userId
 *         schema:
 *           type: string
 *         description: Filter by user ID
 *       - in: query
 *         name: startDate
 *         schema:
 *           type: string
 *           format: date
 *         description: Start date for analytics
 *       - in: query
 *         name: endDate
 *         schema:
 *           type: string
 *           format: date
 *         description: End date for analytics
 *       - in: query
 *         name: type
 *         schema:
 *           type: string
 *         description: Filter by notification type
 *     responses:
 *       200:
 *         description: Notification analytics retrieved successfully
 *       500:
 *         description: Internal server error
 */
router.get('/analytics', NotificationController.getAnalytics);

// Health check endpoint
/**
 * @swagger
 * /api/notifications/health:
 *   get:
 *     summary: Notification service health check
 *     tags: [Notifications]
 *     responses:
 *       200:
 *         description: Service is healthy
 *       503:
 *         description: Service is unhealthy
 */
router.get('/health', (req, res) => {
  const firebaseService = require('../services/firebaseService');
  const twilioService = require('../services/twilioService');

  const firebaseStatus = firebaseService.getStatus();
  const twilioStatus = twilioService.getStatus();

  const allHealthy = !firebaseStatus.mockMode || !twilioStatus.mockMode;

  res.status(allHealthy ? 200 : 503).json({
    success: allHealthy,
    message: 'Notification service status',
    timestamp: new Date(),
    services: {
      firebase: {
        status: firebaseStatus.mockMode ? 'mock' : 'operational',
        initialized: firebaseStatus.initialized
      },
      twilio: {
        status: twilioStatus.mockMode ? 'mock' : 'operational',
        fromNumber: twilioStatus.fromNumber
      },
      database: 'operational',
      templates: twilioStatus.templatesCount
    }
  });
});

module.exports = router;
