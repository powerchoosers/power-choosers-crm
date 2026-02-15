// API endpoint for creating bookings from public website (schedule.html, index.html)
// Uses Supabase Admin to bypass RLS for public submissions
// Creates contact, account, and task with admin ownership

import { supabaseAdmin } from './_supabase.js';
import { cors } from './_cors.js';
import logger from './_logger.js';
import { ZohoMailService } from './email/zoho-service.js';

const ADMIN_EMAIL = 'l.patterson@nodalpoint.io';

export default async function handler(req, res) {
  // Handle CORS
  if (cors(req, res)) return;

  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Method not allowed' });
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
      source = 'schedule' // 'schedule', 'home-page', or 'guide-download'
    } = req.body;

    // Validate required fields
    if (!contactName || !companyName || !email) {
      res.status(400).json({ error: 'Missing required fields: contactName, companyName, email' });
      return;
    }

    // Phone is required for appointments, optional for guide downloads
    if (source !== 'guide-download' && !phone) {
      res.status(400).json({ error: 'Missing required field: phone' });
      return;
    }

    if (!supabaseAdmin) {
      logger.error('[Create Booking] Supabase Admin not initialized');
      res.status(500).json({ error: 'Database not available' });
      return;
    }

    const emailLower = email.toLowerCase().trim();
    const companyNameTrimmed = companyName.trim();
    const contactNameTrimmed = contactName.trim();
    const phoneTrimmed = phone ? phone.trim() : '';

    // Step 0: Resolve admin user ID for ownership
    const { data: adminUser } = await supabaseAdmin
      .from('users')
      .select('id')
      .eq('email', ADMIN_EMAIL)
      .single();

    const ownerId = adminUser?.id || null;

    // Step 1: Check/create account
    let accountId = null;
    const { data: existingAccount } = await supabaseAdmin
      .from('accounts')
      .select('id')
      .ilike('name', companyNameTrimmed)
      .maybeSingle();

    if (existingAccount) {
      accountId = existingAccount.id;
    } else {
      const { data: newAccount, error: accError } = await supabaseAdmin
        .from('accounts')
        .insert([{
          name: companyNameTrimmed,
          ownerId: ownerId,
          assignedTo: ownerId,
          createdBy: ownerId,
          metadata: { source }
        }])
        .select('id')
        .single();

      if (accError) {
        logger.error('[Create Booking] Account creation error:', accError);
      } else {
        accountId = newAccount.id;
      }
    }

    // Step 2: Check/create contact
    let contactId = null;
    const { data: existingContact } = await supabaseAdmin
      .from('contacts')
      .select('id, firstName, lastName, phone, mobile, workPhone, accountId')
      .eq('email', emailLower)
      .maybeSingle();

    if (existingContact) {
      contactId = existingContact.id;
      // Update contact if needed (e.g. link to account if missing)
      const updates = {};
      if (!existingContact.accountId && accountId) updates.accountId = accountId;
      if (!existingContact.firstName && contactNameTrimmed) {
        const nameParts = contactNameTrimmed.split(' ');
        updates.firstName = nameParts[0];
        updates.lastName = nameParts.slice(1).join(' ');
      }

      if (Object.keys(updates).length > 0) {
        await supabaseAdmin.from('contacts').update(updates).eq('id', contactId);
      }
    } else {
      const nameParts = contactNameTrimmed.split(' ');
      const { data: newContact, error: conError } = await supabaseAdmin
        .from('contacts')
        .insert([{
          firstName: nameParts[0] || contactNameTrimmed,
          lastName: nameParts.slice(1).join(' ') || '',
          email: emailLower,
          phone: phoneTrimmed,
          mobile: phoneTrimmed,
          accountId: accountId,
          ownerId: ownerId,
          assignedTo: ownerId,
          createdBy: ownerId,
          metadata: { source }
        }])
        .select('id')
        .single();

      if (conError) {
        logger.error('[Create Booking] Contact creation error:', conError);
      } else {
        contactId = newContact.id;
      }
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

    const { data: newTask, error: taskError } = await supabaseAdmin
      .from('tasks')
      .insert([{
        title: taskTitle,
        type: 'phone-call',
        priority: 'high',
        contact: contactNameTrimmed,
        account: companyNameTrimmed,
        contactId: contactId,
        accountId: accountId,
        status: 'pending',
        notes: taskNotes,
        ownerId: ownerId,
        assignedTo: ownerId,
        createdBy: ownerId,
        dueDate: appointmentDate || null,
        dueTime: selectedTime || null
      }])
      .select('id')
      .single();

    if (taskError) {
      logger.error('[Create Booking] Task creation error:', taskError);
    }
    const taskId = newTask?.id;

    logger.log(`[Create Booking] Successfully processed ${source} for ${contactNameTrimmed} (Task: ${taskId})`);

    // Step 4: Send branded notification to admin via Zoho
    try {
      const zohoService = new ZohoMailService();

      let emailSubject, emailHtml, emailText;

      if (source === 'guide-download') {
        emailSubject = `📥 New Guide Download: ${contactNameTrimmed} from ${companyNameTrimmed}`;
        emailHtml = `
<!DOCTYPE html>
<html>
<body style="font-family: sans-serif; background-color: #f4f6fb; padding: 20px;">
  <div style="max-width: 600px; margin: 0 auto; background: #ffffff; border-radius: 12px; overflow: hidden; box-shadow: 0 4px 12px rgba(0,0,0,0.1);">
    <div style="background: #0b1b45; padding: 24px; text-align: center; color: white;">
      <h2 style="margin: 0;">New Guide Download</h2>
    </div>
    <div style="padding: 24px;">
      <p>Someone just downloaded the <strong>2026 Electricity Market Navigator</strong> guide.</p>
      <div style="background: #f8fafc; border-left: 4px solid #f59e0b; padding: 16px; margin: 20px 0;">
        <p><strong>Contact:</strong> ${contactNameTrimmed}</p>
        <p><strong>Company:</strong> ${companyNameTrimmed}</p>
        <p><strong>Email:</strong> ${emailLower}</p>
      </div>
      <p style="color: #64748b; font-size: 13px;">A new task has been created. Task ID: ${taskId || 'N/A'}</p>
    </div>
  </div>
</body>
</html>`;
        emailText = `New Guide Download\n\nContact: ${contactNameTrimmed}\nCompany: ${companyNameTrimmed}\nEmail: ${emailLower}\n\nTask ID: ${taskId}`;
      } else {
        emailSubject = `📅 New ${source === 'home-page' ? 'Lead' : 'Consultation'}: ${contactNameTrimmed} - ${companyNameTrimmed}`;
        emailHtml = `
<!DOCTYPE html>
<html>
<body style="font-family: sans-serif; background-color: #f4f6fb; padding: 20px;">
  <div style="max-width: 600px; margin: 0 auto; background: #ffffff; border-radius: 12px; overflow: hidden; box-shadow: 0 4px 12px rgba(0,0,0,0.1);">
    <div style="background: #0b1b45; padding: 24px; text-align: center; color: white;">
      <h2 style="margin: 0;">${source === 'home-page' ? 'New Website Lead' : 'Consultation Scheduled'}</h2>
    </div>
    <div style="padding: 24px;">
      <div style="background: #f8fafc; border-left: 4px solid #f59e0b; padding: 16px; margin: 20px 0;">
        <p><strong>Contact:</strong> ${contactNameTrimmed}</p>
        <p><strong>Company:</strong> ${companyNameTrimmed}</p>
        <p><strong>Email:</strong> ${emailLower}</p>
        <p><strong>Phone:</strong> ${phoneTrimmed || 'Not provided'}</p>
        ${appointmentDate ? `<p><strong>Date:</strong> ${appointmentDate}</p>` : ''}
        ${selectedTime ? `<p><strong>Time:</strong> ${selectedTime}</p>` : ''}
      </div>
      ${additionalNotes ? `<p><strong>Notes:</strong><br/>${additionalNotes}</p>` : ''}
      <p style="color: #64748b; font-size: 13px;">A new task has been created. Task ID: ${taskId || 'N/A'}</p>
    </div>
  </div>
</body>
</html>`;
        emailText = `${source === 'home-page' ? 'New Lead' : 'Scheduled Consultation'}\n\nContact: ${contactNameTrimmed}\nCompany: ${companyNameTrimmed}\nEmail: ${emailLower}\nPhone: ${phoneTrimmed || 'Not provided'}\n\nTask ID: ${taskId}`;
      }

      await zohoService.sendEmail({
        to: ADMIN_EMAIL,
        subject: emailSubject,
        html: emailHtml,
        text: emailText,
        userEmail: ADMIN_EMAIL
      });

      logger.log(`[Create Booking] Sent notification email via Zoho to ${ADMIN_EMAIL}`);
    } catch (emailError) {
      logger.warn('[Create Booking] Failed to send notification email:', emailError.message);
    }

    res.status(200).json({
      success: true,
      contactId,
      taskId,
      message: 'Booking created successfully'
    });

  } catch (error) {
    logger.error('[Create Booking] Fatal error:', error);
    res.status(500).json({ error: 'Failed to create booking', details: error.message });
  }
}

