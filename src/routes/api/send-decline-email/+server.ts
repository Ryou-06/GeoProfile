import { env } from '$env/dynamic/private';
import { error, json, type RequestHandler } from '@sveltejs/kit';
import { cert, getApps, initializeApp } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';
import { getFirestore } from 'firebase-admin/firestore';
import nodemailer from 'nodemailer';

const MAX_EMAILS_PER_HOUR = 5;
const HOUR_MS = 60 * 60 * 1000;
const sendAttempts = new Map<string, number[]>();

function escapeHtml(value: string) {
  return value.replace(/[&<>'"]/g, (character) => {
    const entities: Record<string, string> = {
      '&': '&amp;',
      '<': '&lt;',
      '>': '&gt;',
      "'": '&#39;',
      '"': '&quot;'
    };
    return entities[character];
  });
}

function getFirebaseAdmin() {
  const projectId = env.FIREBASE_ADMIN_PROJECT_ID;
  const clientEmail = env.FIREBASE_ADMIN_CLIENT_EMAIL;
  const privateKey = env.FIREBASE_ADMIN_PRIVATE_KEY?.replace(/\\n/g, '\n');

  if (!projectId || !clientEmail || !privateKey) {
    throw error(503, 'Email service is not configured.');
  }

  const app =
    getApps()[0] ??
    initializeApp({
      credential: cert({ projectId, clientEmail, privateKey })
    });

  return { auth: getAuth(app), db: getFirestore(app) };
}

function enforceRateLimit(uid: string) {
  const now = Date.now();
  const recentAttempts = (sendAttempts.get(uid) ?? []).filter((time) => now - time < HOUR_MS);
  if (recentAttempts.length >= MAX_EMAILS_PER_HOUR) {
    throw error(429, 'Email limit reached. Please try again later.');
  }
  recentAttempts.push(now);
  sendAttempts.set(uid, recentAttempts);
}

export const POST: RequestHandler = async ({ request }) => {
  try {
    const authorization = request.headers.get('authorization');
    const token = authorization?.startsWith('Bearer ') ? authorization.slice(7) : null;
    if (!token) throw error(401, 'Sign in before sending an email.');

    const { auth, db } = getFirebaseAdmin();
    const decodedToken = await auth.verifyIdToken(token);
    const userSnapshot = await db.collection('users').doc(decodedToken.uid).get();
    const role = userSnapshot.data()?.role;
    if (role !== 'admin' && role !== 'staff') throw error(403, 'You are not allowed to send decline emails.');

    const body = await request.json();
    const residentId = typeof body.residentId === 'string' ? body.residentId.trim() : '';
    const reason = typeof body.reason === 'string' ? body.reason.trim() : '';
    const includeQR = body.includeQR === true;
    if (!residentId || residentId.length > 256) throw error(400, 'A valid resident is required.');
    if (reason.length < 5 || reason.length > 2000) {
      throw error(400, 'The decline reason must be between 5 and 2,000 characters.');
    }

    enforceRateLimit(decodedToken.uid);

    const residentSnapshot = await db.collection('residents').doc(residentId).get();
    if (!residentSnapshot.exists) throw error(404, 'Resident record not found.');
    const resident = residentSnapshot.data() ?? {};
    const to = typeof resident.email === 'string' ? resident.email.trim() : '';
    if (!to) throw error(400, 'This resident does not have an email address.');
    const residentName =
      typeof resident.name === 'string' && resident.name.trim()
        ? resident.name.trim()
        : [resident.firstName, resident.lastName].filter((value) => typeof value === 'string').join(' ').trim() || 'Resident';
    const qrId = typeof resident.qrId === 'string' ? resident.qrId : '';

    const emailUser = env.EMAIL_USER;
    const emailPass = env.EMAIL_PASS;
    const appUrl = (env.APP_URL || 'http://localhost:5173').replace(/\/$/, '');
    if (!emailUser || !emailPass) throw error(503, 'Email service is not configured.');

    const transporter = nodemailer.createTransport({
      service: 'gmail',
      auth: {
        user: emailUser,
        pass: emailPass
      },
      connectionTimeout: 5000,
      greetingTimeout: 5000,
      socketTimeout: 10000,
      pool: true,
      maxConnections: 5,
      maxMessages: 100
    });

    const registrationUrl = qrId ? `${appUrl}/register/${encodeURIComponent(qrId)}` : '';
    const qrCodeUrl = registrationUrl
      ? `https://api.qrserver.com/v1/create-qr-code/?size=200x200&data=${encodeURIComponent(registrationUrl)}`
      : '';
    const safeName = escapeHtml(residentName);
    const safeReason = escapeHtml(reason).replace(/\n/g, '<br>');

    const htmlContent = `
      <div style="font-family: Arial, sans-serif; max-width: 600px;">
        <div style="background: #0f2060; padding: 20px; text-align: center;">
          <h1 style="color: white; margin: 0;">Barangay Pag-Asa</h1>
          <p style="color: rgba(255,255,255,0.8);">Resident Registration</p>
        </div>
        <div style="padding: 20px;">
          <h2 style="color: #0f2060;">Registration Declined</h2>
          <p>Dear <strong>${safeName}</strong>,</p>
          <p>Your resident registration has been <strong style="color: #dc2626;">declined</strong>.</p>
          <div style="background: #fef2f2; padding: 15px; margin: 20px 0; border-left: 4px solid #dc2626;">
            <strong>Reason:</strong><br>${safeReason}
          </div>
          ${includeQR && registrationUrl ? `
            <div style="text-align: center; margin: 30px 0;">
              <img src="${qrCodeUrl}" alt="QR Code" style="width: 150px; height: 150px; margin: 10px auto;" />
              <p><strong>QR ID: ${qrId}</strong></p>
              <a href="${registrationUrl}"
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
    
    const info = await transporter.sendMail({
      from: `"Barangay Pag-Asa" <${emailUser}>`,
      to: to,
      subject: 'Your Resident Registration has been Declined',
      html: htmlContent,
      text: `Dear ${residentName},\n\nYour registration has been declined.\n\nReason: ${reason}\n\n${includeQR && registrationUrl ? `Re-register: ${registrationUrl}` : 'Visit Barangay Hall to register again.'}`
    });

    return json({ success: true, messageId: info.messageId });
  } catch (error) {
    if (error && typeof error === 'object' && 'status' in error) throw error;
    console.error('Email error:', error);
    return json({ error: 'Failed to send email' }, { status: 500 });
  }
};
