// API endpoint for creating bookings from public website (schedule.html, index.html)
// Uses Firebase Admin SDK to bypass Firestore security rules
// Creates contact, account, and task with admin ownership

import { admin, db } from './_firebase.js';
import { cors } from './_cors.js';
import logger from './_logger.js';

const ADMIN_EMAIL = 'l.patterson@powerchoosers.com';

export default async function handler(req, res) {
  // Handle CORS
  if (cors(req, res)) return; // Early return for OPTIONS

  if (req.method !== 'POST') {
    res.writeHead(405, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'Method not allowed' }));
    return;
  }

  try {
    const {
      contactName,
      companyName,
      email,
      phone,
      appointmentDate,
      selectedTime,
      additionalNotes,
      source = 'schedule' // 'schedule' or 'home-page'
    } = req.body;

    // Validate required fields
    if (!contactName || !companyName || !email || !phone) {
      res.writeHead(400, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Missing required fields: contactName, companyName, email, phone' }));
      return;
    }

    if (!db) {
      logger.error('[Create Booking] Firebase Admin not initialized');
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Database not available' }));
      return;
    }

    const serverTimestamp = admin.firestore.FieldValue.serverTimestamp();
    const emailLower = email.toLowerCase().trim();
    const companyNameTrimmed = companyName.trim();
    const contactNameTrimmed = contactName.trim();
    const phoneTrimmed = phone.trim();

    // Step 1: Check/create contact
    let contactId = null;
    const contactsSnapshot = await db.collection('people')
      .where('email', '==', emailLower)
      .limit(1)
      .get();

    if (!contactsSnapshot.empty) {
      // Contact exists - update if needed
      const contactDoc = contactsSnapshot.docs[0];
      contactId = contactDoc.id;
      const contactData = contactDoc.data();

      const updates = {};
      if (!contactData.firstName && contactNameTrimmed) {
        const nameParts = contactNameTrimmed.split(' ');
        updates.firstName = nameParts[0] || contactNameTrimmed;
        updates.lastName = nameParts.slice(1).join(' ') || '';
      }
      if (!contactData.workDirectPhone && phoneTrimmed) updates.workDirectPhone = phoneTrimmed;
      if (!contactData.mobile && !contactData.workDirectPhone && phoneTrimmed) updates.mobile = phoneTrimmed;
      if (!contactData.company && companyNameTrimmed) updates.company = companyNameTrimmed;

      if (Object.keys(updates).length > 0) {
        updates.updatedAt = serverTimestamp;
        await db.collection('people').doc(contactId).update(updates);
      }
    } else {
      // Create new contact
      const nameParts = contactNameTrimmed.split(' ');
      const newContact = {
        firstName: nameParts[0] || contactNameTrimmed,
        lastName: nameParts.slice(1).join(' ') || '',
        email: emailLower,
        workDirectPhone: phoneTrimmed,
        company: companyNameTrimmed,
        ownerId: ADMIN_EMAIL,
        createdAt: serverTimestamp,
        timestamp: serverTimestamp
      };

      const contactRef = await db.collection('people').add(newContact);
      contactId = contactRef.id;
    }

    // Step 2: Check/create account
    const accountsSnapshot = await db.collection('accounts')
      .where('name', '==', companyNameTrimmed)
      .limit(1)
      .get();

    if (accountsSnapshot.empty) {
      const newAccount = {
        name: companyNameTrimmed,
        ownerId: ADMIN_EMAIL,
        createdAt: serverTimestamp,
        timestamp: serverTimestamp
      };
      await db.collection('accounts').add(newAccount);
    }

    // Step 3: Create task for admin
    const taskTitle = source === 'home-page'
      ? `New Lead: ${contactNameTrimmed} - ${companyNameTrimmed}`
      : `Consultation: ${contactNameTrimmed} - ${companyNameTrimmed}`;

    const taskNotes = source === 'home-page'
      ? `NEW LEAD FROM WEBSITE\n\nContact: ${contactNameTrimmed}\nCompany: ${companyNameTrimmed}\nEmail: ${emailLower}\nPhone: ${phoneTrimmed}\n\nSource: Home Page Lead Form`
      : `SCHEDULED CONSULTATION\n\nContact: ${contactNameTrimmed}\nCompany: ${companyNameTrimmed}\nEmail: ${emailLower}\nPhone: ${phoneTrimmed}\nDate: ${appointmentDate || 'Not specified'}\nTime: ${selectedTime || 'Not specified'}\n\nAdditional Notes:\n${additionalNotes || 'None provided'}`;

    const taskData = {
      title: taskTitle,
      type: 'phone-call',
      priority: 'high',
      contact: contactNameTrimmed,
      account: companyNameTrimmed,
      status: 'pending',
      notes: taskNotes,
      ownerId: ADMIN_EMAIL,
      createdAt: serverTimestamp,
      timestamp: serverTimestamp
    };

    // Add due date/time if provided (for consultations)
    if (appointmentDate) {
      taskData.dueDate = appointmentDate;
    }
    if (selectedTime) {
      taskData.dueTime = selectedTime;
    }

    const taskRef = await db.collection('tasks').add(taskData);
    const taskId = taskRef.id;

    logger.log(`[Create Booking] Created task ${taskId} for ${contactNameTrimmed} from ${companyNameTrimmed}`);

    // Return success
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({
      success: true,
      contactId,
      taskId,
      message: 'Booking created successfully'
    }));

  } catch (error) {
    logger.error('[Create Booking] Error:', error);
    res.writeHead(500, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({
      error: 'Failed to create booking',
      message: error.message
    }));
  }
}

