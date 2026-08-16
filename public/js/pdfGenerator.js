/**
 * PDF Generator & A4 Printable Voucher Rendering Engine
 */

// Generate QR Code Data URL asynchronously
async function generateQRCodeDataUrl(text) {
  try {
    const response = await fetch('/api/generate-qr', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text })
    });
    const result = await response.json();
    if (result.success) {
      return result.qrDataUrl;
    }
  } catch (e) {
    console.warn("Server QR code API failed, using fallback script: ", e);
  }

  // Fallback client side QR generation
  return new Promise((resolve) => {
    const tempDiv = document.createElement('div');
    tempDiv.style.display = 'none';
    document.body.appendChild(tempDiv);
    
    new QRCode(tempDiv, {
      text: text,
      width: 150,
      height: 150,
      colorDark: "#047857",
      colorLight: "#ffffff",
      correctLevel: QRCode.CorrectLevel.M
    });

    setTimeout(() => {
      const img = tempDiv.querySelector('img');
      const canvas = tempDiv.querySelector('canvas');
      let dataUrl = '';
      if (img && img.src) dataUrl = img.src;
      else if (canvas) dataUrl = canvas.toDataURL('image/png');
      document.body.removeChild(tempDiv);
      resolve(dataUrl);
    }, 150);
  });
}

// Helper function to format DateTime nicely for PDF output (e.g. 16-Aug-2026, 04:30 AM)
function formatDateTimeForPDF(str) {
  if (!str) return '-';
  const cleanStr = str.replace('T', ' ');
  const parts = cleanStr.split(' ');
  if (parts.length >= 2 && parts[0].includes('-')) {
    const [year, month, day] = parts[0].split('-');
    const [hrs, mins] = parts[1].split(':');
    if (year && month && day && hrs !== undefined && mins !== undefined) {
      const monthNames = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
      const mIdx = parseInt(month, 10) - 1;
      const mStr = monthNames[mIdx] || month;
      let h = parseInt(hrs, 10);
      const ampm = h >= 12 ? 'PM' : 'AM';
      h = h % 12;
      if (h === 0) h = 12;
      return `${day}-${mStr}-${year}, ${h.toString().padStart(2, '0')}:${mins} ${ampm}`;
    }
  }
  return str;
}

// Helper function to format Date in DD/MM/YYYY format (e.g. 16/08/2026)
function formatDateToDMY(str) {
  if (!str) return '-';
  const datePart = str.split(/[ T]/)[0];
  const parts = datePart.split('-');
  if (parts.length === 3) {
    const [year, month, day] = parts;
    return `${day}/${month}/${year}`;
  }
  if (str.includes('/')) return str;
}

function formatCreatorName(email, role) {
  if (!email || email === 'unknown') return 'System';
  let username = email.split('@')[0];
  username = username.charAt(0).toUpperCase() + username.slice(1);
  
  let roleDisplay = '';
  if (role === 'admin') roleDisplay = 'Admin';
  else if (role === 'staff_approved') roleDisplay = 'Staff - Approved';
  else if (role === 'staff_pending') roleDisplay = 'Staff - Pending';
  
  return `${username} (${roleDisplay || role})`;
}

// Main function to render A4 Voucher Template
async function renderA4VoucherHTML(data, agencySettings) {
  const voucher_ref = data.voucherRef || data.id || '';
  const baseUrl = (typeof process !== 'undefined' && process.env && process.env.PUBLIC_APP_URL)
    || 'https://saudipak-vouchers.vercel.app';
  const verifyUrl = `${baseUrl}/verify?voucher=${voucher_ref}`;
  const qrDataUrl = await generateQRCodeDataUrl(verifyUrl);

  // Agency logo HTML
  let logoHtml = '';
  if (agencySettings.logo && agencySettings.logo.startsWith('data:image')) {
    logoHtml = `<img src="${agencySettings.logo}" class="max-h-12 max-w-[160px] object-contain" alt="Logo">`;
  } else {
    logoHtml = `
      <div class="flex items-center space-x-2 text-emerald-800">
        <i class="fa-solid fa-kaaba text-3xl"></i>
        <span class="font-extrabold text-lg leading-tight uppercase tracking-wider text-emerald-900">${agencySettings.agencyName || 'SAUDI PAK GROUP OF TRAVELS'}</span>
      </div>`;
  }

  // 1. Passenger Basic Details Table Rows
  const passBasicRowsHtml = (data.passengers || []).map((p, idx) => `
    <tr class="${idx % 2 === 1 ? 'bg-slate-50' : 'bg-white'} border-b border-slate-200">
      <td class="text-center font-bold py-1.5 px-2 text-slate-900 text-[10px]">${idx + 1}</td>
      <td class="font-bold py-1.5 px-2 text-slate-900 text-[10px]">${p.passportNo || '-'}</td>
      <td class="font-extrabold py-1.5 px-2 text-emerald-900 text-[10.5px] truncate">${p.name || '-'}</td>
      <td class="text-center font-semibold py-1.5 px-1 text-slate-900 text-[10px]">${p.gender || '-'}</td>
      <td class="text-center py-1.5 px-1"><span class="px-1.5 py-0.5 bg-sky-100 text-sky-800 rounded text-[9.5px] font-extrabold">${p.type || '-'}</span></td>
      <td class="text-center font-semibold py-1.5 px-1 text-slate-900 text-[10px]">${p.bed || '-'}</td>
    </tr>
  `).join('');

  // 2. Visa & MOFA Details Table Rows
  const passVisaRowsHtml = (data.passengers || []).map((p, idx) => `
    <tr class="${idx % 2 === 1 ? 'bg-slate-50' : 'bg-white'} border-b border-slate-200">
      <td class="text-center font-bold py-1.5 px-2 text-slate-900 text-[10px]">${idx + 1}</td>
      <td class="font-extrabold py-1.5 px-2 text-slate-900 text-[10px] truncate">${p.name || '-'}</td>
      <td class="font-bold py-1.5 px-2 text-slate-900 text-[10px]">${p.mofaNo || '-'}</td>
      <td class="font-bold py-1.5 px-2 text-slate-900 text-[10px]">${p.groupNo || '-'}</td>
      <td class="font-bold py-1.5 px-2 text-slate-900 text-[10px]">${p.visaNo || '-'}</td>
      <td class="font-mono font-extrabold py-1.5 px-2 text-emerald-800 text-[10.5px]">${p.pnr || '-'}</td>
    </tr>
  `).join('');

  // 3. Hotel Rows
  const hotelRowsHtml = (data.hotels || []).map((h, idx) => `
    <tr class="${idx % 2 === 1 ? 'bg-slate-50' : 'bg-white'} border-b border-slate-200 text-[10px]">
      <td class="font-extrabold py-1.5 px-2 text-emerald-900">${h.city || '-'}</td>
      <td class="font-extrabold py-1.5 px-2 text-slate-900 truncate">${h.hotelName || '-'}</td>
      <td class="font-bold py-1.5 px-2 text-slate-800">${h.roomType || '-'}</td>
      <td class="font-bold py-1.5 px-2 text-slate-800">${h.mealPlan || '-'}</td>
      <td class="font-bold py-1.5 px-2 text-slate-900">${formatDateToDMY(h.checkIn)}</td>
      <td class="font-bold py-1.5 px-2 text-slate-900">${formatDateToDMY(h.checkOut)}</td>
      <td class="text-center font-black py-1.5 px-2 text-emerald-800 bg-emerald-50">${h.totalNights || 0} Nts</td>
    </tr>
  `).join('');

  // Dual Terms HTML
  const termsUrduLines = (data.termsUrdu || '').split('\n').filter(l => l.trim()).map(l => `<li class="mb-0.5">${l}</li>`).join('');
  const termsEngLines = (data.termsEnglish || '').split('\n').filter(l => l.trim()).map(l => `<li class="mb-0.5">${l}</li>`).join('');

  const status = data.status || 'NOT APPROVED';
  return `
    <div style="width: 100%; max-width: 100%; box-sizing: border-box;" class="a4-voucher-page pdf-container voucher-wrapper pdf-page-container voucher-root-container flex flex-col justify-between overflow-hidden p-4 bg-white text-slate-900 text-[11px] leading-snug">
      <div class="watermark-overlay" style="position: absolute !important; top: 50% !important; left: 50% !important; transform: translate(-50%, -50%) rotate(-30deg) !important; width: 85% !important; text-align: center !important; pointer-events: none !important; user-select: none !important; z-index: 9999 !important; opacity: 0.18 !important; color: ${status === 'APPROVED' ? '#00875A' : '#EF4444'} !important;">
        <div style="font-family: 'Impact', 'Arial Black', 'Arial', sans-serif !important; font-size: ${status === 'APPROVED' ? '85pt' : '70pt'} !important; font-weight: 950 !important; border: 8px double currentColor !important; padding: 15px 40px !important; border-radius: 12px !important; letter-spacing: 6px !important; white-space: nowrap !important; line-height: 1.1 !important; text-transform: uppercase !important; display: inline-block !important;">
          ${status === 'APPROVED' ? 'APPROVED' : 'NOT APPROVED'}
        </div>
      </div>
      
      <!-- TOP HEADER (AGENCY BRANDING) -->
      <div>
        <div class="flex items-center justify-between border-b-2 border-emerald-700 pb-2 mb-2">
          <div class="flex items-center space-x-2">
            ${logoHtml}
            <div>
              <h1 class="text-sm font-black text-emerald-950 tracking-wide uppercase leading-tight">${agencySettings.agencyName || 'SAUDI PAK GROUP OF TRAVELS'}</h1>
              <p class="text-[10px] text-slate-700 font-bold">${agencySettings.tagline || 'Hajj & Umrah Pilgrimage Services'}</p>
              <p class="text-[9px] text-emerald-800 font-extrabold mt-0.5">${agencySettings.licenseNo ? 'Lic / IATA: ' + agencySettings.licenseNo : ''}</p>
            </div>
          </div>

          <div class="text-right text-[10px] space-y-0.5 text-slate-800 font-semibold">
            <p class="font-extrabold text-slate-900"><i class="fa-solid fa-phone text-emerald-700 mr-1"></i>${agencySettings.phone1 || ''} ${agencySettings.phone2 ? ' | ' + agencySettings.phone2 : ''}</p>
            <p><i class="fa-solid fa-envelope text-emerald-700 mr-1"></i>${agencySettings.email || ''}</p>
            <p><i class="fa-solid fa-globe text-emerald-700 mr-1"></i>${agencySettings.website || ''}</p>
            <p class="text-[9px] text-slate-700 max-w-[200px] truncate"><i class="fa-solid fa-location-dot text-emerald-700 mr-1"></i>${agencySettings.address || ''}</p>
          </div>
        </div>

        <!-- VOUCHER TITLE BAR -->
        <div class="bg-emerald-800 text-white rounded-md px-3 py-1.5 flex items-center justify-between shadow-sm mb-2">
          <div class="flex items-center space-x-2">
            <i class="fa-solid fa-kaaba text-amber-300 text-sm"></i>
            <span class="font-black text-[11px] tracking-wider uppercase">OFFICIAL TRAVEL & UMRAH VOUCHER</span>
          </div>
          <div class="flex items-center space-x-3 text-[10.5px]">
            <span>Voucher Ref: <strong class="text-amber-300 font-mono font-bold">${data.id}</strong></span>
            <span>Date: <strong>${formatDateToDMY(data.voucherDate)}</strong></span>
          </div>
        </div>

        <!-- SUMMARY INFO GRID -->
        <div class="grid grid-cols-4 gap-2 bg-emerald-50/80 border border-emerald-200 rounded-md p-2 mb-2 text-[10px]">
          <div>
            <span class="text-slate-600 block uppercase tracking-wider text-[8px] font-extrabold">Family Head / Leader</span>
            <strong class="text-slate-900 text-[11px] block truncate">${data.familyHead}</strong>
          </div>
          <div>
            <span class="text-slate-600 block uppercase tracking-wider text-[8px] font-extrabold">Package Name</span>
            <strong class="text-emerald-900 text-[11px] block truncate">${data.packageName}</strong>
          </div>
          <div>
            <span class="text-slate-600 block uppercase tracking-wider text-[8px] font-extrabold">PAX Breakdown</span>
            <strong class="text-slate-900 block text-[10px]">${data.adultsCount || 0} Adults, ${data.childrenCount || 0} Child, ${data.infantsCount || 0} Inf</strong>
          </div>
          <div>
            <span class="text-slate-600 block uppercase tracking-wider text-[8px] font-extrabold">Total PAX</span>
            <span class="px-2 py-0.5 bg-emerald-700 text-white rounded font-black text-[10px] inline-block">${data.totalPax} Person(s)</span>
          </div>
        </div>

        <!-- 1. PASSENGER BASIC DETAILS TABLE -->
        <div class="mb-2">
          <div class="bg-slate-800 text-white text-[10px] font-extrabold px-2 py-1 rounded-t-md flex items-center justify-between">
            <span><i class="fa-solid fa-users text-emerald-400 mr-1.5"></i>PASSENGER BASIC DETAILS</span>
            <span>Total Passengers: ${data.passengers ? data.passengers.length : 0}</span>
          </div>
          <table class="w-full text-left border-collapse border border-slate-300 text-[10px] table-fixed">
            <thead>
              <tr class="bg-slate-100 text-slate-900 uppercase font-black text-[8.5px]">
                <th style="width: 5%;" class="border border-slate-300 py-1 px-1.5 text-center">#</th>
                <th style="width: 20%;" class="border border-slate-300 py-1 px-2">Passport #</th>
                <th style="width: 35%;" class="border border-slate-300 py-1 px-2">Passenger Name</th>
                <th style="width: 12%;" class="border border-slate-300 py-1 px-1 text-center">Gender</th>
                <th style="width: 13%;" class="border border-slate-300 py-1 px-1 text-center">Type</th>
                <th style="width: 15%;" class="border border-slate-300 py-1 px-1 text-center">Bed Type</th>
              </tr>
            </thead>
            <tbody>
              ${passBasicRowsHtml || '<tr><td colspan="6" class="text-center py-2 font-bold text-slate-500">No passenger basic details listed</td></tr>'}
            </tbody>
          </table>
        </div>

        ${data.showMofaDetails ? `
        <!-- 2. VISA, MOFA & BOOKING DETAILS TABLE -->
        <div class="mb-2">
          <div class="bg-emerald-950 text-white text-[10px] font-extrabold px-2 py-1 rounded-t-md flex items-center justify-between">
            <span><i class="fa-solid fa-passport text-amber-300 mr-1.5"></i>VISA, MOFA & BOOKING DETAILS</span>
          </div>
          <table class="w-full text-left border-collapse border border-slate-300 text-[10px] table-fixed">
            <thead>
              <tr class="bg-slate-100 text-slate-900 uppercase font-black text-[8.5px]">
                <th style="width: 5%;" class="border border-slate-300 py-1 px-1.5 text-center">#</th>
                <th style="width: 30%;" class="border border-slate-300 py-1 px-2">Passenger Name</th>
                <th style="width: 17%;" class="border border-slate-300 py-1 px-2">MOFA #</th>
                <th style="width: 16%;" class="border border-slate-300 py-1 px-2">Group #</th>
                <th style="width: 17%;" class="border border-slate-300 py-1 px-2">Visa #</th>
                <th style="width: 15%;" class="border border-slate-300 py-1 px-2">PNR</th>
              </tr>
            </thead>
            <tbody>
              ${passVisaRowsHtml || '<tr><td colspan="6" class="text-center py-2 font-bold text-slate-500">No visa / MOFA details listed</td></tr>'}
            </tbody>
          </table>
        </div>` : ''}

        <!-- 3. ACCOMMODATION / HOTEL TABLE -->
        <div class="mb-2">
          <div class="bg-emerald-900 text-white text-[10px] font-extrabold px-2 py-1 rounded-t-md flex items-center justify-between">
            <span><i class="fa-solid fa-hotel text-amber-300 mr-1.5"></i>ACCOMMODATION & HOTEL BOOKING SCHEDULE</span>
          </div>
          <table class="w-full text-left border-collapse border border-slate-300 text-[10px] table-fixed">
            <thead>
              <tr class="bg-slate-100 text-slate-900 uppercase font-black text-[8.5px]">
                <th style="width: 13%;" class="border border-slate-300 py-1 px-2">City</th>
                <th style="width: 27%;" class="border border-slate-300 py-1 px-2">Hotel Name</th>
                <th style="width: 15%;" class="border border-slate-300 py-1 px-2">Room Type</th>
                <th style="width: 15%;" class="border border-slate-300 py-1 px-2">Meal Plan</th>
                <th style="width: 11%;" class="border border-slate-300 py-1 px-2">Check-In</th>
                <th style="width: 11%;" class="border border-slate-300 py-1 px-2">Check-Out</th>
                <th style="width: 8%;" class="border border-slate-300 py-1 px-1 text-center">Nights</th>
              </tr>
            </thead>
            <tbody>
              ${hotelRowsHtml || '<tr><td colspan="7" class="text-center py-2 font-bold text-slate-500">No accommodation details listed</td></tr>'}
            </tbody>
          </table>
        </div>

        <!-- 4. STRUCTURED FLIGHT SCHEDULE TABLE -->
        <div class="mb-2">
          <div class="bg-slate-800 text-white text-[10px] font-extrabold px-2 py-1 rounded-t-md flex items-center justify-between">
            <span><i class="fa-solid fa-plane-departure text-emerald-400 mr-1.5"></i>FLIGHT SCHEDULE TABLE</span>
          </div>
          <table class="w-full text-left border-collapse border border-slate-300 text-[10px] table-fixed">
            <thead>
              <tr class="bg-slate-100 text-slate-900 uppercase font-black text-[8.5px]">
                <th style="width: 12%;" class="border border-slate-300 py-1 px-2">Sector</th>
                <th style="width: 22%;" class="border border-slate-300 py-1 px-2">Airline</th>
                <th style="width: 14%;" class="border border-slate-300 py-1 px-2">Flight No</th>
                <th style="width: 18%;" class="border border-slate-300 py-1 px-2">Date</th>
                <th style="width: 18%;" class="border border-slate-300 py-1 px-2">Time</th>
                <th style="width: 16%;" class="border border-slate-300 py-1 px-2">Route</th>
              </tr>
            </thead>
            <tbody>
              <tr class="bg-white border-b border-slate-200">
                <td class="font-black text-emerald-800 py-1.5 px-2">Departure</td>
                <td class="font-extrabold text-slate-900 py-1.5 px-2">${data.flight ? data.flight.departureAirline || '-' : '-'}</td>
                <td class="font-mono font-black text-slate-900 py-1.5 px-2">${data.flight ? data.flight.departureFlightNo || '-' : '-'}</td>
                <td class="font-bold text-slate-900 py-1.5 px-2">${formatDateToDMY(data.flight ? data.flight.departureDate : '')}</td>
                <td class="font-bold text-slate-900 py-1.5 px-2">${data.flight ? data.flight.departureTime || '-' : '-'}</td>
                <td class="font-extrabold text-emerald-900 py-1.5 px-2">${data.flight ? data.flight.departureRoute || '-' : '-'}</td>
              </tr>
              <tr class="bg-slate-50 border-b border-slate-200">
                <td class="font-black text-emerald-800 py-1.5 px-2">Return</td>
                <td class="font-extrabold text-slate-900 py-1.5 px-2">${data.flight ? data.flight.returnAirline || '-' : '-'}</td>
                <td class="font-mono font-black text-slate-900 py-1.5 px-2">${data.flight ? data.flight.returnFlightNo || '-' : '-'}</td>
                <td class="font-bold text-slate-900 py-1.5 px-2">${formatDateToDMY(data.flight ? data.flight.returnDate : '')}</td>
                <td class="font-bold text-slate-900 py-1.5 px-2">${data.flight ? data.flight.returnTime || '-' : '-'}</td>
                <td class="font-extrabold text-emerald-900 py-1.5 px-2">${data.flight ? data.flight.returnRoute || '-' : '-'}</td>
              </tr>
            </tbody>
          </table>
        </div>

        <!-- 4.5. ZIYARAT SCHEDULE TABLE -->
        <div class="mb-2">
          <div class="bg-emerald-900 text-white text-[10px] font-extrabold px-2 py-1 rounded-t-md flex items-center justify-between">
            <span><i class="fa-solid fa-mosque text-amber-300 mr-1.5"></i>ZIYARAT SCHEDULE</span>
          </div>
          <table class="w-full text-left border-collapse border border-slate-300 text-[10px] table-fixed">
            <thead>
              <tr class="bg-slate-100 text-slate-900 uppercase font-black text-[8.5px]">
                <th style="width: 30%;" class="border border-slate-300 py-1 px-2">City</th>
                <th style="width: 35%;" class="border border-slate-300 py-1 px-2">Ziyarat Included</th>
                <th style="width: 35%;" class="border border-slate-300 py-1 px-2">Date</th>
              </tr>
            </thead>
            <tbody>
              <tr class="bg-white border-b border-slate-200">
                <td class="font-black text-emerald-800 py-1.5 px-2">Makkah</td>
                <td class="font-bold text-slate-900 py-1.5 px-2">${data.ziyarat ? data.ziyarat.makkahIncluded || 'No' : 'No'}</td>
                <td class="font-bold text-slate-900 py-1.5 px-2">${formatDateToDMY(data.ziyarat ? data.ziyarat.makkahDate : '')}</td>
              </tr>
              <tr class="bg-slate-50 border-b border-slate-200">
                <td class="font-black text-emerald-800 py-1.5 px-2">Madinah</td>
                <td class="font-bold text-slate-900 py-1.5 px-2">${data.ziyarat ? data.ziyarat.madinahIncluded || 'No' : 'No'}</td>
                <td class="font-bold text-slate-900 py-1.5 px-2">${formatDateToDMY(data.ziyarat ? data.ziyarat.madinahDate : '')}</td>
              </tr>
            </tbody>
          </table>
        </div>

        <!-- 5. TRANSPORT & ROUTE NO CARD -->
        <div class="border border-slate-300 rounded-md p-2 bg-slate-50 mb-2 text-[10px] space-y-1">
          <div class="font-black text-emerald-900 text-[10.5px] border-b border-slate-200 pb-1 flex items-center">
            <i class="fa-solid fa-bus text-emerald-700 mr-1.5"></i>TRANSPORT & TRANSFER DETAILS
          </div>
          <div class="grid grid-cols-2 gap-2 text-slate-900 font-bold">
            <p><strong>Date:</strong> ${data.transport ? formatDateToDMY(data.transport.date) : '-'}</p>
            <p><strong>Company:</strong> ${data.transport ? data.transport.transporter || '-' : '-'}</p>
            <p><strong>Vehicle:</strong> ${data.transport ? data.transport.vehicleType || '-' : '-'}</p>
            <p><strong>Route No:</strong> <span class="font-mono font-black text-emerald-800">${data.transport ? data.transport.routeNo || '-' : '-'}</span></p>
          </div>
          <p class="text-slate-900 font-extrabold pt-0.5"><strong>Transport Route:</strong> ${data.transport ? data.transport.route || '-' : '-'}</p>
        </div>

        <!-- 6. HELPLINES & 85px QR CODE STAMP -->
        <div class="flex items-center justify-between border-2 border-emerald-300 bg-emerald-50/90 rounded-md p-2 mb-2 text-[10px]">
          <div class="space-y-1 text-slate-900">
            <span class="font-black text-emerald-950 uppercase block text-[11px]"><i class="fa-solid fa-headset mr-1.5 text-emerald-700"></i>24/7 KSA EMERGENCY HELPLINES:</span>
            <div class="flex space-x-3 text-[10px] font-bold">
              <span>Makkah: <strong class="text-emerald-900 font-mono text-[10.5px]">${data.helplines ? data.helplines.makkah || '-' : '-'}</strong></span>
              <span>Medina: <strong class="text-emerald-900 font-mono text-[10.5px]">${data.helplines ? data.helplines.medina || '-' : '-'}</strong></span>
              <span>Transport: <strong class="text-emerald-900 font-mono text-[10.5px]">${data.helplines ? data.helplines.transport || '-' : '-'}</strong></span>
            </div>
          </div>

          <!-- Enlarged 85px QR Code Badge -->
          <div class="flex items-center space-x-2 bg-white p-1.5 rounded-md border border-emerald-300 shadow-sm shrink-0">
            ${qrDataUrl ? `<img src="${qrDataUrl}" style="width: 85px; height: 85px;" class="w-[85px] h-[85px] object-contain" alt="Voucher QR">` : ''}
            <div class="text-[9px] leading-tight text-slate-700">
              <strong class="font-black text-emerald-900 block text-[10px] uppercase">OFFICIAL VERIFIED</strong>
              <span>Scan QR to verify</span>
              <span class="block font-mono font-bold text-[8.5px] text-slate-900 mt-0.5">${data.id}</span>
            </div>
          </div>
        </div>

      </div>

      <!-- FOOTER TERMS & CONDITIONS (DUAL URDU & ENGLISH) -->
      <div class="border-t-2 border-emerald-700 pt-1.5 text-[9.5px] text-slate-900 font-semibold space-y-1">
        <div class="grid grid-cols-2 gap-2">
          
          <!-- Urdu Rules -->
          <div dir="rtl" class="text-right font-arabic bg-slate-50 p-1.5 rounded border border-slate-200">
            <span class="font-black text-emerald-950 block text-[10px] mb-0.5">ضروری ہدایات و شرائط:</span>
            <ul class="list-disc pr-3 space-y-0.5 text-[9px] font-bold">
              ${termsUrduLines || '<li>ہوٹل کیلیے چیک ان 04:00 PM اور چیک آؤٹ 12:00 PM ہے۔</li>'}
            </ul>
          </div>

          <!-- English Terms -->
          <div class="bg-slate-50 p-1.5 rounded border border-slate-200">
            <span class="font-black text-emerald-950 block text-[10px] mb-0.5">Terms & Conditions:</span>
            <ul class="list-disc pl-3 space-y-0.5 text-[9px] font-bold">
              ${termsEngLines || '<li>Hotel check-in is 04:00 PM and check-out is 12:00 PM.</li>'}
            </ul>
          </div>

        </div>

        <div class="flex items-center justify-between text-[8px] text-slate-500 font-bold border-t border-slate-200 pt-1">
          <span>Prepared By: <strong>${formatCreatorName(data.createdBy, data.createdByRole)}</strong></span>
          <span>Generated via Travel Voucher Generator System</span>
          <span>Page 1 of 1</span>
        </div>
      </div>

    </div>
  `;
}