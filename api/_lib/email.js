const { getEnvVar } = require('./env');

function escapeHtml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

async function sendAdminEmail({ subject, html }) {
  const apiKey = getEnvVar('RESEND_API_KEY');
  const adminEmail = getEnvVar('ADMIN_ORDER_EMAIL');
  const fromEmail = getEnvVar('ADMIN_FROM_EMAIL') || 'orders@sallysmilecharityfoundation.org';

  if (!apiKey || !adminEmail) {
    return { sent: false, reason: 'email-config-missing' };
  }

  const response = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      from: fromEmail,
      to: [adminEmail],
      subject,
      html,
    }),
  });

  if (!response.ok) {
    const details = await response.text();
    const emailError = new Error('Unable to send admin notification email.');
    emailError.statusCode = response.status || 502;
    emailError.details = details;
    throw emailError;
  }

  return { sent: true };
}

function renderAdminEmail(payment, items) {
  const total = `${payment.currency} ${Number(payment.total || 0).toFixed(2)}`;
  const itemMarkup = items.length
    ? `<ul>${items
      .map((item) => `<li><strong>${escapeHtml(item.title_snapshot)}</strong> x ${item.quantity} - ${escapeHtml(payment.currency)} ${Number(item.line_total).toFixed(2)}</li>`)
      .join('')}</ul>`
    : '<p>No line items attached.</p>';

  const title = payment.kind === 'donation'
    ? `New Donation Received - ${total}`
    : `New Shop Order Paid - ${payment.reference}`;

  const summary = payment.kind === 'donation'
    ? `<p><strong>Donation Amount:</strong> ${total}</p>`
    : `<p><strong>Subtotal:</strong> ${payment.currency} ${Number(payment.subtotal || 0).toFixed(2)}</p>
       <p><strong>Delivery Fee:</strong> ${payment.currency} ${Number(payment.delivery_fee || 0).toFixed(2)}</p>
       <p><strong>Total:</strong> ${total}</p>
       <p><strong>Fulfilment:</strong> ${escapeHtml(payment.fulfillment_method || 'pickup')}</p>
       <p><strong>Area:</strong> ${escapeHtml(payment.delivery_area || 'N/A')}</p>
       <p><strong>Address:</strong> ${escapeHtml(payment.address || 'N/A')}</p>
       ${itemMarkup}`;

  return {
    subject: title,
    html: `
      <div style="font-family:Arial,sans-serif;color:#172235;line-height:1.6;">
        <h2>${escapeHtml(title)}</h2>
        <p><strong>Reference:</strong> ${escapeHtml(payment.reference)}</p>
        <p><strong>Status:</strong> ${escapeHtml(payment.status)}</p>
        <p><strong>Name:</strong> ${escapeHtml(payment.customer_name)}</p>
        <p><strong>Email:</strong> ${escapeHtml(payment.customer_email)}</p>
        <p><strong>Phone:</strong> ${escapeHtml(payment.customer_phone)}</p>
        ${summary}
        <p><strong>Notes:</strong> ${escapeHtml(payment.notes || 'None')}</p>
      </div>
    `,
  };
}

module.exports = {
  renderAdminEmail,
  sendAdminEmail,
};
