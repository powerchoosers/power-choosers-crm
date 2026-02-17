import { supabaseAdmin } from '@/lib/supabase';
import { cors } from './_cors.js';
import logger from './_logger.js';
import { ZohoMailService } from './email/zoho-service.js';
import { render } from '@react-email/render';
import BookingConfirmation from '../../emails/BookingConfirmation';
import AdminBookingAlert from '../../emails/AdminBookingAlert';
import React from 'react';
import { NextApiRequest, NextApiResponse } from 'next';

const ADMIN_EMAIL = 'l.patterson@nodalpoint.io';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
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
      source = 'schedule' // 'schedule', 'home-page', 'guide-download', 'forensic-briefing'
    } = req.body;

    // Validate required fields
    if (!contactName || !companyName || !email) {
      res.status(400).json({ error: 'Missing required fields: contactName, companyName, email' });
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
      const contact = existingContact as any; // Cast to avoid TS empty object error
      contactId = contact.id;

      // Update contact if needed (link to account or update name)
      const updates: any = {};
      if (!contact.accountId && accountId) updates.accountId = accountId;
      if (!contact.firstName && contactNameTrimmed) {
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
    const taskTitle = source === 'forensic-briefing'
      ? `Forensic Briefing: ${contactNameTrimmed} - ${companyNameTrimmed}`
      : source === 'home-page'
        ? `New Lead: ${contactNameTrimmed} - ${companyNameTrimmed}`
        : source === 'guide-download'
          ? `Guide Download: ${contactNameTrimmed} - ${companyNameTrimmed}`
          : `Consultation: ${contactNameTrimmed} - ${companyNameTrimmed}`;

    const taskNotes = source === 'forensic-briefing'
      ? `FORENSIC BRIEFING SCHEDULED\n\nContact: ${contactNameTrimmed}\nCompany: ${companyNameTrimmed}\nEmail: ${emailLower}\nPhone: ${phoneTrimmed}\nDate: ${appointmentDate}\nTime: ${selectedTime}\n\nContext: User booked via Analysis Email link.`
      : source === 'home-page'
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
        contact: contactNameTrimmed, // Legacy string fields
        account: companyNameTrimmed, // Legacy string fields
        contactId: contactId,
        accountId: accountId,
        status: 'pending',
        notes: taskNotes,
        ownerId: ownerId,
        assignedTo: ownerId,
        createdBy: ownerId,
        dueDate: appointmentDate || new Date().toISOString().split('T')[0],
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

      const emailSubject = source === 'guide-download'
        ? `📥 Guide Download: ${companyNameTrimmed}`
        : `📅 ${source === 'forensic-briefing' ? 'Forensic Briefing' : 'New Lead'}: ${contactNameTrimmed} - ${companyNameTrimmed}`;

      const emailHtml = await render(
        <AdminBookingAlert
          contactName={contactNameTrimmed}
          companyName={companyNameTrimmed}
          email={emailLower}
          phone={phoneTrimmed}
          date={appointmentDate}
          time={selectedTime}
          source={source}
          notes={additionalNotes}
          taskId={taskId}
        />
      );

      await zohoService.sendEmail({
        to: ADMIN_EMAIL,
        subject: emailSubject,
        html: emailHtml,
        text: `New ${source} from ${contactNameTrimmed}`,
        userEmail: ADMIN_EMAIL
      });

      logger.log(`[Create Booking] Sent notification email via Zoho to ${ADMIN_EMAIL}`);

      // Step 5: Send confirmation to Customer
      if (source !== 'guide-download' && emailLower) {
        const customerSubject = "Forensic Briefing Confirmed // Nodal Point";
        const customerHtml = await render(
          <BookingConfirmation
            contactName={contactNameTrimmed}
            companyName={companyNameTrimmed}
            date={appointmentDate}
            time={selectedTime}
            meetingLink="https://meet.google.com/your-meeting-link" // Optional: Replace with dynamic link if available
          />
        );

        await zohoService.sendEmail({
          to: emailLower,
          subject: customerSubject,
          html: customerHtml,
          from: 'signal@nodalpoint.io',
          fromName: 'Nodal Point Security',
          userEmail: ADMIN_EMAIL
        });
        logger.log(`[Create Booking] Sent confirmation email to ${emailLower}`);
      }

    } catch (emailError: any) {
      logger.warn('[Create Booking] Failed to send notification email:', emailError.message);
    }

    res.status(200).json({
      success: true,
      contactId,
      taskId,
      message: 'Booking created successfully'
    });

  } catch (error: any) {
    logger.error('[Create Booking] Fatal error:', error);
    res.status(500).json({ error: 'Failed to create booking', details: error.message });
  }
}
