import { json } from '@sveltejs/kit';
import nodemailer from 'nodemailer';

export async function POST({ request }) {
  try {
    const body = await request.json();
    const { to, subject, reason, residentName, qrCodeUrl, qrId, includeQR } = body;
    
    const emailUser = process.env.EMAIL_USER;
    const emailPass = process.env.EMAIL_PASS;
    const appUrl = process.env.APP_URL || 'http://localhost:5173';
    
    // Create transporter with optimized settings for faster sending
    const transporter = nodemailer.createTransport({
      service: 'gmail',
      auth: {
        user: emailUser,
        pass: emailPass
      },
      // These options speed up the connection
      connectionTimeout: 5000,
      greetingTimeout: 5000,
      socketTimeout: 10000,
      // Pool connections for better performance
      pool: true,
      maxConnections: 5,
      maxMessages: 100
    });
    
    // Simplified HTML for faster rendering
    const htmlContent = `
      <div style="font-family: Arial, sans-serif; max-width: 600px;">
        <div style="background: #0f2060; padding: 20px; text-align: center;">
          <h1 style="color: white; margin: 0;">Barangay Pag-Asa</h1>
          <p style="color: rgba(255,255,255,0.8);">Resident Registration</p>
        </div>
        <div style="padding: 20px;">
          <h2 style="color: #0f2060;">Registration Declined</h2>
          <p>Dear <strong>${residentName}</strong>,</p>
          <p>Your resident registration has been <strong style="color: #dc2626;">declined</strong>.</p>
          <div style="background: #fef2f2; padding: 15px; margin: 20px 0; border-left: 4px solid #dc2626;">
            <strong>Reason:</strong><br>${reason.replace(/\n/g, '<br>')}
          </div>
          ${includeQR ? `
            <div style="text-align: center; margin: 30px 0;">
              ${qrCodeUrl ? `<img src="${qrCodeUrl}" alt="QR Code" style="width: 150px; height: 150px; margin: 10px auto;" />` : ''}
              <p><strong>QR ID: ${qrId}</strong></p>
              <a href="${appUrl}/register/${qrId}" 
                 style="display: inline-block; background: #0f2060; color: white; padding: 10px 20px; text-decoration: none; border-radius: 5px;">
                Click Here to Re-register
              </a>
            </div>
          ` : ''}
          <p style="margin-top: 30px; font-size: 12px; color: #666;">
            Barangay Pag-Asa, Olongapo City, Zambales
          </p>
        </div>
      </div>
    `;
    
    // Send email without waiting for verification (faster)
    const info = await transporter.sendMail({
      from: `"Barangay Pag-Asa" <${emailUser}>`,
      to: to,
      subject: subject,
      html: htmlContent,
      text: `Dear ${residentName},\n\nYour registration has been declined.\n\nReason: ${reason}\n\n${includeQR ? `Re-register: ${appUrl}/register/${qrId}` : 'Visit Barangay Hall to register again.'}`
    });
    
    return json({ success: true, messageId: info.messageId });
    
  } catch (error) {
    console.error('Email error:', error);
    return json({ 
      error: 'Failed to send email', 
      message: error instanceof Error ? error.message : 'Unknown error'
    }, { status: 500 });
  }
}