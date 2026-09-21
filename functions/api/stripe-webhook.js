// =============================================
// WEBHOOK: Fires when Stripe confirms a payment.
// Generates a signed-agreement PDF and emails it to both parties.
// File location: /functions/api/stripe-webhook.js
// =============================================

import Stripe from 'stripe';
import { Resend } from 'resend';
import { PDFDocument, StandardFonts, rgb } from 'pdf-lib';

export async function onRequestPost({ request, env }) {
  const stripe = new Stripe(env.STRIPE_SECRET_KEY);
  const resend = new Resend(env.RESEND_API_KEY);

  const sig = request.headers.get('stripe-signature');
  const body = await request.text();

  let event;
  try {
    event = await stripe.webhooks.constructEventAsync(
      body, sig, env.STRIPE_WEBHOOK_SECRET
    );
  } catch (err) {
    console.error('Webhook signature verification failed:', err.message);
    return new Response(`Webhook Error: ${err.message}`, { status: 400 });
  }

  if (event.type !== 'checkout.session.completed') {
    return new Response('ok', { status: 200 });
  }

  const session = event.data.object;
  const data = await env.CLIENT_SIGNATURES.get(session.id, 'json');

  if (!data) {
    console.error('No signature data for session', session.id);
    return new Response('ok', { status: 200 });
  }

  // ---------- Build the PDF ----------
  const pdfDoc = await PDFDocument.create();
  const page = pdfDoc.addPage([612, 792]);
  const { width, height } = page.getSize();
  const font = await pdfDoc.embedFont(StandardFonts.Helvetica);
  const bold = await pdfDoc.embedFont(StandardFonts.HelveticaBold);

  const orange = rgb(1, 0.48, 0);
  const dark = rgb(0.1, 0.1, 0.1);
  const grey = rgb(0.5, 0.5, 0.5);
  const left = 50;
  let y = height - 60;

  page.drawText('BOOSTINGER', { x: left, y, size: 24, font: bold, color: orange });
  y -= 24;
  page.drawText('Signed Service Agreement', { x: left, y, size: 12, font, color: dark });
  y -= 30;

  page.drawText('Client Information', { x: left, y, size: 13, font: bold, color: orange });
  y -= 20;

  const clientLines = [
    ['Business', data.businessName || '—'],
    ['Contact',  data.clientName   || '—'],
    ['Email',    data.clientEmail  || '—'],
    ['Phone',    data.clientPhone  || '—'],
    ['Address',  data.clientAddress || '—'],
  ];
  for (const [label, value] of clientLines) {
    page.drawText(label + ':', { x: left, y, size: 10, font: bold, color: dark });
    page.drawText(String(value), { x: left + 80, y, size: 10, font, color: dark });
    y -= 16;
  }

  y -= 14;
  page.drawText('Package Details', { x: left, y, size: 13, font: bold, color: orange });
  y -= 20;

  const pkgLines = [
    ['Tier',                    data.planLabel],
    ['BoostedSEO Add-On',       data.boost === 'yes' ? 'Yes' : 'No'],
    ['Project Deposit (50%)',   '$' + data.deposit.toLocaleString()],
    ['First Month Maintenance', '$' + data.monthly.toLocaleString()],
    ['Total Paid Today',        '$' + data.total.toLocaleString()],
    ['Stripe Session',          session.id],
  ];
  for (const [label, value] of pkgLines) {
    page.drawText(label + ':', { x: left, y, size: 10, font: bold, color: dark });
    page.drawText(String(value), { x: left + 160, y, size: 10, font, color: dark });
    y -= 16;
  }

  y -= 24;
  page.drawText('Client Signature', { x: left, y, size: 12, font: bold, color: dark });
  y -= 10;

  if (data.signature && data.signature.startsWith('data:image/png;base64,')) {
    try {
      const base64 = data.signature.split(',')[1];
      const bytes = Uint8Array.from(atob(base64), c => c.charCodeAt(0));
      const png = await pdfDoc.embedPng(bytes);
      const maxW = 260, maxH = 100;
      const scale = Math.min(maxW / png.width, maxH / png.height, 1);
      const w = png.width * scale;
      const h = png.height * scale;
      page.drawImage(png, { x: left, y: y - h, width: w, height: h });
      y -= h + 10;
    } catch (e) {
      console.error('Signature embed failed:', e);
      page.drawText('[signature could not be rendered]', { x: left, y, size: 9, font, color: grey });
      y -= 20;
    }
  } else {
    page.drawText('[no signature on file]', { x: left, y, size: 9, font, color: grey });
    y -= 20;
  }

  page.drawLine({ start: { x: left, y }, end: { x: left + 300, y }, thickness: 0.5, color: grey });
  y -= 14;
  page.drawText('Signed by: ' + (data.clientName || '—'), { x: left, y, size: 10, font, color: dark });
  y -= 14;
  page.drawText('Date: ' + new Date(data.createdAt).toLocaleString('en-US'), { x: left, y, size: 10, font, color: dark });

  page.drawText('Boostinger · getboostinger@gmail.com · (951) 428-1407', {
    x: left, y: 40, size: 9, font, color: grey
  });

  const pdfBytes = await pdfDoc.save();

  // Base64 encode in chunks (avoids stack overflow on larger PDFs)
  let binary = '';
  const chunk = 8192;
  for (let i = 0; i < pdfBytes.length; i += chunk) {
    binary += String.fromCharCode.apply(null, pdfBytes.subarray(i, i + chunk));
  }
  const pdfBase64 = btoa(binary);

  // ---------- Email ----------
  const subject = `Signed Agreement — ${data.planLabel} Tier (Boostinger)`;
  const bodyText =
`Hi ${data.clientName || 'there'},

Thank you for your payment of $${data.total.toLocaleString()} to Boostinger.

Your signed service agreement is attached as a PDF for your records.

Next steps:
1. You'll receive your project kickoff questions shortly.
2. Once you send us your content and assets, your 7-day (or 14-day for Premium) build timeline begins.

A separate receipt from Stripe is also on its way to your inbox.

— Nick Vogen
Boostinger
getboostinger@gmail.com
(951) 428-1407`;

  try {
    await resend.emails.send({
      from: 'Boostinger <onboarding@resend.dev>',
      to: [data.clientEmail, 'getboostinger@gmail.com'],
      subject,
      text: bodyText,
      attachments: [{
        filename: `Boostinger-Signed-${data.planLabel}-${session.id.slice(-6)}.pdf`,
        content: pdfBase64,
      }],
    });
    console.log('Email sent for session', session.id);
  } catch (err) {
    console.error('Resend error:', err);
  }

  return new Response('ok', { status: 200 });
}
