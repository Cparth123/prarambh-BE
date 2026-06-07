const nodemailer = require('nodemailer');
const User = require('../models/User');
const Store = require('../models/Store');

// Retrieve configurations from environment
const emailService = process.env.EMAIL_SERVICE || 'gmail';
const emailUser = process.env.EMAIL_USER || 'phraram@gmail.com';
const emailPassword = process.env.EMAIL_PASSWORD || '';

let transporter = null;
if (emailUser && emailPassword && emailPassword !== 'your_app_password') {
  try {
    transporter = nodemailer.createTransport({
      service: emailService,
      auth: {
        user: emailUser,
        pass: emailPassword,
      },
    });
    console.log('[EMAIL SERVICE] Nodemailer transporter initialized successfully.');
  } catch (error) {
    console.error('[EMAIL SERVICE] Failed to initialize Nodemailer transporter:', error.message);
  }
} else {
  console.log('[EMAIL SERVICE] Nodemailer credentials not fully configured or using defaults. Running in simulator mode.');
}

/**
 * Helper to construct the CSS styles for the email template
 */
const getSharedStyles = () => `
  body {
    font-family: 'Inter', -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
    background-color: #f3f4f6;
    margin: 0;
    padding: 0;
    -webkit-font-smoothing: antialiased;
  }
  .container {
    max-width: 600px;
    margin: 30px auto;
    background-color: #ffffff;
    border-radius: 16px;
    overflow: hidden;
    box-shadow: 0 10px 15px -3px rgba(0, 0, 0, 0.05), 0 4px 6px -2px rgba(0, 0, 0, 0.02);
    border: 1px solid #e5e7eb;
  }
  .header {
    padding: 40px 30px;
    text-align: center;
    color: #ffffff;
  }
  .header-customer {
    background: linear-gradient(135deg, #4f46e5 0%, #6366f1 100%);
  }
  .header-seller {
    background: linear-gradient(135deg, #0d9488 0%, #0f766e 100%);
  }
  .header h1 {
    margin: 0;
    font-size: 28px;
    font-weight: 800;
    letter-spacing: -0.025em;
  }
  .header p {
    margin: 8px 0 0 0;
    font-size: 16px;
    opacity: 0.9;
  }
  .content {
    padding: 30px;
  }
  .section-title {
    font-size: 16px;
    font-weight: 700;
    color: #111827;
    margin-top: 24px;
    margin-bottom: 12px;
    text-transform: uppercase;
    letter-spacing: 0.05em;
    border-bottom: 2px solid #f3f4f6;
    padding-bottom: 8px;
  }
  .card {
    background-color: #f9fafb;
    border: 1px solid #f3f4f6;
    border-radius: 12px;
    padding: 20px;
    margin-bottom: 20px;
  }
  .card-grid {
    display: table;
    width: 100%;
  }
  .card-row {
    display: table-row;
  }
  .card-label {
    display: table-cell;
    font-weight: 600;
    color: #4b5563;
    padding-bottom: 8px;
    width: 150px;
    font-size: 14px;
  }
  .card-value {
    display: table-cell;
    color: #1f2937;
    padding-bottom: 8px;
    font-size: 14px;
  }
  .table {
    width: 100%;
    border-collapse: collapse;
    margin-bottom: 20px;
  }
  .table th {
    text-align: left;
    padding: 12px;
    background-color: #f3f4f6;
    color: #374151;
    font-weight: 600;
    font-size: 13px;
    border-bottom: 2px solid #e5e7eb;
  }
  .table td {
    padding: 14px 12px;
    border-bottom: 1px solid #f3f4f6;
    color: #4b5563;
    font-size: 14px;
    vertical-align: middle;
  }
  .table td.product-name {
    font-weight: 600;
    color: #1f2937;
  }
  .table td.align-right {
    text-align: right;
  }
  .badge {
    display: inline-block;
    padding: 4px 8px;
    border-radius: 9999px;
    font-size: 12px;
    font-weight: 600;
    text-transform: uppercase;
  }
  .badge-success {
    background-color: #d1fae5;
    color: #065f46;
  }
  .badge-warning {
    background-color: #fef3c7;
    color: #92400e;
  }
  .badge-info {
    background-color: #dbeafe;
    color: #1e40af;
  }
  .total-row {
    background-color: #f9fafb;
    font-weight: bold;
  }
  .total-row td {
    border-top: 2px solid #e5e7eb;
    color: #111827;
    font-size: 16px;
  }
  .footer {
    background-color: #f9fafb;
    padding: 24px 30px;
    text-align: center;
    border-top: 1px solid #e5e7eb;
    color: #6b7280;
    font-size: 13px;
  }
  .footer a {
    color: #4f46e5;
    text-decoration: none;
    font-weight: 600;
  }
  .text-sm {
    font-size: 12px;
  }
  .alert-box {
    background-color: #fffbeb;
    border: 1px solid #fef3c7;
    color: #92400e;
    padding: 16px;
    border-radius: 8px;
    margin-bottom: 20px;
    font-size: 14px;
  }
`;

/**
 * Helper to format currency
 */
const formatCurrency = (val) => `₹${Number(val).toFixed(2)}`;

/**
 * Helper to build estimated delivery string
 */
const getDeliveryString = (estimatedDelivery, orderCreatedAt) => {
  let dateObj = estimatedDelivery ? new Date(estimatedDelivery) : null;
  if (!dateObj) {
    // default to 4 days from order placement
    dateObj = new Date(orderCreatedAt || Date.now());
    dateObj.setDate(dateObj.getDate() + 4);
  }
  return dateObj.toLocaleDateString('en-IN', {
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });
};

/**
 * Sends order notifications to Customer & Seller(s) via Email
 * @param {Object} order - The Order Mongoose document
 * @returns {Promise<void>}
 */
exports.sendOrderConfirmationEmails = async (order) => {
  try {
    // 1. Fetch/Populate Customer
    let customer = order.customerId;
    if (customer && typeof customer.toObject !== 'function') {
      customer = await User.findById(order.customerId);
    }
    const customerEmail = order.shippingAddress?.email || (customer ? customer.email : null);
    const customerPhone = order.shippingAddress?.phone || (customer ? customer.phone : 'N/A');
    const customerName = customer
      ? `${customer.firstName} ${customer.lastName}`
      : `${order.shippingAddress?.firstName} ${order.shippingAddress?.lastName}`;

    if (!customerEmail) {
      console.warn(`[EMAIL SERVICE] Cannot send email. Missing customer email for order ${order.orderNumber}`);
      return;
    }

    // 2. Fetch Admin settings
    const adminUser = await User.findOne({ role: 'admin' });
    const adminPhone = adminUser ? adminUser.phone : 'N/A';

    // 3. Fetch Sellers and Store names
    const sellerIds = [...new Set(order.items.map(item => item.sellerId?.toString()).filter(Boolean))];
    const sellers = await User.find({ _id: { $in: sellerIds } });
    const stores = await Store.find({ sellerId: { $in: sellerIds } });

    // Maps for easy lookup
    const sellerMap = {};
    sellers.forEach(s => {
      sellerMap[s._id.toString()] = s;
    });

    const storeMap = {};
    stores.forEach(st => {
      storeMap[st.sellerId.toString()] = st;
    });

    const deliveryStr = getDeliveryString(order.estimatedDelivery, order.createdAt);

    // =========================================================================
    // CUSTOMER EMAIL TEMPLATE GENERATION
    // =========================================================================
    const customerItemsHtml = order.items.map(item => {
      const price = item.salePrice || item.price;
      const variantStr = item.variant && (item.variant.size || item.variant.color)
        ? `(${[item.variant.color, item.variant.size].filter(Boolean).join(', ')})`
        : '';
      return `
        <tr>
          <td class="product-name">
            ${item.productName}
            ${variantStr ? `<div style="font-size:12px; color:#6b7280; font-weight:normal; margin-top:2px;">Variant: ${variantStr}</div>` : ''}
          </td>
          <td class="align-right">${item.quantity}</td>
          <td class="align-right">${formatCurrency(price)}</td>
          <td class="align-right" style="font-weight: 600; color: #111827;">${formatCurrency(item.subtotal)}</td>
        </tr>
      `;
    }).join('');

    const sellerContactsHtml = sellers.map(s => {
      const store = storeMap[s._id.toString()];
      const storeName = store ? store.name : 'Store';
      return `<div style="margin-bottom: 6px;"><strong>${storeName}</strong>: ${s.firstName} ${s.lastName} (Phone: ${s.phone || 'N/A'})</div>`;
    }).join('') || 'N/A';

    const customerHtmlContent = `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="utf-8">
        <title>Order Confirmation - Prarambha</title>
        <style>
          ${getSharedStyles()}
        </style>
      </head>
      <body>
        <div class="container">
          <div class="header header-customer">
            <h1>Order Confirmed!</h1>
            <p>Thank you for shopping at Prarambha</p>
          </div>
          <div class="content">
            <p style="font-size: 16px; color: #374151; margin-top: 0;">Hi <strong>${customerName}</strong>,</p>
            <p style="color: #4b5563; line-height: 1.5; margin-bottom: 24px;">
              Your order has been successfully processed. Below is a detailed breakdown of your order details.
            </p>

            ${order.paymentMethod === 'offline' && order.verificationCode ? `
              <div class="alert-box">
                <strong>🔑 Delivery Verification Code:</strong> <span style="font-size: 18px; font-weight: bold; letter-spacing: 1px; color: #b45309;">${order.verificationCode}</span>
                <br/><br/>
                Please keep this code secure and share it with the delivery agent only when you receive your order items.
              </div>
            ` : ''}

            <div class="section-title">Order Info</div>
            <div class="card">
              <div class="card-grid">
                <div class="card-row">
                  <div class="card-label">Order Number:</div>
                  <div class="card-value" style="font-family: monospace; font-weight: bold; font-size: 15px;">${order.orderNumber}</div>
                </div>
                <div class="card-row">
                  <div class="card-label">Estimated Delivery:</div>
                  <div class="card-value" style="color: #4f46e5; font-weight: 600;">${deliveryStr}</div>
                </div>
                <div class="card-row">
                  <div class="card-label">Payment Method:</div>
                  <div class="card-value">
                    <span class="badge ${order.paymentMethod === 'offline' ? 'badge-warning' : 'badge-success'}">
                      ${order.paymentMethod === 'offline' ? 'Cash/Hand Payment (COD)' : 'Online Payment'}
                    </span>
                  </div>
                </div>
              </div>
            </div>

            <div class="section-title">Items Ordered</div>
            <table class="table">
              <thead>
                <tr>
                  <th>Product</th>
                  <th class="align-right">Qty</th>
                  <th class="align-right">Price</th>
                  <th class="align-right">Total</th>
                </tr>
              </thead>
              <tbody>
                ${customerItemsHtml}
                <tr class="total-row">
                  <td colspan="3" class="align-right" style="padding: 16px;">Grand Total:</td>
                  <td class="align-right" style="padding: 16px; color: #4f46e5; font-size: 18px;">${formatCurrency(order.totalAmount)}</td>
                </tr>
              </tbody>
            </table>

            <div class="section-title">Delivery Address</div>
            <div class="card">
              <p style="margin: 0 0 8px 0; font-weight: 600; color: #111827;">${customerName}</p>
              <p style="margin: 0 0 4px 0; color: #4b5563; font-size: 14px;">${order.shippingAddress?.street || ''}</p>
              <p style="margin: 0 0 4px 0; color: #4b5563; font-size: 14px;">${order.shippingAddress?.city || ''}, ${order.shippingAddress?.state || ''} - ${order.shippingAddress?.postalCode || ''}</p>
              <p style="margin: 0 0 4px 0; color: #4b5563; font-size: 14px;">${order.shippingAddress?.country || ''}</p>
              <p style="margin: 12px 0 0 0; color: #4b5563; font-size: 14px;"><strong>Phone:</strong> ${customerPhone}</p>
            </div>

            <div class="section-title">Contact Support & Sellers</div>
            <div class="card" style="background-color: #f0fdf4; border-color: #dcfce7; color: #166534; font-size: 14px; line-height: 1.5;">
              <div style="margin-bottom: 12px;"><strong>Admin Support Phone:</strong> ${adminPhone}</div>
              <div><strong>Seller(s) Information:</strong></div>
              <div style="margin-left: 10px; margin-top: 6px;">
                ${sellerContactsHtml}
              </div>
            </div>

          </div>
          <div class="footer">
            <p>Need help? Visit our <a href="#">Support Center</a> or reply to this email.</p>
            <p class="text-sm" style="margin-top: 16px;">&copy; ${new Date().getFullYear()} Prarambha. All rights reserved.</p>
          </div>
        </div>
      </body>
      </html>
    `;

    // Send the Customer email
    const customerMailOptions = {
      from: `"Prarambha Notification" <${emailUser}>`,
      to: customerEmail,
      subject: `Order Confirmed: #${order.orderNumber} - Prarambha`,
      html: customerHtmlContent,
    };

    let customerSent = false;
    if (transporter) {
      try {
        await transporter.sendMail(customerMailOptions);
        console.log(`[EMAIL SERVICE] Order checkout email sent to customer: ${customerEmail}`);
        customerSent = true;
      } catch (err) {
        console.error(`[EMAIL SERVICE] Error sending email to customer ${customerEmail}:`, err.message);
      }
    }

    if (!customerSent) {
      // Simulation fallback for Customer
      console.log(`
================================================================================
[SIMULATED EMAIL MESSAGE DELIVERY - CUSTOMER]
From: ${customerMailOptions.from}
To: ${customerMailOptions.to}
Subject: ${customerMailOptions.subject}
--------------------------------------------------------------------------------
Hi ${customerName},

Your order has been successfully processed!

Order Number: ${order.orderNumber}
Delivery Estimate: ${deliveryStr}
Payment Method: ${order.paymentMethod === 'offline' ? 'Cash/Hand Payment (COD)' : 'Online Payment'}
Grand Total: ${formatCurrency(order.totalAmount)}
${order.paymentMethod === 'offline' && order.verificationCode ? `Verification Code: ${order.verificationCode}\n` : ''}
Estimated Delivery Date: ${deliveryStr}
Shipping Address:
  ${order.shippingAddress?.street || ''}
  ${order.shippingAddress?.city || ''}, ${order.shippingAddress?.state || ''} - ${order.shippingAddress?.postalCode || ''}
  ${order.shippingAddress?.country || ''}
  Phone: ${customerPhone}

Contact Admin: ${adminPhone}
Sellers:
${sellers.map(s => `  - ${storeMap[s._id.toString()]?.name || 'Store'}: ${s.firstName} ${s.lastName} (Phone: ${s.phone || 'N/A'})`).join('\n')}

--------------------------------------------------------------------------------
[HTML EMAIL TEMPLATE CONTENT]
--------------------------------------------------------------------------------
${customerHtmlContent}
================================================================================
      `);
    }

    // =========================================================================
    // SELLER EMAIL TEMPLATE GENERATION (Individual for each seller)
    // =========================================================================
    // Group order items by seller
    const itemsBySeller = {};
    order.items.forEach(item => {
      if (item.sellerId) {
        const sId = item.sellerId.toString();
        if (!itemsBySeller[sId]) {
          itemsBySeller[sId] = [];
        }
        itemsBySeller[sId].push(item);
      }
    });

    for (const [sId, sItems] of Object.entries(itemsBySeller)) {
      const sellerObj = sellerMap[sId];
      if (!sellerObj) continue;

      const storeObj = storeMap[sId];
      const storeName = storeObj ? storeObj.name : 'Your Storefront';
      const sellerEmail = sellerObj.email;

      if (!sellerEmail) {
        console.warn(`[EMAIL SERVICE] Missing email address for seller ${sellerObj.firstName} ${sellerObj.lastName}. Cannot send notification.`);
        continue;
      }

      const sellerSubtotal = sItems.reduce((acc, current) => acc + current.subtotal, 0);

      const sellerItemsHtml = sItems.map(item => {
        const price = item.salePrice || item.price;
        const variantStr = item.variant && (item.variant.size || item.variant.color)
          ? `(${[item.variant.color, item.variant.size].filter(Boolean).join(', ')})`
          : '';
        return `
          <tr>
            <td class="product-name">
              ${item.productName}
              ${variantStr ? `<div style="font-size:12px; color:#6b7280; font-weight:normal; margin-top:2px;">Variant: ${variantStr}</div>` : ''}
            </td>
            <td class="align-right">${item.quantity}</td>
            <td class="align-right">${formatCurrency(price)}</td>
            <td class="align-right" style="font-weight: 600; color: #111827;">${formatCurrency(item.subtotal)}</td>
          </tr>
        `;
      }).join('');

      let codAlertHtml = '';
      if (order.paymentMethod === 'offline') {
        codAlertHtml = `
          <div class="alert-box">
            <strong>⚠️ ACTION REQUIRED (COD ORDER):</strong> This is a Cash on Delivery (Offline) order. 
            Please collect the payment in-hand of <strong>${formatCurrency(sellerSubtotal)}</strong> from the customer.
            <br/><br/>
            <strong>Delivery Verification Code:</strong> Ask the customer for the verification code. 
            (First 3 digits: <strong>${order.verificationCode ? order.verificationCode.slice(0, 3) + '***' : '***'}</strong>) 
            Enter this code in your seller panel to confirm delivery and authorize payout.
          </div>
        `;
      }

      const sellerHtmlContent = `
        <!DOCTYPE html>
        <html>
        <head>
          <meta charset="utf-8">
          <title>New Order To Fulfill - ${storeName}</title>
          <style>
            ${getSharedStyles()}
          </style>
        </head>
        <body>
          <div class="container">
            <div class="header header-seller">
              <h1>New Store Order!</h1>
              <p>Fulfill items for your storefront: <strong>${storeName}</strong></p>
            </div>
            <div class="content">
              <p style="font-size: 16px; color: #374151; margin-top: 0;">Hi <strong>${sellerObj.firstName}</strong>,</p>
              <p style="color: #4b5563; line-height: 1.5; margin-bottom: 24px;">
                You have received a new order for your storefront <strong>${storeName}</strong>. Please find the details below and prepare the items for dispatch.
              </p>

              ${codAlertHtml}

              <div class="section-title">Order Info</div>
              <div class="card">
                <div class="card-grid">
                  <div class="card-row">
                    <div class="card-label">Order Number:</div>
                    <div class="card-value" style="font-family: monospace; font-weight: bold; font-size: 15px;">${order.orderNumber}</div>
                  </div>
                  <div class="card-row">
                    <div class="card-label">Order Date:</div>
                    <div class="card-value">${new Date(order.createdAt || Date.now()).toLocaleDateString('en-IN', { year: 'numeric', month: 'long', day: 'numeric' })}</div>
                  </div>
                  <div class="card-row">
                    <div class="card-label">Payment Method:</div>
                    <div class="card-value">
                      <span class="badge ${order.paymentMethod === 'offline' ? 'badge-warning' : 'badge-success'}">
                        ${order.paymentMethod === 'offline' ? 'Cash/Hand Payment (COD)' : 'Online Payment'}
                      </span>
                    </div>
                  </div>
                </div>
              </div>

              <div class="section-title">Customer Details (Deliver To)</div>
              <div class="card">
                <div class="card-grid">
                  <div class="card-row">
                    <div class="card-label">Name:</div>
                    <div class="card-value" style="font-weight: 600;">${customerName}</div>
                  </div>
                  <div class="card-row">
                    <div class="card-label">Email:</div>
                    <div class="card-value"><a href="mailto:${customerEmail}" style="color: #0d9488; text-decoration: none;">${customerEmail}</a></div>
                  </div>
                  <div class="card-row">
                    <div class="card-label">Phone:</div>
                    <div class="card-value" style="font-weight: 600; color: #111827;">${customerPhone}</div>
                  </div>
                  <div class="card-row">
                    <div class="card-label">Address:</div>
                    <div class="card-value">
                      ${order.shippingAddress?.street || ''}<br/>
                      ${order.shippingAddress?.city || ''}, ${order.shippingAddress?.state || ''} - ${order.shippingAddress?.postalCode || ''}<br/>
                      ${order.shippingAddress?.country || ''}
                    </div>
                  </div>
                </div>
              </div>

              <div class="section-title">Items to Pack</div>
              <table class="table">
                <thead>
                  <tr>
                    <th>Product</th>
                    <th class="align-right">Qty</th>
                    <th class="align-right">Price</th>
                    <th class="align-right">Subtotal</th>
                  </tr>
                </thead>
                <tbody>
                  ${sellerItemsHtml}
                  <tr class="total-row">
                    <td colspan="3" class="align-right" style="padding: 16px;">Storefront Total:</td>
                    <td class="align-right" style="padding: 16px; color: #0d9488; font-size: 18px;">${formatCurrency(sellerSubtotal)}</td>
                  </tr>
                </tbody>
              </table>

            </div>
            <div class="footer">
              <p>Please log in to your <a href="#" style="color: #0d9488;">Seller Dashboard</a> to update the shipping status.</p>
              <p class="text-sm" style="margin-top: 16px;">&copy; ${new Date().getFullYear()} Prarambha Partner. All rights reserved.</p>
            </div>
          </div>
        </body>
        </html>
      `;

      const sellerMailOptions = {
        from: `"Prarambha Storefront Alert" <${emailUser}>`,
        to: sellerEmail,
        subject: `New Order To Fulfill: #${order.orderNumber} - ${storeName}`,
        html: sellerHtmlContent,
      };

      let sellerSent = false;
      if (transporter) {
        try {
          await transporter.sendMail(sellerMailOptions);
          console.log(`[EMAIL SERVICE] Order fulfillment notification email sent to seller: ${sellerEmail}`);
          sellerSent = true;
        } catch (err) {
          console.error(`[EMAIL SERVICE] Error sending email to seller ${sellerEmail}:`, err.message);
        }
      }

      if (!sellerSent) {
        // Simulation fallback for Seller
        console.log(`
================================================================================
[SIMULATED EMAIL MESSAGE DELIVERY - SELLER]
From: ${sellerMailOptions.from}
To: ${sellerMailOptions.to}
Subject: ${sellerMailOptions.subject}
--------------------------------------------------------------------------------
Hi ${sellerObj.firstName},

You have received a new order for storefront: ${storeName}

Order Number: ${order.orderNumber}
Payment Method: ${order.paymentMethod === 'offline' ? 'Cash/Hand Payment (COD)' : 'Online Payment'}
Storefront Subtotal: ${formatCurrency(sellerSubtotal)}

Customer (Deliver To):
  Name: ${customerName}
  Email: ${customerEmail}
  Phone: ${customerPhone}
  Address:
    ${order.shippingAddress?.street || ''}
    ${order.shippingAddress?.city || ''}, ${order.shippingAddress?.state || ''} - ${order.shippingAddress?.postalCode || ''}
    ${order.shippingAddress?.country || ''}

Items to Pack:
${sItems.map(item => `  - ${item.productName} x ${item.quantity} (${formatCurrency(item.salePrice || item.price)} each) - Subtotal: ${formatCurrency(item.subtotal)}`).join('\n')}

${order.paymentMethod === 'offline' ? `*COD ORDER* Please collect ${formatCurrency(sellerSubtotal)} and verify using code prefix: ${order.verificationCode ? order.verificationCode.slice(0, 3) + '***' : '***'}` : ''}

--------------------------------------------------------------------------------
[HTML EMAIL TEMPLATE CONTENT]
--------------------------------------------------------------------------------
${sellerHtmlContent}
================================================================================
        `);
      }
    }
  } catch (error) {
    console.error('[EMAIL SERVICE] Critical error during order confirmation email processes:', error);
  }
};
