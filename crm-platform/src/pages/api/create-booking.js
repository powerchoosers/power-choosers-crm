// API endpoint for creating bookings from public website (schedule.html, index.html)
// Uses Firebase Admin SDK to bypass Firestore security rules
// Creates contact, account, and task with admin ownership

import { admin, db } from './_firebase.js';
import { cors } from './_cors.js';
import logger from './_logger.js';
import { GmailService } from './email/gmail-service.js';

const ADMIN_EMAIL = 'l.patterson@nodalpoint.io';
const DEFAULT_OWNER = 'unassigned';

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

    // Validate required fields (phone optional for guide-download)
    if (!contactName || !companyName || !email) {
      res.writeHead(400, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Missing required fields: contactName, companyName, email' }));
      return;
    }
    
    // Phone is required for appointments, optional for guide downloads
    if (source !== 'guide-download' && !phone) {
      res.writeHead(400, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Missing required field: phone' }));
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
    const phoneTrimmed = phone ? phone.trim() : '';

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
        ownerId: DEFAULT_OWNER,
        assignedTo: DEFAULT_OWNER,
        createdBy: DEFAULT_OWNER,
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
        ownerId: DEFAULT_OWNER,
        assignedTo: DEFAULT_OWNER,
        createdBy: DEFAULT_OWNER,
        createdAt: serverTimestamp,
        timestamp: serverTimestamp
      };
      await db.collection('accounts').add(newAccount);
    }

    // Step 3: Create task for admin
    const taskTitle = source === 'home-page'
      ? `New Lead: ${contactNameTrimmed} - ${companyNameTrimmed}`
      : source === 'guide-download'
      ? `Guide Download: ${contactNameTrimmed} - ${companyNameTrimmed}`
      : `Consultation: ${contactNameTrimmed} - ${companyNameTrimmed}`;

    const taskNotes = source === 'home-page'
      ? `NEW LEAD FROM WEBSITE\n\nContact: ${contactNameTrimmed}\nCompany: ${companyNameTrimmed}\nEmail: ${emailLower}\nPhone: ${phoneTrimmed}\n\nSource: Home Page Lead Form`
      : source === 'guide-download'
      ? `GUIDE DOWNLOAD REQUEST\n\nContact: ${contactNameTrimmed}\nCompany: ${companyNameTrimmed}\nEmail: ${emailLower}\n\nSource: 2026 Market Navigator Guide Download`
      : `SCHEDULED CONSULTATION\n\nContact: ${contactNameTrimmed}\nCompany: ${companyNameTrimmed}\nEmail: ${emailLower}\nPhone: ${phoneTrimmed}\nDate: ${appointmentDate || 'Not specified'}\nTime: ${selectedTime || 'Not specified'}\n\nAdditional Notes:\n${additionalNotes || 'None provided'}`;

    const taskData = {
      title: taskTitle,
      type: 'phone-call',
      priority: 'high',
      contact: contactNameTrimmed,
      account: companyNameTrimmed,
      status: 'pending',
      notes: taskNotes,
      ownerId: DEFAULT_OWNER,
      assignedTo: DEFAULT_OWNER,
      createdBy: DEFAULT_OWNER,
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

    // Create task with Firestore-generated ID
    const taskRef = await db.collection('tasks').add(taskData);
    const taskId = taskRef.id;

    // CRITICAL FIX: Add id field to task document for consistency
    // This ensures tasks can be properly queried and deleted by id field
    await taskRef.update({ id: taskId });

    logger.log(`[Create Booking] Created task ${taskId} for ${contactNameTrimmed} from ${companyNameTrimmed}`);

    // Send branded email notification to admin
    try {
      const gmailService = new GmailService();
      
      let emailSubject, emailHtml, emailText;
      
      if (source === 'guide-download') {
        // Guide Download Email Template
        emailSubject = `📥 New Guide Download: ${contactNameTrimmed} from ${companyNameTrimmed}`;
        emailHtml = `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
</head>
<body style="margin: 0; padding: 0; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif; background-color: #f4f6fb;">
  <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%" style="background-color: #f4f6fb; padding: 40px 20px;">
    <tr>
      <td align="center">
        <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="600" style="max-width: 600px; background: #ffffff; border-radius: 16px; box-shadow: 0 10px 30px rgba(11, 27, 69, 0.1); overflow: hidden;">
          <!-- Header with gradient -->
          <tr>
            <td style="background: linear-gradient(135deg, #0b1b45 0%, #1e3a8a 100%); padding: 32px 32px 24px; text-align: center;">
              <img src="https://cdn.prod.website-files.com/6801ddaf27d1495f8a02fd3f/68645bd391ea20fecb011c85_2656%20Webclip%20PChoosers.png" alt="Power Choosers" width="48" height="48" style="border-radius: 8px; border: 1px solid rgba(245, 158, 11, 0.3); background: #ffffff; padding: 4px;">
              <h1 style="margin: 16px 0 0; color: #ffffff; font-size: 24px; font-weight: 800; letter-spacing: -0.5px;">New Guide Download</h1>
            </td>
          </tr>
          
          <!-- Content -->
          <tr>
            <td style="padding: 32px;">
              <p style="margin: 0 0 20px; color: #0f172a; font-size: 16px; line-height: 1.6;">
                Someone just downloaded the <strong style="color: #0b1b45;">2026 Electricity Market Navigator</strong> guide.
              </p>
              
              <div style="background: linear-gradient(135deg, #fffaf4 0%, #fff5e6 100%); border-left: 4px solid #f59e0b; border-radius: 8px; padding: 20px; margin: 24px 0;">
                <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%">
                  <tr>
                    <td style="padding-bottom: 12px;">
                      <strong style="color: #0b1b45; font-size: 14px; text-transform: uppercase; letter-spacing: 0.5px;">Contact Name</strong>
                      <p style="margin: 4px 0 0; color: #0f172a; font-size: 16px; font-weight: 600;">${contactNameTrimmed}</p>
                    </td>
                  </tr>
                  <tr>
                    <td style="padding-bottom: 12px;">
                      <strong style="color: #0b1b45; font-size: 14px; text-transform: uppercase; letter-spacing: 0.5px;">Company</strong>
                      <p style="margin: 4px 0 0; color: #0f172a; font-size: 16px; font-weight: 600;">${companyNameTrimmed}</p>
                    </td>
                  </tr>
                  <tr>
                    <td>
                      <strong style="color: #0b1b45; font-size: 14px; text-transform: uppercase; letter-spacing: 0.5px;">Email</strong>
                      <p style="margin: 4px 0 0; color: #0b1b45; font-size: 16px;">
                        <a href="mailto:${emailLower}" style="color: #0b1b45; text-decoration: none; font-weight: 600;">${emailLower}</a>
                      </p>
                    </td>
                  </tr>
                </table>
              </div>
              
              <div style="margin-top: 24px; padding-top: 24px; border-top: 1px solid #e2e8f0;">
                <p style="margin: 0; color: #64748b; font-size: 13px; line-height: 1.5;">
                  A new task has been created in your CRM. Task ID: <code style="background: #f8fafc; padding: 2px 6px; border-radius: 4px; font-size: 12px;">${taskId}</code>
                </p>
              </div>
            </td>
          </tr>
          
          <!-- Footer -->
          <tr>
            <td style="background: #f8fafc; padding: 20px 32px; text-align: center; border-top: 1px solid #e2e8f0;">
              <p style="margin: 0; color: #64748b; font-size: 12px;">
                Power Choosers CRM • Automated Notification
              </p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;
        emailText = `New Guide Download\n\nSomeone just downloaded the 2026 Electricity Market Navigator guide.\n\nContact: ${contactNameTrimmed}\nCompany: ${companyNameTrimmed}\nEmail: ${emailLower}\n\nA new task has been created in your CRM. Task ID: ${taskId}`;
      } else {
        // Appointment Booking Email Template
        emailSubject = `📅 New ${source === 'home-page' ? 'Lead' : 'Consultation'}: ${contactNameTrimmed} - ${companyNameTrimmed}`;
        emailHtml = `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
</head>
<body style="margin: 0; padding: 0; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif; background-color: #f4f6fb;">
  <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%" style="background-color: #f4f6fb; padding: 40px 20px;">
    <tr>
      <td align="center">
        <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="600" style="max-width: 600px; background: #ffffff; border-radius: 16px; box-shadow: 0 10px 30px rgba(11, 27, 69, 0.1); overflow: hidden;">
          <!-- Header with gradient -->
          <tr>
            <td style="background: linear-gradient(135deg, #0b1b45 0%, #1e3a8a 100%); padding: 32px 32px 24px; text-align: center;">
              <img src="https://cdn.prod.website-files.com/6801ddaf27d1495f8a02fd3f/68645bd391ea20fecb011c85_2656%20Webclip%20PChoosers.png" alt="Power Choosers" width="48" height="48" style="border-radius: 8px; border: 1px solid rgba(245, 158, 11, 0.3); background: #ffffff; padding: 4px;">
              <h1 style="margin: 16px 0 0; color: #ffffff; font-size: 24px; font-weight: 800; letter-spacing: -0.5px;">${source === 'home-page' ? 'New Lead' : 'Scheduled Consultation'}</h1>
            </td>
          </tr>
          
          <!-- Content -->
          <tr>
            <td style="padding: 32px;">
              <p style="margin: 0 0 20px; color: #0f172a; font-size: 16px; line-height: 1.6;">
                ${source === 'home-page' ? 'A new lead has been submitted from your website.' : 'A consultation has been scheduled.'}
              </p>
              
              <div style="background: linear-gradient(135deg, #fffaf4 0%, #fff5e6 100%); border-left: 4px solid #f59e0b; border-radius: 8px; padding: 20px; margin: 24px 0;">
                <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%">
                  <tr>
                    <td style="padding-bottom: 12px;">
                      <strong style="color: #0b1b45; font-size: 14px; text-transform: uppercase; letter-spacing: 0.5px;">Contact Name</strong>
                      <p style="margin: 4px 0 0; color: #0f172a; font-size: 16px; font-weight: 600;">${contactNameTrimmed}</p>
                    </td>
                  </tr>
                  <tr>
                    <td style="padding-bottom: 12px;">
                      <strong style="color: #0b1b45; font-size: 14px; text-transform: uppercase; letter-spacing: 0.5px;">Company</strong>
                      <p style="margin: 4px 0 0; color: #0f172a; font-size: 16px; font-weight: 600;">${companyNameTrimmed}</p>
                    </td>
                  </tr>
                  <tr>
                    <td style="padding-bottom: 12px;">
                      <strong style="color: #0b1b45; font-size: 14px; text-transform: uppercase; letter-spacing: 0.5px;">Email</strong>
                      <p style="margin: 4px 0 0; color: #0b1b45; font-size: 16px;">
                        <a href="mailto:${emailLower}" style="color: #0b1b45; text-decoration: none; font-weight: 600;">${emailLower}</a>
                      </p>
                    </td>
                  </tr>
                  <tr>
                    <td style="padding-bottom: 12px;">
                      <strong style="color: #0b1b45; font-size: 14px; text-transform: uppercase; letter-spacing: 0.5px;">Phone</strong>
                      <p style="margin: 4px 0 0; color: #0f172a; font-size: 16px; font-weight: 600;">
                        <a href="tel:${phoneTrimmed.replace(/\s/g, '')}" style="color: #0b1b45; text-decoration: none;">${phoneTrimmed || 'Not provided'}</a>
                      </p>
                    </td>
                  </tr>
                  ${source === 'schedule' && appointmentDate ? `
                  <tr>
                    <td style="padding-bottom: 12px;">
                      <strong style="color: #0b1b45; font-size: 14px; text-transform: uppercase; letter-spacing: 0.5px;">Appointment Date</strong>
                      <p style="margin: 4px 0 0; color: #0f172a; font-size: 16px; font-weight: 600;">${appointmentDate}</p>
                    </td>
                  </tr>
                  ` : ''}
                  ${source === 'schedule' && selectedTime ? `
                  <tr>
                    <td style="padding-bottom: 12px;">
                      <strong style="color: #0b1b45; font-size: 14px; text-transform: uppercase; letter-spacing: 0.5px;">Time</strong>
                      <p style="margin: 4px 0 0; color: #0f172a; font-size: 16px; font-weight: 600;">${selectedTime}</p>
                    </td>
                  </tr>
                  ` : ''}
                  ${source === 'schedule' && additionalNotes ? `
                  <tr>
                    <td>
                      <strong style="color: #0b1b45; font-size: 14px; text-transform: uppercase; letter-spacing: 0.5px;">Additional Notes</strong>
                      <p style="margin: 4px 0 0; color: #0f172a; font-size: 15px; line-height: 1.5; white-space: pre-wrap;">${additionalNotes}</p>
                    </td>
                  </tr>
                  ` : ''}
                </table>
              </div>
              
              <div style="margin-top: 24px; padding-top: 24px; border-top: 1px solid #e2e8f0;">
                <p style="margin: 0; color: #64748b; font-size: 13px; line-height: 1.5;">
                  A new task has been created in your CRM. Task ID: <code style="background: #f8fafc; padding: 2px 6px; border-radius: 4px; font-size: 12px;">${taskId}</code>
                </p>
              </div>
            </td>
          </tr>
          
          <!-- Footer -->
          <tr>
            <td style="background: #f8fafc; padding: 20px 32px; text-align: center; border-top: 1px solid #e2e8f0;">
              <p style="margin: 0; color: #64748b; font-size: 12px;">
                Power Choosers CRM • Automated Notification
              </p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;
        emailText = `${source === 'home-page' ? 'New Lead' : 'Scheduled Consultation'}\n\nContact: ${contactNameTrimmed}\nCompany: ${companyNameTrimmed}\nEmail: ${emailLower}\nPhone: ${phoneTrimmed || 'Not provided'}${source === 'schedule' && appointmentDate ? `\nDate: ${appointmentDate}` : ''}${source === 'schedule' && selectedTime ? `\nTime: ${selectedTime}` : ''}${source === 'schedule' && additionalNotes ? `\n\nAdditional Notes:\n${additionalNotes}` : ''}\n\nA new task has been created in your CRM. Task ID: ${taskId}`;
      }
      
      await gmailService.sendEmail({
        to: ADMIN_EMAIL,
        subject: emailSubject,
        html: emailHtml,
        text: emailText,
        userEmail: ADMIN_EMAIL,
        ownerId: ADMIN_EMAIL
      });
      
      logger.log(`[Create Booking] Sent notification email to ${ADMIN_EMAIL} for ${source}`);
    } catch (emailError) {
      // Don't fail the booking if email fails - just log it
      logger.warn('[Create Booking] Failed to send notification email:', emailError.message);
    }

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

