/**
 * PDF Generator Module - Clean Single Page Stable Layout
 */

function formatDateToDMY(dateString) {
  if (!dateString) return '-';
  try {
    const d = new Date(dateString);
    if (isNaN(d.getTime())) return dateString;
    const day = String(d.getDate()).padStart(2, '0');
    const month = String(d.getMonth() + 1).padStart(2, '0');
    const year = d.getFullYear();
    return `${day}-${month}-${year}`;
  } catch (e) {
    return dateString;
  }
}

function formatCreatorName(name, role) {
  if (!name) return 'System';
  if (!role) return name;
  return `${name} (${role})`;
}

async function generateQRCodeDataUrl(text) {
  return `https://api.qrserver.com/v1/create-qr-code/?size=40x40&data=${encodeURIComponent(text)}`;
}

async function renderA4VoucherHTML(data, agencySettings) {
  const voucher_ref = data.voucherRef || data.id || '';
  const baseUrl = (typeof process !== 'undefined' && process.env && process.env.PUBLIC_APP_URL)
    || 'https://saudipak-vouchers.vercel.app';
  const verifyUrl = `${baseUrl}/verify?voucher=${voucher_ref}`;
  const qrDataUrl = await generateQRCodeDataUrl(verifyUrl);

  let logoHtml = '';
  if (agencySettings.logo && agencySettings.logo.startsWith('data:image')) {
    logoHtml = `<img src="${agencySettings.logo}" style="max-height: 26px; max-width: 80px; object-fit: contain;" alt="Logo">`;
  } else {
    logoHtml = `<span style="font-weight: 900; font-size: 10px; color: #064e3b; text-transform: uppercase;">${agencySettings.agencyName || 'SAUDI PAK GROUP OF TRAVELS'}</span>`;
  }

  const passBasicRowsHtml = (data.passengers || []).map((p, idx) => `
    <tr style="background-color: ${idx % 2 === 1 ? '#f8fafc' : '#ffffff'}; border-bottom: 1px solid #e2e8f0;">
      <td style="text-align: center; font-weight: bold; padding: 2px 4px; font-size: 8px;">${idx + 1}</td>
      <td style="font-weight: bold; padding: 2px 4px; font-size: 8px;">${p.passportNo || '-'}</td>
      <td style="font-weight: 800; padding: 2px 4px; font-size: 8.5px; color: #064e3b;">${p.name || '-'}</td>
      <td style="text-align: center; font-weight: 600; padding: 2px 4px; font-size: 8px;">${p.gender || '-'}</td>
      <td style="text-align: center; padding: 2px 4px;"><span style="padding: 1px 4px; background: #e0f2fe; color: #0369a1; border-radius: 4px; font-size: 7.5px; font-weight: bold;">${p.type || '-'}</span></td>
      <td style="text-align: center; font-weight: 600; padding: 2px 4px; font-size: 8px;">${p.bed || '-'}</td>
    </tr>
  `).join('');

  const passVisaRowsHtml = (data.passengers || []).map((p, idx) => `
    <tr style="background-color: ${idx % 2 === 1 ? '#f8fafc' : '#ffffff'}; border-bottom: 1px solid #e2e8f0;">
      <td style="text-align: center; font-weight: bold; padding: 2px 4px; font-size: 8px;">${idx + 1}</td>
      <td style="font-weight: 800; padding: 2px 4px; font-size: 8.5px;">${p.name || '-'}</td>
      <td style="font-weight: bold; padding: 2px 4px; font-size: 8px;">${p.mofaNo || '-'}</td>
      <td style="font-weight: bold; padding: 2px 4px; font-size: 8px;">${p.groupNo || '-'}</td>
      <td style="font-weight: bold; padding: 2px 4px; font-size: 8px;">${p.visaNo || '-'}</td>
      <td style="font-weight: 800; padding: 2px 4px; font-size: 8.5px; color: #064e3b; font-family: monospace;">${p.pnr || '-'}</td>
    </tr>
  `).join('');

  const hotelRowsHtml = (data.hotels || []).map((h, idx) => `
    <tr style="background-color: ${idx % 2 === 1 ? '#f8fafc' : '#ffffff'}; border-bottom: 1px solid #e2e8f0; font-size: 8px;">
      <td style="font-weight: 800; padding: 2px 4px; color: #064e3b;">${h.city || '-'}</td>
      <td style="font-weight: 800; padding: 2px 4px;">${h.hotelName || '-'}</td>
      <td style="font-weight: bold; padding: 2px 4px; color: #334155;">${h.roomType || '-'}</td>
      <td style="font-weight: bold; padding: 2px 4px; color: #334155;">${h.mealPlan || '-'}</td>
      <td style="font-weight: bold; padding: 2px 4px;">${formatDateToDMY(h.checkIn)}</td>
      <td style="font-weight: bold; padding: 2px 4px;">${formatDateToDMY(h.checkOut)}</td>
      <td style="text-align: center; font-weight: 900; padding: 2px 4px; color: #064e3b; background: #ecfdf5;">${h.totalNights || 0} Nts</td>
    </tr>
  `).join('');

  const termsUrduLines = (data.termsUrdu || '').split('\n').filter(l => l.trim()).map(l => `<li style="margin-bottom: 2px;">${l}</li>`).join('');
  const termsEngLines = (data.termsEnglish || '').split('\n').filter(l => l.trim()).map(l => `<li style="margin-bottom: 2px;">${l}</li>`).join('');

  const status = data.status || 'NOT APPROVED';
  const statusColor = status === 'APPROVED' ? '#00875A' : '#EF4444';

  return `
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="utf-8">
      <style>
        body { font-family: 'Helvetica Neue', Helvetica, Arial, sans-serif; color: #1e293b; margin: 0; padding: 0; background: #ffffff; font-size: 8.5px; line-height: 1.15; }
        .voucher-box { width: 100%; max-width: 190mm; margin: 0 auto; padding: 5mm; background: #ffffff; box-sizing: border-box; }
        table { width: 100%; border-collapse: collapse; margin-bottom: 6px; }
        th, td { border: 1px solid #cbd5e1; text-align: left; }
        th { background-color: #f1f5f9; color: #0f172a; font-weight: 900; font-size: 7px; text-transform: uppercase; padding: 3px 4px; }
      </style>
    </head>
    <body>
      <div class="voucher-box">
        
        <!-- WATERMARK -->
        <div style="position: fixed; top: 40%; left: 25%; transform: rotate(-30deg); font-size: 50pt; font-weight: 900; color: ${statusColor}; opacity: 0.08; z-index: 0; text-transform: uppercase; border: 4px double currentColor; padding: 10px 20px; text-align: center;">
          ${status}
        </div>

        <!-- HEADER -->
        <table style="border: none; margin-bottom: 6px;">
          <tr>
            <td style="border: none; width: 55%; vertical-align: middle;">
              <div style="margin-bottom: 2px;">${logoHtml}</div>
              <div style="font-size: 7px; color: #475569; font-weight: bold;">${agencySettings.tagline || 'Hajj & Umrah Pilgrimage Services'}</div>
              <div style="font-size: 6.5px; color: #064e3b; font-weight: 800;">${agencySettings.licenseNo ? 'Lic: ' + agencySettings.licenseNo : ''}</div>
            </td>
            <td style="border: none; width: 45%; text-align: right; vertical-align: middle; font-size: 7.5px; color: #334155; font-weight: bold;">
              <div>📞 ${agencySettings.phone1 || ''}</div>
              <div>✉️ ${agencySettings.email || ''}</div>
              <div>🌐 ${agencySettings.website || ''}</div>
              <div style="font-size: 6.5px; color: #64748b;">📍 ${agencySettings.address || ''}</div>
            </td>
          </tr>
        </table>

        <!-- TITLE BAR -->
        <div style="background: #064e3b; color: #ffffff; padding: 4px 8px; border-radius: 3px; margin-bottom: 6px; font-weight: 900; font-size: 8.5px; text-transform: uppercase;">
          🕋 Official Travel & Umrah Voucher &nbsp;&nbsp;|&nbsp;&nbsp; Ref: <span style="color: #fde047; font-family: monospace;">${data.id}</span> &nbsp;&nbsp;|&nbsp;&nbsp; Date: ${formatDateToDMY(data.voucherDate)}
        </div>

        <!-- SUMMARY GRID -->
        <table style="background: #f0fdf4; border: 1px solid #bbf7d0; border-radius: 3px; margin-bottom: 6px;">
          <tr>
            <td style="border: none; padding: 4px; width: 25%;">
              <span style="font-size: 6px; color: #475569; font-weight: 900; text-transform: uppercase; display: block;">Family Head</span>
              <strong style="font-size: 8.5px; color: #0f172a;">${data.familyHead}</strong>
            </td>
            <td style="border: none; padding: 4px; width: 25%;">
              <span style="font-size: 6px; color: #475569; font-weight: 900; text-transform: uppercase; display: block;">Package Name</span>
              <strong style="font-size: 8.5px; color: #064e3b;">${data.packageName}</strong>
            </td>
            <td style="border: none; padding: 4px; width: 25%;">
              <span style="font-size: 6px; color: #475569; font-weight: 900; text-transform: uppercase; display: block;">PAX Breakdown</span>
              <strong style="font-size: 8px; color: #0f172a;">${data.adultsCount || 0} Ad, ${data.childrenCount || 0} Ch, ${data.infantsCount || 0} Inf</strong>
            </td>
            <td style="border: none; padding: 4px; width: 25%;">
              <span style="font-size: 6px; color: #475569; font-weight: 900; text-transform: uppercase; display: block;">Total PAX</span>
              <span style="background: #047857; color: #fff; padding: 1px 5px; border-radius: 3px; font-weight: 900; font-size: 8px;">${data.totalPax} Person(s)</span>
            </td>
          </tr>
        </table>

        <!-- 1. PASSENGERS -->
        <div style="background: #1e293b; color: #fff; padding: 3px 6px; font-weight: 900; font-size: 8px; border-top-left-radius: 3px; border-top-right-radius: 3px;">
          👥 PASSENGER BASIC DETAILS (Total: ${data.passengers ? data.passengers.length : 0})
        </div>
        <table>
          <thead>
            <tr>
              <th style="width: 5%; text-align: center;">#</th>
              <th style="width: 22%;">Passport #</th>
              <th style="width: 38%;">Passenger Name</th>
              <th style="width: 12%; text-align: center;">Gender</th>
              <th style="width: 11%; text-align: center;">Type</th>
              <th style="width: 12%; text-align: center;">Bed</th>
            </tr>
          </thead>
          <tbody>
            ${passBasicRowsHtml || '<tr><td colspan="6" style="text-align:center; padding:4px;">No passengers listed</td></tr>'}
          </tbody>
        </table>

        ${data.showMofaDetails ? `
        <!-- 2. VISA & MOFA -->
        <div style="background: #022c22; color: #fff; padding: 3px 6px; font-weight: 900; font-size: 8px; border-top-left-radius: 3px; border-top-right-radius: 3px; margin-top: 4px;">
          🛂 VISA, MOFA & BOOKING DETAILS
        </div>
        <table>
          <thead>
            <tr>
              <th style="width: 5%; text-align: center;">#</th>
              <th style="width: 33%;">Passenger Name</th>
              <th style="width: 17%;">MOFA #</th>
              <th style="width: 15%;">Group #</th>
              <th style="width: 17%;">Visa #</th>
              <th style="width: 13%;">PNR</th>
            </tr>
          </thead>
          <tbody>
            ${passVisaRowsHtml || '<tr><td colspan="6" style="text-align:center; padding:4px;">No visa details listed</td></tr>'}
          </tbody>
        </table>` : ''}

        <!-- 3. HOTELS -->
        <div style="background: #064e3b; color: #fff; padding: 3px 6px; font-weight: 900; font-size: 8px; border-top-left-radius: 3px; border-top-right-radius: 3px; margin-top: 4px;">
          🏨 ACCOMMODATION & HOTEL SCHEDULE
        </div>
        <table>
          <thead>
            <tr>
              <th style="width: 13%;">City</th>
              <th style="width: 29%;">Hotel Name</th>
              <th style="width: 14%;">Room</th>
              <th style="width: 14%;">Meal</th>
              <th style="width: 11%;">Check-In</th>
              <th style="width: 11%;">Check-Out</th>
              <th style="width: 8%; text-align: center;">Nts</th>
            </tr>
          </thead>
          <tbody>
            ${hotelRowsHtml || '<tr><td colspan="7" style="text-align:center; padding:4px;">No hotels listed</td></tr>'}
          </tbody>
        </table>

        <!-- 4. FLIGHTS -->
        <div style="background: #1e293b; color: #fff; padding: 3px 6px; font-weight: 900; font-size: 8px; border-top-left-radius: 3px; border-top-right-radius: 3px; margin-top: 4px;">
          ✈️ FLIGHT SCHEDULE
        </div>
        <table>
          <thead>
            <tr>
              <th style="width: 15%;">Sector</th>
              <th style="width: 23%;">Airline</th>
              <th style="width: 15%;">Flight No</th>
              <th style="width: 18%;">Date</th>
              <th style="width: 14%;">Time</th>
              <th style="width: 15%;">Route</th>
            </tr>
          </thead>
          <tbody>
            <tr style="background: #fff; border-bottom: 1px solid #e2e8f0; font-size: 8px;">
              <td style="font-weight: 900; color: #064e3b; padding: 2px 4px;">Departure</td>
              <td style="font-weight: 800; padding: 2px 4px;">${data.flight ? data.flight.departureAirline || '-' : '-'}</td>
              <td style="font-weight: 900; font-family: monospace; padding: 2px 4px;">${data.flight ? data.flight.departureFlightNo || '-' : '-'}</td>
              <td style="font-weight: bold; padding: 2px 4px;">${formatDateToDMY(data.flight ? data.flight.departureDate : '')}</td>
              <td style="font-weight: bold; padding: 2px 4px;">${data.flight ? data.flight.departureTime || '-' : '-'}</td>
              <td style="font-weight: 900; color: #064e3b; padding: 2px 4px;">${data.flight ? data.flight.departureRoute || '-' : '-'}</td>
            </tr>
            <tr style="background: #f8fafc; font-size: 8px;">
              <td style="font-weight: 900; color: #064e3b; padding: 2px 4px;">Return</td>
              <td style="font-weight: 800; padding: 2px 4px;">${data.flight ? data.flight.returnAirline || '-' : '-'}</td>
              <td style="font-weight: 900; font-family: monospace; padding: 2px 4px;">${data.flight ? data.flight.returnFlightNo || '-' : '-'}</td>
              <td style="font-weight: bold; padding: 2px 4px;">${formatDateToDMY(data.flight ? data.flight.returnDate : '')}</td>
              <td style="font-weight: bold; padding: 2px 4px;">${data.flight ? data.flight.returnTime || '-' : '-'}</td>
              <td style="font-weight: 900; color: #064e3b; padding: 2px 4px;">${data.flight ? data.flight.returnRoute || '-' : '-'}</td>
            </tr>
          </tbody>
        </table>

        <!-- 5. HELPLINES & QR -->
        <table style="background: #f0fdf4; border: 2px solid #a7f3d0; margin-top: 4px; border-radius: 3px;">
          <tr>
            <td style="border: none; padding: 4px; vertical-align: middle;">
              <div style="font-weight: 900; color: #064e3b; font-size: 8px; margin-bottom: 2px;">📞 24/7 KSA EMERGENCY HELPLINES:</div>
              <div style="font-size: 7.5px; font-weight: bold; color: #1e293b;">
                Makkah: <span style="font-family: monospace; color: #064e3b;">${data.helplines ? data.helplines.makkah || '-' : '-'}</span> &nbsp;|&nbsp; 
                Medina: <span style="font-family: monospace; color: #064e3b;">${data.helplines ? data.helplines.medina || '-' : '-'}</span> &nbsp;|&nbsp; 
                Transport: <span style="font-family: monospace; color: #064e3b;">${data.helplines ? data.helplines.transport || '-' : '-'}</span>
              </div>
            </td>
            <td style="border: none; padding: 4px; text-align: right; width: 80px; vertical-align: middle;">
              ${qrDataUrl ? `<img src="${qrDataUrl}" style="width: 35px; height: 35px; vertical-align: middle;" alt="QR">` : ''}
            </td>
          </tr>
        </table>

        <!-- TERMS & CONDITIONS -->
        <table style="border-top: 2px solid #064e3b; margin-top: 6px; border: none;">
          <tr>
            <td style="border: 1px solid #cbd5e1; background: #f8fafc; padding: 4px; width: 50%; vertical-align: top; font-size: 7.5px;" dir="rtl">
              <strong style="color: #064e3b; display: block; margin-bottom: 2px; font-size: 8px;">ضروری ہدایات و شرائط:</strong>
              <ul style="padding-right: 12px; margin: 0; font-weight: bold;">
                ${termsUrduLines || '<li>ہوٹل کیلیے چیک ان 04:00 PM اور چیک آؤٹ 12:00 PM ہے۔</li>'}
              </ul>
            </td>
            <td style="border: 1px solid #cbd5e1; background: #f8fafc; padding: 4px; width: 50%; vertical-align: top; font-size: 7.5px;">
              <strong style="color: #064e3b; display: block; margin-bottom: 2px; font-size: 8px;">Terms & Conditions:</strong>
              <ul style="padding-left: 12px; margin: 0; font-weight: bold;">
                ${termsEngLines || '<li>Hotel check-in is 04:00 PM and check-out is 12:00 PM.</li>'}
              </ul>
            </td>
          </tr>
        </table>

        <!-- FOOTER -->
        <div style="border-top: 1px solid #e2e8f0; margin-top: 4px; padding-top: 2px; font-size: 6.5px; color: #64748b; font-weight: bold;">
          <span>Prepared By: <strong>${formatCreatorName(data.createdBy, data.createdByRole)}</strong></span>
          <span style="float: right;">Generated via Travel System &nbsp;|&nbsp; Page 1 of 1</span>
        </div>

      </div>
    </body>
    </html>
  `;
}
