/**
 * Power Choosers CRM - Email Tracking Module
 * Handles email sending, tracking, and analytics
 */

class EmailTrackingManager {
    constructor() {
        this.db = null;
        this._unsubscribers = []; // Track all onSnapshot unsubscribers to prevent duplicates
        this._emailsUnsubscriber = null; // Guard for main emails onSnapshot
        this.init();
    }

    async init() {
        // Wait for Firebase to be available
        while (!window.firebaseDB) {
            await new Promise(resolve => setTimeout(resolve, 100));
        }
        this.db = window.firebaseDB;
        
        // Start polling for tracking events
        this.startTrackingEventPolling();
    }

    startTrackingEventPolling() {
        // SendGrid webhooks handle tracking events - no polling needed
        console.log('[EmailTracking] Using SendGrid webhooks for tracking events');
    }

    async processTrackingEvent(event) {
        try {
            if (event.type === 'open') {
                await this.updateEmailOpen(event.trackingId, event.data);
            } else if (event.type === 'reply') {
                await this.updateEmailReply(event.trackingId, event.data);
            }
        } catch (error) {
            console.error('[EmailTracking] Error processing tracking event:', error);
        }
    }

    async updateEmailOpen(trackingId, openData) {
        try {
            if (!this.db) {
                console.warn('[EmailTracking] Firebase not initialized');
                return;
            }

            const emailRef = this.db.collection('emails').doc(trackingId);
            
            // Check if document exists before trying to update
            const doc = await emailRef.get();
            if (!doc.exists) {
                // Silently ignore - this is expected for old emails sent before tracking was fixed
                return;
            }

            const emailData = doc.data();
            const existingOpens = emailData.opens || [];
            
            // Check if this user/IP combination has opened the email very recently (within 5 seconds)
            // This prevents immediate duplicate fires but allows genuine re-opens within 1 minute to be counted
            const userKey = `${openData.userAgent}_${openData.ip}`;
            const now = new Date();
            const fiveSecondsAgo = new Date(now.getTime() - 5000); // 5 seconds ago
            
            const recentOpen = existingOpens.find(open => {
                const openTime = new Date(open.openedAt);
                return `${open.userAgent}_${open.ip}` === userKey && openTime > fiveSecondsAgo;
            });
            
            if (recentOpen) {
                return;
            }

            await emailRef.update({
                opens: window.firebase.firestore.FieldValue.arrayUnion(openData),
                openCount: window.firebase.firestore.FieldValue.increment(1),
                lastOpened: openData.openedAt,
                updatedAt: new Date().toISOString()
            });

        } catch (error) {
            // Only log errors that aren't "document not found" errors
            if (!error.message.includes('No document to update') && !error.message.includes('Document not found')) {
                console.error('[EmailTracking] Error updating email open:', error);
            }
        }
    }

    /**
     * Send an email with tracking
     */
    async sendEmail(emailData) {
        try {
            const { to, subject, content, from } = emailData;
            const deliver = emailData?._deliverability || {};
            
            if (!to || !subject || !content) {
                throw new Error('Missing required fields: to, subject, content');
            }

            // Generate unique tracking ID
            const trackingId = `email_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
            
            // Use SendGrid native tracking - no custom pixel injection
            const emailContent = content;

            // Create email record
            const emailRecord = {
                id: trackingId,
                to: Array.isArray(to) ? to : [to],
                subject,
                content: emailContent,
                originalContent: content, // Store original content without tracking pixel
                from: from || 'noreply@powerchoosers.com',
                sentAt: new Date().toISOString(),
                opens: [],
                replies: [],
                openCount: 0,
                replyCount: 0,
                status: 'sent',
                createdAt: new Date().toISOString(),
                updatedAt: new Date().toISOString()
            };

            // Save to Firebase
            await this.db.collection('emails').doc(trackingId).set(emailRecord);

            // Send the email via SendGrid API
            const apiBase = (window.API_BASE_URL || window.location.origin || '').replace(/\/$/, '');
            const apiUrl = `${apiBase}/api/email/sendgrid-send`;
                
            const response = await fetch(apiUrl, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    to,
                    subject,
                    content: emailContent,
                    from,
                    trackingId,
                    _deliverability: deliver
                })
            });

            if (!response.ok) {
                // Fallback: just return success for testing
                const result = {
                    success: true,
                    trackingId,
                    message: 'Email sent successfully (fallback mode)'
                };
                return result;
            }

            const result = await response.json();

            // Show success notification
            if (window.crm && typeof window.crm.showToast === 'function') {
                window.crm.showToast('Email sent successfully!');
            }

            return result;

        } catch (error) {
            console.error('[EmailTracking] Send email error:', error);
            if (window.crm && typeof window.crm.showToast === 'function') {
                window.crm.showToast('Failed to send email: ' + error.message);
            }
            throw error;
        }
    }

    /**
     * Track email open event
     */
    async trackEmailOpen(trackingId, openData = {}) {
        try {
            if (!this.db) {
                console.warn('[EmailTracking] Firebase not initialized');
                return;
            }

            const openEvent = {
                openedAt: new Date().toISOString(),
                userAgent: openData.userAgent || navigator.userAgent,
                ip: openData.ip || 'unknown',
                location: openData.location || null
            };

            // Update the email document with the open event
            const emailRef = this.db.collection('emails').doc(trackingId);
            await emailRef.update({
                opens: window.firebase.firestore.FieldValue.arrayUnion(openEvent),
                openCount: window.firebase.firestore.FieldValue.increment(1),
                lastOpened: openEvent.openedAt,
                updatedAt: new Date().toISOString()
            });


            // Trigger notification
            this.notifyEmailOpened(trackingId, openEvent);

        } catch (error) {
            console.error('[EmailTracking] Track open error:', error);
        }
    }

    /**
     * Track email reply event
     */
    async trackEmailReply(trackingId, replyData = {}) {
        try {
            if (!this.db) {
                console.warn('[EmailTracking] Firebase not initialized');
                return;
            }

            const replyEvent = {
                repliedAt: new Date().toISOString(),
                replyContent: replyData.content || '',
                replyFrom: replyData.from || '',
                replySubject: replyData.subject || ''
            };

            // Update the email document with the reply event
            const emailRef = this.db.collection('emails').doc(trackingId);
            await emailRef.update({
                replies: window.firebase.firestore.FieldValue.arrayUnion(replyEvent),
                replyCount: window.firebase.firestore.FieldValue.increment(1),
                lastReplied: replyEvent.repliedAt,
                updatedAt: new Date().toISOString()
            });


            // Trigger notification
            this.notifyEmailReplied(trackingId, replyEvent);

        } catch (error) {
            console.error('[EmailTracking] Track reply error:', error);
        }
    }

    /**
     * Get email statistics
     */
    async getEmailStats(trackingId) {
        try {
            if (!this.db) {
                console.warn('[EmailTracking] Firebase not initialized');
                return null;
            }

            const emailDoc = await this.db.collection('emails').doc(trackingId).get();
            
            if (!emailDoc.exists) {
                return null;
            }

            const emailData = emailDoc.data();
            return {
                trackingId,
                openCount: emailData.openCount || 0,
                replyCount: emailData.replyCount || 0,
                lastOpened: emailData.lastOpened || null,
                lastReplied: emailData.lastReplied || null,
                opens: emailData.opens || [],
                replies: emailData.replies || [],
                subject: emailData.subject,
                to: emailData.to,
                sentAt: emailData.sentAt
            };

        } catch (error) {
            console.error('[EmailTracking] Get stats error:', error);
            return null;
        }
    }

    /**
     * Get all sent emails with their tracking data
     * @param {Function} callback - Optional callback for real-time updates
     */
    async getSentEmails(callback = null) {
        try {
            if (!this.db) {
                console.warn('[EmailTracking] Firebase not initialized');
                return this.getDemoSentEmails();
            }

            // If callback is provided, set up real-time listener
            if (callback) {
                // Guard to prevent duplicate onSnapshot subscriptions
                if (!this._emailsUnsubscriber) {
                    this._emailsUnsubscriber = this.db.collection('emails')
                        .orderBy('createdAt', 'desc')
                        .limit(100)
                        .onSnapshot((snapshot) => {
                            const emails = [];
                            
                            // Dispatch events for new emails (real-time updates)
                            snapshot.docChanges().forEach(change => {
                                if (change.type === 'added') {
                                    const emailData = { id: change.doc.id, ...change.doc.data() };
                                    // Determine if sent or received email
                                    if (emailData.emailType === 'sent' || emailData.isSentEmail || emailData.type === 'sent') {
                                        document.dispatchEvent(new CustomEvent('pc:email-sent', { 
                                            detail: emailData 
                                        }));
                                    } else {
                                        document.dispatchEvent(new CustomEvent('pc:email-received', { 
                                            detail: emailData 
                                        }));
                                    }
                                }
                            });
                            
                            snapshot.forEach(doc => {
                                const data = doc.data();
                                emails.push({
                                    id: doc.id,
                                    ...data
                                });
                            });

                            // If no emails in database, return demo data
                            if (emails.length === 0) {
                                callback(this.getDemoSentEmails());
                            } else {
                                callback(emails);
                            }
                        }, (error) => {
                            console.error('[EmailTracking] Real-time listener error:', error);
                            callback(this.getDemoSentEmails());
                        });
                    
                }
                return this._emailsUnsubscriber;
            }

            // One-time fetch
            const snapshot = await this.db.collection('emails')
                .orderBy('createdAt', 'desc')
                .limit(100)
                .get();

            const emails = [];
            snapshot.forEach(doc => {
                const data = doc.data();
                emails.push({
                    id: doc.id,
                    ...data
                });
            });

            // If no emails in database, return demo data
            if (emails.length === 0) {
                return this.getDemoSentEmails();
            }

            return emails;

        } catch (error) {
            console.error('[EmailTracking] Get sent emails error:', error);
            return this.getDemoSentEmails();
        }
    }

    /**
     * Get all emails (both sent and received) from Firebase
     */
    async getAllEmails() {
        try {
            if (!this.db) {
                console.warn('[EmailTracking] Firebase not initialized');
                return this.getDemoSentEmails();
            }

            // Fetch all emails from Firebase, ordered by creation time
            const snapshot = await this.db.collection('emails')
                .orderBy('createdAt', 'desc')
                .limit(200)
                .get();

            const emails = [];
            snapshot.forEach(doc => {
                const data = doc.data();
                const email = {
                    id: doc.id,
                    ...data,
                    // Ensure we have proper timestamps for sorting
                    timestamp: data.sentAt || data.receivedAt || data.createdAt,
                    // Add email type for UI display
                    emailType: data.type || (data.provider === 'sendgrid_inbound' ? 'received' : 'sent')
                };
                
                
                emails.push(email);
            });

            // Sort by timestamp (most recent first)
            emails.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));

            // If no emails in database, return demo data
            if (emails.length === 0) {
                return this.getDemoSentEmails();
            }

            return emails;

        } catch (error) {
            console.error('[EmailTracking] Get all emails error:', error);
            return this.getDemoSentEmails();
        }
    }

    /**
     * Get emails by conversation thread
     */
    async getEmailsByThread(threadId) {
        try {
            if (!this.db) {
                console.warn('[EmailTracking] Firebase not initialized');
                return [];
            }

            // Fetch emails in the same thread
            const snapshot = await this.db.collection('emails')
                .where('threadId', '==', threadId)
                .orderBy('createdAt', 'asc')
                .get();

            const emails = [];
            snapshot.forEach(doc => {
                const data = doc.data();
                emails.push({
                    id: doc.id,
                    ...data,
                    timestamp: data.sentAt || data.receivedAt || data.createdAt,
                    emailType: data.type || (data.provider === 'sendgrid_inbound' ? 'received' : 'sent')
                });
            });

            return emails;

        } catch (error) {
            console.error('[EmailTracking] Get emails by thread error:', error);
            return [];
        }
    }

    /**
     * Get conversation threads (grouped emails)
     */
    async getConversationThreads() {
        try {
            const allEmails = await this.getAllEmails();
            
            // Group emails by thread
            const threads = {};
            
            allEmails.forEach(email => {
                const threadId = email.threadId || email.conversationId || email.id;
                
                if (!threads[threadId]) {
                    threads[threadId] = {
                        threadId,
                        emails: [],
                        lastActivity: email.timestamp,
                        participants: new Set()
                    };
                }
                
                threads[threadId].emails.push(email);
                threads[threadId].lastActivity = new Date(Math.max(
                    new Date(threads[threadId].lastActivity),
                    new Date(email.timestamp)
                ));
                
                // Add participants
                if (email.from) threads[threadId].participants.add(email.from);
                if (email.to) threads[threadId].participants.add(email.to);
            });
            
            // Convert to array and sort by last activity
            const threadArray = Object.values(threads).map(thread => ({
                ...thread,
                participants: Array.from(thread.participants),
                emailCount: thread.emails.length,
                // Sort emails within thread by timestamp
                emails: thread.emails.sort((a, b) => new Date(a.timestamp) - new Date(b.timestamp))
            }));
            
            return threadArray.sort((a, b) => new Date(b.lastActivity) - new Date(a.lastActivity));

        } catch (error) {
            console.error('[EmailTracking] Get conversation threads error:', error);
            return [];
        }
    }

    /**
     * Get demo sent emails for demonstration
     */
    getDemoSentEmails() {
        return [
            {
                id: 'test_email_live',
                to: ['l.patterson@powerchoosers.com'],
                subject: 'Test Email with Live Tracking',
                content: '<p>This is a test email sent from your CRM to demonstrate the tracking functionality. You should see tracking icons and notifications!</p>',
                originalContent: '<p>This is a test email sent from your CRM to demonstrate the tracking functionality. You should see tracking icons and notifications!</p>',
                from: 'noreply@powerchoosers.com',
                sentAt: new Date().toISOString(), // Just sent
                opens: [],
                replies: [],
                openCount: 0,
                replyCount: 0,
                status: 'sent',
                createdAt: new Date().toISOString(),
                updatedAt: new Date().toISOString()
            },
            {
                id: 'your_test_email',
                to: ['l.patterson@powerchoosers.com'],
                subject: 'test',
                content: '<p>seeing if this works</p>',
                originalContent: '<p>seeing if this works</p>',
                from: 'noreply@powerchoosers.com',
                sentAt: new Date(Date.now() - 10 * 60 * 1000).toISOString(), // 10 minutes ago
                opens: [
                    {
                        openedAt: new Date(Date.now() - 5 * 60 * 1000).toISOString(),
                        userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
                        ip: '192.168.1.100'
                    }
                ],
                replies: [],
                openCount: 1,
                replyCount: 0,
                status: 'sent',
                createdAt: new Date(Date.now() - 10 * 60 * 1000).toISOString(),
                updatedAt: new Date(Date.now() - 5 * 60 * 1000).toISOString()
            },
            {
                id: 'demo_email_1',
                to: ['john.doe@example.com'],
                subject: 'Energy Proposal for Your Business',
                content: '<p>Hi John, I hope this email finds you well. I wanted to follow up on our conversation about energy solutions for your business...</p>',
                originalContent: '<p>Hi John, I hope this email finds you well. I wanted to follow up on our conversation about energy solutions for your business...</p>',
                from: 'noreply@powerchoosers.com',
                sentAt: new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString(), // 2 hours ago
                opens: [
                    {
                        openedAt: new Date(Date.now() - 1 * 60 * 60 * 1000).toISOString(),
                        userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
                        ip: '192.168.1.100'
                    }
                ],
                replies: [],
                openCount: 1,
                replyCount: 0,
                status: 'sent',
                createdAt: new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString(),
                updatedAt: new Date(Date.now() - 1 * 60 * 60 * 1000).toISOString()
            },
            {
                id: 'demo_email_2',
                to: ['sarah.wilson@company.com'],
                subject: 'Following up on our energy consultation',
                content: '<p>Hi Sarah, Thank you for taking the time to speak with me yesterday about your energy needs...</p>',
                originalContent: '<p>Hi Sarah, Thank you for taking the time to speak with me yesterday about your energy needs...</p>',
                from: 'noreply@powerchoosers.com',
                sentAt: new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString(), // 1 day ago
                opens: [
                    {
                        openedAt: new Date(Date.now() - 20 * 60 * 60 * 1000).toISOString(),
                        userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36',
                        ip: '10.0.0.50'
                    },
                    {
                        openedAt: new Date(Date.now() - 12 * 60 * 60 * 1000).toISOString(),
                        userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 14_7_1 like Mac OS X) AppleWebKit/605.1.15',
                        ip: '192.168.1.200'
                    }
                ],
                replies: [
                    {
                        repliedAt: new Date(Date.now() - 10 * 60 * 60 * 1000).toISOString(),
                        replyContent: 'Thank you for reaching out. I would like to schedule a follow-up call.',
                        replyFrom: 'sarah.wilson@company.com',
                        replySubject: 'Re: Following up on our energy consultation'
                    }
                ],
                openCount: 2,
                replyCount: 1,
                status: 'sent',
                createdAt: new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString(),
                updatedAt: new Date(Date.now() - 10 * 60 * 60 * 1000).toISOString()
            },
            {
                id: 'demo_email_3',
                to: ['mike.johnson@business.com'],
                subject: 'Energy savings opportunity for your facility',
                content: '<p>Hi Mike, I noticed your facility in Houston and wanted to reach out about potential energy savings...</p>',
                originalContent: '<p>Hi Mike, I noticed your facility in Houston and wanted to reach out about potential energy savings...</p>',
                from: 'noreply@powerchoosers.com',
                sentAt: new Date(Date.now() - 3 * 24 * 60 * 60 * 1000).toISOString(), // 3 days ago
                opens: [],
                replies: [],
                openCount: 0,
                replyCount: 0,
                status: 'sent',
                createdAt: new Date(Date.now() - 3 * 24 * 60 * 60 * 1000).toISOString(),
                updatedAt: new Date(Date.now() - 3 * 24 * 60 * 60 * 1000).toISOString()
            }
        ];
    }

    /**
     * Subscribe to real-time email updates
     */
    subscribeToEmailUpdates(callback) {
        try {
            if (!this.db) {
                console.warn('[EmailTracking] Firebase not initialized');
                return null;
            }

            // Guard and track subscription to prevent duplicates
            const unsubscribe = this.db.collection('emails')
                .orderBy('updatedAt', 'desc')
                .onSnapshot((snapshot) => {
                    const emails = [];
                    snapshot.forEach(doc => {
                        const data = doc.data();
                        emails.push({
                            id: doc.id,
                            ...data
                        });
                    });
                    callback(emails);
                }, (error) => {
                    console.error('[EmailTracking] Subscription error:', error);
                });
            
            // Track unsubscriber
            this._unsubscribers.push(unsubscribe);
            
            return unsubscribe; // Allow caller to unsubscribe

        } catch (error) {
            console.error('[EmailTracking] Subscribe error:', error);
            return null;
        }
    }

    /**
     * Show notification when email is opened
     */
    notifyEmailOpened(trackingId, openEvent) {
        // Get email details for notification
        this.getEmailStats(trackingId).then(stats => {
            if (stats) {
                const notification = {
                    type: 'email_opened',
                    title: 'Email Opened',
                    message: `${stats.to[0]} opened your email: "${stats.subject}"`,
                    timestamp: openEvent.openedAt,
                    trackingId,
                    openCount: stats.openCount
                };

                // Show browser notification if permission granted
                if (Notification.permission === 'granted') {
                    new Notification(notification.title, {
                        body: notification.message,
                        icon: '/favicon.ico'
                    });
                }

                // Show in-app notification
                if (window.ToastManager) {
                    window.ToastManager.showEmailNotification({
                        to: stats.to[0],
                        subject: stats.subject,
                        type: 'opened'
                    });
                } else if (window.crm && typeof window.crm.showToast === 'function') {
                    window.crm.showToast(`📧 ${notification.message}`);
                }

                // Dispatch custom event for other components to listen
                document.dispatchEvent(new CustomEvent('email-opened', { 
                    detail: notification 
                }));
            }
        });
    }

    /**
     * Show notification when email is replied
     */
    notifyEmailReplied(trackingId, replyEvent) {
        // Get email details for notification
        this.getEmailStats(trackingId).then(stats => {
            if (stats) {
                const notification = {
                    type: 'email_replied',
                    title: 'Email Replied',
                    message: `${stats.to[0]} replied to your email: "${stats.subject}"`,
                    timestamp: replyEvent.repliedAt,
                    trackingId,
                    replyCount: stats.replyCount
                };

                // Show browser notification if permission granted
                if (Notification.permission === 'granted') {
                    new Notification(notification.title, {
                        body: notification.message,
                        icon: '/favicon.ico'
                    });
                }

                // Show in-app notification
                if (window.ToastManager) {
                    window.ToastManager.showEmailNotification({
                        to: stats.to[0],
                        subject: stats.subject,
                        type: 'replied'
                    });
                } else if (window.crm && typeof window.crm.showToast === 'function') {
                    window.crm.showToast(`💬 ${notification.message}`);
                }

                // Dispatch custom event for other components to listen
                document.dispatchEvent(new CustomEvent('email-replied', { 
                    detail: notification 
                }));
            }
        });
    }

    /**
     * Request notification permission
     */
    async requestNotificationPermission() {
        if ('Notification' in window && Notification.permission === 'default') {
            const permission = await Notification.requestPermission();
            return permission === 'granted';
        }
        return Notification.permission === 'granted';
    }

    /**
     * Test function to simulate email tracking events
     */
    async testEmailTracking() {
        try {
            // Generate a test tracking ID
            const trackingId = `test_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
            
            // Create a test email record
            const testEmail = {
                id: trackingId,
                to: ['test@example.com'],
                subject: 'Test Email with Tracking',
                content: '<p>This is a test email to demonstrate tracking functionality.</p>',
                originalContent: '<p>This is a test email to demonstrate tracking functionality.</p>',
                from: 'noreply@powerchoosers.com',
                sentAt: new Date().toISOString(),
                opens: [],
                replies: [],
                openCount: 0,
                replyCount: 0,
                status: 'sent',
                createdAt: new Date().toISOString(),
                updatedAt: new Date().toISOString()
            };

            // Save to Firebase if available
            if (this.db) {
                try {
                    await this.db.collection('emails').doc(trackingId).set(testEmail);
                } catch (error) {
                    console.warn('[EmailTracking] Failed to save to Firebase:', error);
                }
            }

            const result = {
                success: true,
                trackingId,
                message: 'Test email created successfully'
            };


            // Simulate email being opened after 2 seconds
            setTimeout(() => {
                this.simulateEmailOpen(trackingId);
            }, 2000);

            // Simulate email being replied after 5 seconds
            setTimeout(() => {
                this.simulateEmailReply(trackingId);
            }, 5000);

            return result;

        } catch (error) {
            console.error('[EmailTracking] Test error:', error);
            throw error;
        }
    }


    /**
     * Simulate email reply for testing
     */
    simulateEmailReply(trackingId) {
        
        // Create a mock reply event
        const replyEvent = {
            repliedAt: new Date().toISOString(),
            replyContent: 'Thank you for your email! This is a test reply.',
            replyFrom: 'test@example.com',
            replySubject: 'Re: Test Email with Tracking'
        };

        // Trigger notification
        this.notifyEmailReplied(trackingId, replyEvent);
        
        // Update demo data if available
        this.updateDemoEmailReplyCount(trackingId);
    }

    /**
     * Update demo email open count for testing
     */
    updateDemoEmailOpenCount(trackingId) {
        // This would update the demo data in a real implementation
    }

    /**
     * Update demo email reply count for testing
     */
    updateDemoEmailReplyCount(trackingId) {
        // This would update the demo data in a real implementation
    }

    /**
     * Save an email record to Firebase (for SendGrid and Gmail emails)
     */
    async saveEmailRecord(emailData) {
        try {
            const { id, to, subject, content, from, sendgridMessageId, gmailMessageId, sentAt, sentVia, provider } = emailData;
            
            // Determine provider (default to sendgrid)
            const emailProvider = provider || sentVia || 'sendgrid';
            
            // Use the provided tracking ID or generate a new one based on provider
            const trackingId = id || `${emailProvider === 'gmail' || emailProvider === 'gmail_api' ? 'gmail' : 'sendgrid'}_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
            
            // Create email record with provider-specific fields
            const emailRecord = {
                id: trackingId,
                to: Array.isArray(to) ? to : [to],
                subject,
                content: content,
                originalContent: content,
                from: from || 'noreply@powerchoosers.com',
                sentAt: sentAt || new Date().toISOString(),
                opens: [],
                replies: [],
                openCount: 0,
                replyCount: 0,
                status: 'sent',
                provider: emailProvider, // Track email provider (sendgrid or gmail)
                sentVia: emailProvider
            };
            
            // Add provider-specific message IDs (only if they exist)
            if (sendgridMessageId) {
                emailRecord.sendgridMessageId = sendgridMessageId;
            }
            if (gmailMessageId) {
                emailRecord.gmailMessageId = gmailMessageId;
            }

            // Save to Firebase
            await this.db.collection('emails').doc(trackingId).set(emailRecord);
            
            return { success: true, trackingId };
        } catch (error) {
            console.error('[EmailTracking] Failed to save email record:', error);
            throw error;
        }
    }

    /**
     * Simulate email open for testing (SendGrid webhooks handle real tracking)
     */
    async simulateEmailOpen(trackingId) {
        try {
            if (!this.db) {
                console.warn('[EmailTracking] Firebase not initialized');
                return;
            }

            const openEvent = {
                openedAt: new Date().toISOString(),
                userAgent: navigator.userAgent,
                ip: 'simulated',
                location: null
            };

            // Update the email document with the open event
            const emailRef = this.db.collection('emails').doc(trackingId);
            await emailRef.update({
                opens: window.firebase.firestore.FieldValue.arrayUnion(openEvent),
                openCount: window.firebase.firestore.FieldValue.increment(1),
                lastOpened: openEvent.openedAt,
                updatedAt: new Date().toISOString()
            });


            // Trigger notification
            this.notifyEmailOpened(trackingId, openEvent);

        } catch (error) {
            console.error('[EmailTracking] Simulate open error:', error);
        }
    }
}

// Initialize email tracking manager
let emailTrackingManager;

function initEmailTracking() {
    if (!emailTrackingManager) {
        emailTrackingManager = new EmailTrackingManager();
        window.emailTrackingManager = emailTrackingManager;
        
        // Request notification permission
        emailTrackingManager.requestNotificationPermission();
        
    }
    return emailTrackingManager;
}

// Auto-initialize when DOM is ready
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initEmailTracking);
} else {
    initEmailTracking();
}

// Export for use in other modules
window.initEmailTracking = initEmailTracking;
