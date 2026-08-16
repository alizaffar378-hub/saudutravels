require('dotenv').config();
const express = require('express');
const path = require('path');
const fs = require('fs');
const QRCode = require('qrcode');
const { createClient } = require('@supabase/supabase-js');

const app = express();
const PORT = process.env.PORT || 3000;

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_ANON_KEY);

app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));
app.use(express.static(path.join(__dirname, 'public')));

const DATA_DIR = path.join(__dirname, 'data');
const VOUCHERS_FILE = path.join(DATA_DIR, 'vouchers.json');
const SETTINGS_FILE = path.join(DATA_DIR, 'settings.json');

// Ensure data directory & files exist
if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
if (!fs.existsSync(VOUCHERS_FILE)) fs.writeFileSync(VOUCHERS_FILE, JSON.stringify([]));
if (!fs.existsSync(SETTINGS_FILE)) fs.writeFileSync(SETTINGS_FILE, JSON.stringify({}));

// Helper functions for reading/writing JSON
function readJSONFile(filepath, fallback = []) {
  try {
    if (!fs.existsSync(filepath)) return fallback;
    const content = fs.readFileSync(filepath, 'utf8');
    return JSON.parse(content);
  } catch (err) {
    console.error(`Error reading ${filepath}:`, err);
    return fallback;
  }
}

function writeJSONFile(filepath, data) {
  try {
    fs.writeFileSync(filepath, JSON.stringify(data, null, 2), 'utf8');
    return true;
  } catch (err) {
    console.error(`Error writing ${filepath}:`, err);
    return false;
  }
}

// --- API ENDPOINTS ---

// 1. GET Settings
app.get('/api/settings', (req, res) => {
  const settings = readJSONFile(SETTINGS_FILE, {});
  res.json({ success: true, settings });
});

// 2. POST Settings
app.post('/api/settings', (req, res) => {
  const newSettings = req.body;
  const currentSettings = readJSONFile(SETTINGS_FILE, {});
  const updatedSettings = { ...currentSettings, ...newSettings };
  writeJSONFile(SETTINGS_FILE, updatedSettings);
  res.json({ success: true, settings: updatedSettings });
});

// 3. GET Vouchers
app.get('/api/vouchers', async (req, res) => {
  try {
    const { data, error } = await supabase
      .from('vouchers')
      .select('*')
      .order('created_at', { ascending: false });

    if (error) throw error;

    const vouchers = (data || []).map(row => ({
      ...(row.form_data || {}),
      id: row.id,
      voucherDate: row.voucher_date,
      familyHead: row.family_head,
      packageName: row.package_name,
      status: row.status || 'NOT APPROVED',
      createdBy: row.created_by || (row.form_data && row.form_data.createdBy) || 'unknown',
      createdByRole: (row.form_data && row.form_data.createdByRole) || 'staff_pending'
    }));

    res.json({ success: true, vouchers });
  } catch (err) {
    console.error("Supabase GET Error:", err.message);
    res.status(500).json({ success: false, message: err.message });
  }
});

// 4. POST Voucher (Create or Update)
// 4. POST Voucher (Create or Update)
app.post('/api/vouchers', async (req, res) => {
  const formData = req.body;
  if (!formData.id) {
    return res.status(400).json({ success: false, message: 'Voucher ID is required' });
  }

  // Case-insensitive role and headers extraction
  const rawRole = req.headers['x-user-role'] || formData.createdByRole || 'staff_pending';
  const requesterRole = rawRole.toString().toLowerCase().trim();
  const requesterEmail = req.headers['x-user-email'] || formData.createdBy || 'unknown';

  // Admin aur approved staff check
  const hasApprovalRights = (requesterRole === 'admin' || requesterRole === 'staff_approved');

  let status = 'NOT APPROVED';
  let createdBy = requesterEmail;
  let createdByRole = requesterRole;

  try {
    const { data: existingVoucher } = await supabase
      .from('vouchers')
      .select('status, created_by, form_data')
      .eq('id', formData.id)
      .single();

    if (existingVoucher) {
      // Maintain original creator details on updates
      if (existingVoucher.created_by) {
        createdBy = existingVoucher.created_by;
        if (existingVoucher.form_data && existingVoucher.form_data.createdByRole) {
          createdByRole = existingVoucher.form_data.createdByRole;
        }
      }
      
      // Preserve status if already approved
      if (existingVoucher.status === 'APPROVED') {
        status = 'APPROVED';
      }
    }
  } catch (e) {
    // New voucher entry
  }

  // Force APPROVED status if requester has approval rights
  if (hasApprovalRights) {
    status = 'APPROVED';
  }

  const updatedFormData = { 
    ...formData, 
    status, 
    createdBy, 
    createdByRole 
  };

  try {
    const { error } = await supabase
      .from('vouchers')
      .upsert({
        id: formData.id,
        voucher_ref: formData.voucherRef || formData.id,
        family_head: formData.familyHead,
        package_name: formData.packageName,
        voucher_date: formData.voucherDate,
        status: status,
        created_by: createdBy,
        form_data: updatedFormData
      });

    if (error) throw error;

    res.json({ success: true, voucher: updatedFormData });
  } catch (err) {
    console.error("Supabase POST Error:", err.message);
    res.status(500).json({ success: false, message: err.message });
  }
});

// 5. DELETE Voucher
app.delete('/api/vouchers/:id', async (req, res) => {
  const { id } = req.params;
  try {
    const { error } = await supabase
      .from('vouchers')
      .delete()
      .eq('id', id);

    if (error) throw error;

    res.json({ success: true, message: `Voucher ${id} deleted` });
  } catch (err) {
    console.error("Supabase DELETE Error:", err.message);
    res.status(500).json({ success: false, message: err.message });
  }
});

// 6. POST Generate QR Code (Base64)
app.post('/api/generate-qr', async (req, res) => {
  try {
    const { text } = req.body;
    const qrDataUrl = await QRCode.toDataURL(text || 'VALIDATED-TRAVEL-VOUCHER', {
      errorCorrectionLevel: 'M',
      margin: 2,
      width: 150,
      color: { dark: '#047857', light: '#ffffff' }
    });
    res.json({ success: true, qrDataUrl });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// 7. GET Puppeteer / PDF Configuration
const PUPPETEER_PDF_OPTIONS = {
  format: 'A4',
  landscape: false,
  printBackground: true,
  preferCSSPageSize: true,
  margin: {
    top: '0mm',
    right: '0mm',
    bottom: '0mm',
    left: '0mm'
  }
};

app.get('/api/pdf-config', (req, res) => {
  res.json({ success: true, config: PUPPETEER_PDF_OPTIONS });
});

// 8. Self-Contained Inline-Styled PDF Template Generator
function buildSelfContainedPdfHtml(data, agencySettings, qrDataUrl) {
  const formatDateToDMY = (str) => {
    if (!str) return '-';
    const datePart = str.split(/[ T]/)[0];
    const parts = datePart.split('-');
    if (parts.length === 3) {
      const [year, month, day] = parts;
      return `${day}/${month}/${year}`;
    }
    if (str.includes('/')) return str;
    return str;
  };

  const formatCreatorName = (email, role) => {
    if (!email || email === 'unknown') return 'System';
    let username = email.split('@')[0];
    username = username.charAt(0).toUpperCase() + username.slice(1);
    
    let roleDisplay = '';
    if (role === 'admin') roleDisplay = 'Admin';
    else if (role === 'staff_approved') roleDisplay = 'Staff - Approved';
    else if (role === 'staff_pending') roleDisplay = 'Staff - Pending';
    
    return `${username} (${roleDisplay || role})`;
  };

  // 1. Passenger Basic Details Table Rows
  const passBasicRowsHtml = (data.passengers || []).map((p, idx) => `
    <tr style="${idx % 2 === 1 ? 'background-color: #f9fafb;' : 'background-color: #ffffff;'}">
      <td style="text-align: center; font-weight: bold; color: #111827;">${idx + 1}</td>
      <td style="font-weight: bold; color: #111827;">${p.passportNo || '-'}</td>
      <td style="font-weight: 800; color: #065f46;">${p.name || '-'}</td>
      <td style="text-align: center; font-weight: bold; color: #111827;">${p.gender || '-'}</td>
      <td style="text-align: center;"><span style="background: #e0f2fe; color: #0369a1; padding: 1px 4px; border-radius: 2px; font-size: 8.5px; font-weight: 800;">${p.type || '-'}</span></td>
      <td style="text-align: center; font-weight: bold; color: #111827;">${p.bed || '-'}</td>
    </tr>
  `).join('');

  // 2. Visa & MOFA Details Table Rows
  const passVisaRowsHtml = (data.passengers || []).map((p, idx) => `
    <tr style="${idx % 2 === 1 ? 'background-color: #f9fafb;' : 'background-color: #ffffff;'}">
      <td style="text-align: center; font-weight: bold; color: #111827;">${idx + 1}</td>
      <td style="font-weight: 800; color: #111827;">${p.name || '-'}</td>
      <td style="font-weight: bold; color: #111827;">${p.mofaNo || '-'}</td>
      <td style="font-weight: bold; color: #111827;">${p.groupNo || '-'}</td>
      <td style="font-weight: bold; color: #111827;">${p.visaNo || '-'}</td>
      <td style="font-weight: 800; font-family: monospace; color: #047857;">${p.pnr || '-'}</td>
    </tr>
  `).join('');

  // 3. Hotel Rows
  const hotelRowsHtml = (data.hotels || []).map((h, idx) => `
    <tr style="${idx % 2 === 1 ? 'background-color: #f9fafb;' : 'background-color: #ffffff;'}">
      <td style="font-weight: 800; color: #047857;">${h.city || '-'}</td>
      <td style="font-weight: 800; color: #111827;">${h.hotelName || '-'}</td>
      <td style="font-weight: bold; color: #1f2937;">${h.roomType || '-'}</td>
      <td style="font-weight: bold; color: #1f2937;">${h.mealPlan || '-'}</td>
      <td style="font-weight: bold; color: #111827;">${formatDateToDMY(h.checkIn)}</td>
      <td style="font-weight: bold; color: #111827;">${formatDateToDMY(h.checkOut)}</td>
      <td style="text-align: center; font-weight: 800; color: #047857; background-color: #ecfdf5;">${h.totalNights || 0} Nts</td>
    </tr>
  `).join('');

  const termsUrduLines = (data.termsUrdu || '').split('\n').filter(l => l.trim()).map(l => `<li style="margin-bottom: 2px;">${l}</li>`).join('');
  const termsEngLines = (data.termsEnglish || '').split('\n').filter(l => l.trim()).map(l => `<li style="margin-bottom: 2px;">${l}</li>`).join('');

  let logoHtml = '';
  if (agencySettings.logo && agencySettings.logo.startsWith('data:image')) {
    logoHtml = `<img src="${agencySettings.logo}" style="max-height: 48px; max-width: 160px; object-fit: contain;" alt="Logo">`;
  } else {
    logoHtml = `
      <div style="font-size: 16px; font-weight: 900; color: #047857; text-transform: uppercase;">
        ${agencySettings.agencyName || 'SAUDI PAK GROUP OF TRAVELS'}
      </div>`;
  }

  return `
  <!DOCTYPE html>
  <html lang="en">
  <head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=794, initial-scale=1.0">
    <style>
      @page {
        size: A4 portrait;
        margin: 0;
      }
      * {
        box-sizing: border-box !important;
        margin: 0;
        padding: 0;
        font-family: Arial, Helvetica, sans-serif !important;
      }
      html, body {
        width: 794px !important;
        margin: 0 auto !important;
        padding: 0 !important;
        background: #ffffff !important;
        color: #111827 !important;
        font-size: 12px !important;
        line-height: 1.35 !important;
        -webkit-print-color-adjust: exact !important;
        print-color-adjust: exact !important;
        overflow: hidden !important;
      }
      
      .pdf-container, .voucher-container {
        position: relative !important;
        width: 794px !important;
        box-sizing: border-box !important;
        padding: 20px !important;
        margin: 0 auto !important;
        background: #ffffff !important;
        overflow: hidden !important;
        page-break-after: avoid !important;
        page-break-inside: avoid !important;
        display: flex !important;
        flex-direction: column !important;
        justify-content: space-between !important;
      }
      .watermark-overlay {
        position: absolute !important;
        top: 50% !important;
        left: 50% !important;
        transform: translate(-50%, -50%) rotate(-30deg) !important;
        width: 85% !important;
        text-align: center !important;
        pointer-events: none !important;
        user-select: none !important;
        z-index: 9999 !important;
        opacity: 0.18 !important;
      }
      
      .header { display: flex; justify-content: space-between; align-items: center; padding-bottom: 8px; border-bottom: 2px solid #047857; margin-bottom: 8px; }
      .brand-title { font-size: 15px; font-weight: 900; color: #047857; text-transform: uppercase; }
      .brand-tagline { font-size: 10px; color: #374151; font-weight: bold; }
      .company-info { text-align: right; font-size: 9.5px; color: #1f2937; line-height: 1.35; font-weight: 600; }
      
      .banner { background-color: #047857; color: white; padding: 6px 10px; font-weight: 900; border-radius: 4px; display: flex; justify-content: space-between; align-items: center; margin-bottom: 8px; font-size: 11px; }
      .banner-ref { color: #fef08a; font-family: monospace; font-size: 12px; font-weight: bold; }
      
      .info-grid { display: flex; gap: 8px; background-color: #f0fdf4; border: 1.5px solid #a7f3d0; padding: 6px 10px; border-radius: 4px; margin-bottom: 8px; font-size: 10px; }
      .info-item { flex: 1; }
      .info-label { display: block; font-size: 8px; text-transform: uppercase; color: #4b5563; font-weight: 800; margin-bottom: 2px; }
      .info-value { font-weight: 900; color: #111827; font-size: 11px; }
      
      table { width: 100%; border-collapse: collapse; margin-bottom: 8px; font-size: 9.5px; table-layout: fixed; }
      th { background-color: #f3f4f6; color: #111827; text-align: left; padding: 4px 6px; font-weight: 800; border: 1px solid #9ca3af; font-size: 8.5px; text-transform: uppercase; }
      td { padding: 4px 6px; border: 1px solid #d1d5db; word-wrap: break-word; font-size: 9.5px; color: #111827; }
      
      .section-title { font-size: 9.5px; font-weight: 900; color: #ffffff; background-color: #065f46; padding: 3px 8px; border-radius: 3px 3px 0 0; text-transform: uppercase; display: flex; justify-content: space-between; }
      
      .card { border: 1px solid #d1d5db; padding: 6px 8px; border-radius: 4px; background-color: #f9fafb; margin-bottom: 8px; font-size: 10px; font-weight: 600; }
      .card-header { font-weight: 900; color: #047857; font-size: 10.5px; border-bottom: 1.5px solid #d1d5db; padding-bottom: 3px; margin-bottom: 4px; text-transform: uppercase; }
      .card-body p { margin-bottom: 2px; color: #111827; }
      
      .helpline-qr-bar { display: flex; justify-content: space-between; align-items: center; border: 1.5px solid #a7f3d0; background-color: #ecfdf5; padding: 6px 10px; border-radius: 4px; margin-bottom: 8px; }
      .helpline-title { font-weight: 900; color: #065f46; font-size: 10px; text-transform: uppercase; margin-bottom: 3px; }
      .helpline-numbers { display: flex; gap: 12px; font-size: 9.5px; color: #111827; font-weight: bold; }
      .qr-box { display: flex; align-items: center; gap: 8px; background: #ffffff; padding: 4px 6px; border: 1px solid #d1d5db; border-radius: 4px; shrink: 0; }
      
      .terms-grid { display: flex; gap: 8px; margin-bottom: 6px; }
      .terms-box { flex: 1; background-color: #f9fafb; border: 1px solid #d1d5db; padding: 6px 8px; border-radius: 4px; font-size: 9px; color: #111827; font-weight: 600; }
      .terms-title { font-weight: 900; color: #065f46; margin-bottom: 3px; font-size: 9.5px; }
      
      .footer { display: flex; justify-content: space-between; align-items: center; padding-top: 4px; border-top: 1px solid #d1d5db; font-size: 8.5px; color: #6b7280; font-weight: bold; }
    </style>
  </head>
  <body>
    <div class="voucher-container">
      <div class="watermark-overlay" style="color: ${data.status === 'APPROVED' ? '#00875A' : '#EF4444'} !important;">
        <div style="font-family: 'Impact', 'Arial Black', 'Arial', sans-serif !important; font-size: ${data.status === 'APPROVED' ? '85pt' : '70pt'} !important; font-weight: 950 !important; border: 8px double currentColor !important; padding: 15px 40px !important; border-radius: 12px !important; letter-spacing: 6px !important; white-space: nowrap !important; line-height: 1.1 !important; text-transform: uppercase !important; display: inline-block !important;">
          ${data.status === 'APPROVED' ? 'APPROVED' : 'NOT APPROVED'}
        </div>
      </div>
      <div>
        <div class="header">
          <div>
            ${logoHtml}
            <div class="brand-title">${agencySettings.agencyName || 'SAUDI PAK GROUP OF TRAVELS'}</div>
            <div class="brand-tagline">${agencySettings.tagline || 'Official Services Voucher'}</div>
            ${agencySettings.licenseNo ? `<div style="font-size: 8.5px; color: #047857; font-weight: 800; margin-top: 2px;">Lic / IATA: ${agencySettings.licenseNo}</div>` : ''}
          </div>
          <div class="company-info">
            <p style="font-weight: 900; color: #111827;">${agencySettings.phone1 || ''} ${agencySettings.phone2 ? ' | ' + agencySettings.phone2 : ''}</p>
            <p>${agencySettings.email || ''}</p>
            <p>${agencySettings.website || ''}</p>
            <p style="max-width: 200px; font-weight: 600;">${agencySettings.address || ''}</p>
          </div>
        </div>

        <div class="banner">
          <span>OFFICIAL TRAVEL & UMRAH VOUCHER</span>
          <div>
            <span>Voucher Ref: <strong class="banner-ref">${data.id}</strong></span>
            <span style="margin-left: 10px;">Date: <strong>${formatDateToDMY(data.voucherDate)}</strong></span>
          </div>
        </div>

        <div class="info-grid">
          <div class="info-item">
            <span class="info-label">Family Head / Leader</span>
            <span class="info-value">${data.familyHead}</span>
          </div>
          <div class="info-item">
            <span class="info-label">Package Name</span>
            <span class="info-value" style="color: #047857;">${data.packageName}</span>
          </div>
          <div class="info-item">
            <span class="info-label">PAX Breakdown</span>
            <span class="info-value">${data.adultsCount || 0} Adults, ${data.childrenCount || 0} Child, ${data.infantsCount || 0} Inf</span>
          </div>
          <div class="info-item">
            <span class="info-label">Total PAX</span>
            <span class="info-value" style="background: #047857; color: white; padding: 2px 6px; border-radius: 3px; font-size: 9.5px;">${data.totalPax} Person(s)</span>
          </div>
        </div>

        <!-- 1. PASSENGER BASIC DETAILS TABLE -->
        <div style="margin-bottom: 8px;">
          <div class="section-title">
            <span>PASSENGER BASIC DETAILS</span>
            <span>Total Passengers: ${data.passengers ? data.passengers.length : 0}</span>
          </div>
          <table>
            <thead>
              <tr>
                <th style="width: 5%; text-align: center;">#</th>
                <th style="width: 20%;">Passport #</th>
                <th style="width: 35%;">Passenger Name</th>
                <th style="width: 12%; text-align: center;">Gender</th>
                <th style="width: 13%; text-align: center;">Type</th>
                <th style="width: 15%; text-align: center;">Bed Type</th>
              </tr>
            </thead>
            <tbody>
              ${passBasicRowsHtml || '<tr><td colspan="6" style="text-align:center; font-weight: bold;">No passenger details listed</td></tr>'}
            </tbody>
          </table>
        </div>

        ${data.showMofaDetails ? `
        <!-- 2. VISA, MOFA & BOOKING DETAILS TABLE -->
        <div style="margin-bottom: 8px;">
          <div class="section-title" style="background-color: #022c22;">
            <span>VISA, MOFA & BOOKING DETAILS</span>
          </div>
          <table>
            <thead>
              <tr>
                <th style="width: 5%; text-align: center;">#</th>
                <th style="width: 30%;">Passenger Name</th>
                <th style="width: 17%;">MOFA #</th>
                <th style="width: 16%;">Group #</th>
                <th style="width: 17%;">Visa #</th>
                <th style="width: 15%;">PNR</th>
              </tr>
            </thead>
            <tbody>
              ${passVisaRowsHtml || '<tr><td colspan="6" style="text-align:center; font-weight: bold;">No visa / MOFA details listed</td></tr>'}
            </tbody>
          </table>
        </div>` : ''}

        <!-- 3. ACCOMMODATION / HOTEL TABLE -->
        <div style="margin-bottom: 8px;">
          <div class="section-title">
            <span>ACCOMMODATION & HOTEL BOOKING SCHEDULE</span>
          </div>
          <table>
            <thead>
              <tr>
                <th style="width: 13%;">City</th>
                <th style="width: 27%;">Hotel Name</th>
                <th style="width: 15%;">Room Type</th>
                <th style="width: 15%;">Meal Plan</th>
                <th style="width: 11%;">Check-In</th>
                <th style="width: 11%;">Check-Out</th>
                <th style="width: 8%; text-align: center;">Nights</th>
              </tr>
            </thead>
            <tbody>
              ${hotelRowsHtml || '<tr><td colspan="7" style="text-align:center; font-weight: bold;">No accommodation details listed</td></tr>'}
            </tbody>
          </table>
        </div>

        <!-- 4. STRUCTURED FLIGHT SCHEDULE TABLE -->
        <div style="margin-bottom: 8px;">
          <div class="section-title" style="background-color: #1f2937;">
            <span>FLIGHT SCHEDULE TABLE</span>
          </div>
          <table>
            <thead>
              <tr>
                <th style="width: 12%;">Sector</th>
                <th style="width: 22%;">Airline</th>
                <th style="width: 14%;">Flight No</th>
                <th style="width: 18%;">Date</th>
                <th style="width: 18%;">Time</th>
                <th style="width: 16%;">Route</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td style="font-weight: 900; color: #047857;">Departure</td>
                <td style="font-weight: 800;">${data.flight ? data.flight.departureAirline || '-' : '-'}</td>
                <td style="font-weight: 900; font-family: monospace;">${data.flight ? data.flight.departureFlightNo || '-' : '-'}</td>
                <td style="font-weight: 800;">${formatDateToDMY(data.flight ? data.flight.departureDate : '')}</td>
                <td style="font-weight: 800;">${data.flight ? data.flight.departureTime || '-' : '-'}</td>
                <td style="font-weight: 900; color: #065f46;">${data.flight ? data.flight.departureRoute || '-' : '-'}</td>
              </tr>
              <tr style="background-color: #f9fafb;">
                <td style="font-weight: 900; color: #047857;">Return</td>
                <td style="font-weight: 800;">${data.flight ? data.flight.returnAirline || '-' : '-'}</td>
                <td style="font-weight: 900; font-family: monospace;">${data.flight ? data.flight.returnFlightNo || '-' : '-'}</td>
                <td style="font-weight: 800;">${formatDateToDMY(data.flight ? data.flight.returnDate : '')}</td>
                <td style="font-weight: 800;">${data.flight ? data.flight.returnTime || '-' : '-'}</td>
                <td style="font-weight: 900; color: #065f46;">${data.flight ? data.flight.returnRoute || '-' : '-'}</td>
              </tr>
            </tbody>
          </table>
        </div>

        <!-- 4.5. ZIYARAT SCHEDULE TABLE -->
        <div style="margin-bottom: 8px;">
          <div class="section-title" style="background-color: #065f46;">
            <span>ZIYARAT SCHEDULE</span>
          </div>
          <table>
            <thead>
              <tr>
                <th style="width: 30%;">City</th>
                <th style="width: 35%;">Ziyarat Included</th>
                <th style="width: 35%;">Date</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td style="font-weight: 900; color: #047857;">Makkah</td>
                <td style="font-weight: 800;">${data.ziyarat ? data.ziyarat.makkahIncluded || 'No' : 'No'}</td>
                <td style="font-weight: 800;">${formatDateToDMY(data.ziyarat ? data.ziyarat.makkahDate : '')}</td>
              </tr>
              <tr style="background-color: #f9fafb;">
                <td style="font-weight: 900; color: #047857;">Madinah</td>
                <td style="font-weight: 800;">${data.ziyarat ? data.ziyarat.madinahIncluded || 'No' : 'No'}</td>
                <td style="font-weight: 800;">${formatDateToDMY(data.ziyarat ? data.ziyarat.madinahDate : '')}</td>
              </tr>
            </tbody>
          </table>
        </div>

        <!-- 5. TRANSPORT & ROUTE NO CARD -->
        <div class="card">
          <div class="card-header">TRANSPORT & TRANSFER DETAILS</div>
          <div class="card-body">
            <p><strong>Date:</strong> ${data.transport ? formatDateToDMY(data.transport.date) : '-'} &nbsp;|&nbsp; <strong>Company:</strong> ${data.transport ? data.transport.transporter || '-' : '-'}</p>
            <p><strong>Vehicle:</strong> ${data.transport ? data.transport.vehicleType || '-' : '-'}</p>
            <p><strong>Route No:</strong> <span style="font-family: monospace; font-weight: 900; color: #047857;">${data.transport ? data.transport.routeNo || '-' : '-'}</span> &nbsp;|&nbsp; <strong>Transport Route:</strong> ${data.transport ? data.transport.route || '-' : '-'}</p>
          </div>
        </div>

        <!-- 6. HELPLINES & 85px QR CODE STAMP -->
        <div class="helpline-qr-bar">
          <div>
            <div class="helpline-title">24/7 KSA EMERGENCY HELPLINES:</div>
            <div class="helpline-numbers">
              <span>Makkah: <strong style="color: #047857;">${data.helplines ? data.helplines.makkah || '-' : '-'}</strong></span>
              <span>Medina: <strong style="color: #047857;">${data.helplines ? data.helplines.medina || '-' : '-'}</strong></span>
              <span>Transport: <strong style="color: #047857;">${data.helplines ? data.helplines.transport || '-' : '-'}</strong></span>
            </div>
          </div>
          <div class="qr-box">
            ${qrDataUrl ? `<img src="${qrDataUrl}" style="width: 85px; height: 85px; object-fit: contain;" alt="QR Verification">` : ''}
            <div style="font-size: 8.5px; color: #374151; line-height: 1.35;">
              <strong style="color: #047857; display: block; font-size: 9.5px; text-transform: uppercase;">OFFICIAL VERIFIED</strong>
              Scan to verify<br>
              <span style="font-family: monospace; font-weight: 900; color: #111827;">${data.id}</span>
            </div>
          </div>
        </div>
      </div>

      <!-- FOOTER TERMS & CONDITIONS (DUAL URDU & ENGLISH) -->
      <div>
        <div class="terms-grid">
          <div class="terms-box" dir="rtl" style="text-align: right;">
            <div class="terms-title">ضروری ہدایات و شرائط:</div>
            <ul style="padding-right: 12px;">
              ${termsUrduLines || '<li>ہوٹل کیلیے چیک ان 04:00 PM اور چیک آؤٹ 12:00 PM ہے۔</li>'}
            </ul>
          </div>
          <div class="terms-box">
            <div class="terms-title">Terms & Conditions:</div>
            <ul style="padding-left: 12px;">
              ${termsEngLines || '<li>Hotel check-in is 04:00 PM and check-out is 12:00 PM.</li>'}
            </ul>
          </div>
        </div>

        <div class="footer">
          <span>Prepared By: <strong>${formatCreatorName(data.createdBy, data.createdByRole)}</strong></span>
          <span>Generated via Travel Voucher Generator System</span>
          <span>Page 1 of 1</span>
        </div>
      </div>
    </div>
  </body>
  </html>
  `;
}

// 9. POST Generate PDF via Puppeteer (Strict 210mm Native Print Setup)
let puppeteer = null;
try {
  puppeteer = require('puppeteer');
} catch (e) {
  console.warn("Puppeteer is not loaded: ", e.message);
}

app.post('/api/generate-pdf', async (req, res) => {
  if (!puppeteer) {
    return res.status(500).json({ success: false, message: "Puppeteer module not installed on server" });
  }

  let browser = null;
  try {
    const formData = req.body.voucherData || req.body;
    
    const requesterRole = req.headers['x-user-role'] || 'staff_pending';
    const requesterEmail = req.headers['x-user-email'] || 'unknown';
    const hasApprovalRights = (requesterRole === 'admin' || requesterRole === 'staff_approved');

    let status = 'NOT APPROVED';
    let createdBy = requesterEmail;
    let createdByRole = requesterRole;

    if (formData && formData.id) {
      try {
        const { data: existingVoucher } = await supabase
          .from('vouchers')
          .select('status, created_by, form_data')
          .eq('id', formData.id)
          .single();

        if (existingVoucher) {
          if (existingVoucher.created_by) {
            createdBy = existingVoucher.created_by;
            if (existingVoucher.form_data && existingVoucher.form_data.createdByRole) {
              createdByRole = existingVoucher.form_data.createdByRole;
            }
          }
          if (existingVoucher.status === 'APPROVED') {
            status = 'APPROVED';
          }
        }
      } catch (dbErr) {
        console.error("Error checking existing voucher status during generate-pdf:", dbErr.message);
      }
    }

    if (hasApprovalRights) {
      status = 'APPROVED';
    }

    if (formData) {
      formData.status = status;
      formData.createdBy = createdBy;
      formData.createdByRole = createdByRole;
    }

    // Upsert voucher into Supabase vouchers table
    if (formData && formData.id) {
      try {
        await supabase
          .from('vouchers')
          .upsert({
            id: formData.id,
            voucher_ref: formData.voucherRef || formData.id,
            family_head: formData.familyHead,
            package_name: formData.packageName,
            voucher_date: formData.voucherDate,
            status: status,
            created_by: createdBy,
            form_data: formData
          });
      } catch (dbErr) {
        console.error("Supabase upsert during generate-pdf failed:", dbErr.message);
      }
    }
    
    const savedSettings = readJSONFile(SETTINGS_FILE, {});
    const agencySettings = req.body.agencySettings || (savedSettings && savedSettings.agencyName ? savedSettings : {
      agencyName: 'SAUDI PAK GROUP OF TRAVELS',
      tagline: 'Hajj & Umrah Pilgrimage',
      phone1: '03169666666',
      phone2: '+966 50 9876543',
      email: 'saudipakavi@gmail.com',
      website: 'www.saudipak.com.pk',
      address: 'Suite # 6-7, Hajvari Arcade, Kutchery Road, Multan',
      licenseNo: 'DTS-4492'
    });

    // Generate QR Code data URL if needed
    let qrDataUrl = '';
    try {
      if (formData.id) {
        const voucher_ref = formData.voucherRef || formData.id || '';
        const baseUrl = process.env.PUBLIC_APP_URL || 'https://saudipak-vouchers.vercel.app';
        const verifyUrl = `${baseUrl}/verify?voucher=${voucher_ref}`;

        qrDataUrl = await QRCode.toDataURL(verifyUrl, {
          errorCorrectionLevel: 'M',
          margin: 2,
          width: 150,
          color: { dark: '#047857', light: '#ffffff' }
        });
      }
    } catch (e) {
      console.error("QR Code Error:", e);
    }

    const htmlContent = buildSelfContainedPdfHtml(formData, agencySettings, qrDataUrl);

    browser = await puppeteer.launch({
      headless: "new",
      args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage']
    });

    const page = await browser.newPage();
    await page.setContent(htmlContent, { waitUntil: 'networkidle0' });

    const pdfBuffer = await page.pdf({
      format: 'A4',
      printBackground: true,
      preferCSSPageSize: true,
      margin: { top: '0mm', right: '0mm', bottom: '0mm', left: '0mm' }
    });

    await browser.close();
    browser = null;

    const filename = req.body.filename || `Voucher_${formData.id || 'export'}.pdf`;
    const downloadName = filename.endsWith('.pdf') ? filename : `${filename}.pdf`;

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="${downloadName}"`);
    res.setHeader('Content-Length', pdfBuffer.length);
    return res.end(pdfBuffer);

  } catch (error) {
    if (browser) {
      try { await browser.close(); } catch(e) {}
    }
    console.error("PDF Generation Error:", error);
    return res.status(500).json({ error: "Failed to generate PDF", details: error.message });
  }
});

// 10. AUTHENTICATION & ACCESS CONTROL API
app.post('/api/auth/login', async (req, res) => {
  const { email, password } = req.body;
  if (!email || !password) {
    return res.status(400).json({ success: false, message: 'Email and password are required' });
  }

  try {
    const { data, error } = await supabase
      .from('app_users')
      .select('*')
      .eq('email', email.trim().toLowerCase())
      .single();

    if (error || !data) {
      return res.status(401).json({ success: false, message: 'Invalid email or password' });
    }

    if (data.password !== password) {
      return res.status(401).json({ success: false, message: 'Invalid email or password' });
    }

    res.json({
      success: true,
      user: {
        email: data.email,
        role: data.role
      }
    });
  } catch (err) {
    console.error("Auth Login Error:", err.message);
    res.status(500).json({ success: false, message: err.message });
  }
});

app.get('/api/auth/users', async (req, res) => {
  const requesterRole = req.headers['x-user-role'];
  if (requesterRole !== 'admin') {
    return res.status(403).json({ success: false, message: 'Access denied: Admin only' });
  }

  try {
    const { data, error } = await supabase
      .from('app_users')
      .select('id, email, role, created_at')
      .order('email', { ascending: true });

    if (error) throw error;
    res.json({ success: true, users: data });
  } catch (err) {
    console.error("Auth Get Users Error:", err.message);
    res.status(500).json({ success: false, message: err.message });
  }
});

app.post('/api/auth/users', async (req, res) => {
  const requesterRole = req.headers['x-user-role'];
  if (requesterRole !== 'admin') {
    return res.status(403).json({ success: false, message: 'Access denied: Admin only' });
  }

  const { email, password, role } = req.body;
  if (!email || !password || !role) {
    return res.status(400).json({ success: false, message: 'Missing fields' });
  }

  try {
    const { error } = await supabase
      .from('app_users')
      .insert({
        email: email.trim().toLowerCase(),
        password: password,
        role: role
      });

    if (error) throw error;
    res.json({ success: true, message: 'User created successfully' });
  } catch (err) {
    console.error("Auth Create User Error:", err.message);
    res.status(500).json({ success: false, message: err.message });
  }
});

app.delete('/api/auth/users/:id', async (req, res) => {
  const requesterRole = req.headers['x-user-role'];
  if (requesterRole !== 'admin') {
    return res.status(403).json({ success: false, message: 'Access denied: Admin only' });
  }

  const { id } = req.params;
  try {
    const { error } = await supabase
      .from('app_users')
      .delete()
      .eq('id', id);

    if (error) throw error;
    res.json({ success: true, message: 'User deleted successfully' });
  } catch (err) {
    console.error("Auth Delete User Error:", err.message);
    res.status(500).json({ success: false, message: err.message });
  }
});

// 11. POST Approve Voucher
app.post('/api/vouchers/:id/approve', async (req, res) => {
  const { id } = req.params;
  const requesterRole = req.headers['x-user-role'];

  if (requesterRole !== 'admin' && requesterRole !== 'staff_approved') {
    return res.status(403).json({ success: false, message: 'Access denied: Authorization required' });
  }

  try {
    const { data: voucher, error: fetchErr } = await supabase
      .from('vouchers')
      .select('*')
      .eq('id', id)
      .single();

    if (fetchErr || !voucher) {
      return res.status(404).json({ success: false, message: 'Voucher not found' });
    }

    const updatedFormData = { ...(voucher.form_data || {}), status: 'APPROVED' };

    const { error: updateErr } = await supabase
      .from('vouchers')
      .update({
        status: 'APPROVED',
        form_data: updatedFormData
      })
      .eq('id', id);

    if (updateErr) throw updateErr;

    res.json({ success: true, message: `Voucher ${id} approved successfully` });
  } catch (err) {
    console.error("Voucher Approval Error:", err.message);
    res.status(500).json({ success: false, message: err.message });
  }
});

// 12. Public Voucher Verification Route
app.get('/verify', async (req, res) => {
  const voucherId = req.query.voucher;
  if (!voucherId) {
    return res.status(400).send(`
      <!DOCTYPE html>
      <html lang="en">
      <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>Invalid Request | Saudi Pak Travels</title>
        <script src="https://cdn.tailwindcss.com"></script>
        <link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.4.0/css/all.min.css">
      </head>
      <body class="flex items-center justify-center min-h-screen bg-slate-100 p-4">
        <div class="w-full max-w-md bg-white rounded-2xl shadow-xl overflow-hidden border border-slate-100 p-6 text-center space-y-4">
          <div class="w-16 h-16 bg-amber-100 text-amber-600 rounded-full flex items-center justify-center mx-auto">
            <i class="fa-solid fa-triangle-exclamation text-3xl"></i>
          </div>
          <h1 class="text-lg font-black text-slate-800 uppercase tracking-wide">Invalid Request</h1>
          <p class="text-xs text-slate-500 font-semibold">
            Missing voucher query parameter. Please scan a valid voucher QR code.
          </p>
        </div>
      </body>
      </html>
    `);
  }

  try {
    const { data: voucher, error } = await supabase
      .from('vouchers')
      .select('*')
      .or(`id.eq.${voucherId},voucher_ref.eq.${voucherId}`)
      .maybeSingle();

    if (error || !voucher) {
      return res.status(404).send(`
        <!DOCTYPE html>
        <html lang="en">
        <head>
          <meta charset="UTF-8">
          <meta name="viewport" content="width=device-width, initial-scale=1.0">
          <title>Voucher Not Found | Saudi Pak Travels</title>
          <script src="https://cdn.tailwindcss.com"></script>
          <link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.4.0/css/all.min.css">
        </head>
        <body class="flex items-center justify-center min-h-screen bg-slate-100 p-4">
          <div class="w-full max-w-md bg-white rounded-2xl shadow-xl overflow-hidden border border-slate-100 p-6 text-center space-y-4">
            <div class="w-16 h-16 bg-rose-100 text-rose-600 rounded-full flex items-center justify-center mx-auto">
              <i class="fa-solid fa-triangle-exclamation text-3xl"></i>
            </div>
            <h1 class="text-lg font-black text-slate-800 uppercase tracking-wide">Verification Failed</h1>
            <p class="text-xs text-slate-500 font-semibold leading-relaxed">
              The voucher reference <span class="font-mono font-bold text-slate-700">${voucherId}</span> could not be verified in our records.<br>
              Please check the voucher reference number and scan again.
            </p>
            <div class="border-t border-slate-100 pt-4 text-[10px] text-slate-400 font-bold uppercase tracking-wider">
              <i class="fa-solid fa-circle-info text-slate-400 mr-1"></i> Saudi Pak Travels Verification System
            </div>
          </div>
        </body>
        </html>
      `);
    }

    const formData = voucher.form_data || {};
    const isApproved = voucher.status === 'APPROVED';
    const status = voucher.status || 'NOT APPROVED';
    const voucherRef = voucher.voucher_ref || voucher.id;
    const familyHead = voucher.family_head || 'Guest Family';
    const totalPax = formData.totalPax || 1;
    const verificationTime = new Date().toLocaleString('en-US', { timeZone: 'UTC' }) + ' UTC';

    // Extract dates
    let departureDate = '-';
    let returnDate = '-';
    if (formData.flight) {
      departureDate = formData.flight.departureDate || '-';
      returnDate = formData.flight.returnDate || '-';
    }

    // Date formatting helper if not empty
    const formatStrDate = (str) => {
      if (!str || str === '-') return '-';
      const parts = str.split('-');
      if (parts.length === 3) {
        const [year, month, day] = parts;
        return `${day}/${month}/${year}`;
      }
      return str;
    };

    res.send(`
      <!DOCTYPE html>
      <html lang="en">
      <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>Voucher Verification | Saudi Pak Travels</title>
        <script src="https://cdn.tailwindcss.com"></script>
        <link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.4.0/css/all.min.css">
      </head>
      <body class="flex items-center justify-center min-h-screen bg-slate-100 p-4">
        <div class="w-full max-w-md bg-white rounded-2xl shadow-xl overflow-hidden border border-slate-100">
          <!-- Header Branding -->
          <div class="bg-gradient-to-r from-emerald-800 to-teal-800 p-6 text-center text-white relative">
            <div class="absolute top-4 right-4">
              <i class="fa-solid fa-kaaba text-amber-300 text-3xl opacity-20"></i>
            </div>
            <h1 class="text-lg font-black tracking-wider uppercase">Saudi Pak Travels</h1>
            <p class="text-xs text-emerald-100 font-bold mt-1">Official Voucher Verification Service</p>
          </div>

          <!-- Main Content -->
          <div class="p-6 space-y-6">
            
            <!-- Verification Status Badge -->
            <div class="text-center">
              <div class="inline-flex items-center justify-center space-x-2 px-4 py-2 rounded-full font-black text-sm uppercase tracking-wider ${
                isApproved 
                  ? 'bg-emerald-100 text-emerald-800 border border-emerald-300' 
                  : 'bg-rose-100 text-rose-800 border border-rose-300'
              }">
                <i class="fa-solid ${isApproved ? 'fa-circle-check text-emerald-600' : 'fa-circle-xmark text-rose-600'} text-base"></i>
                <span>${status}</span>
              </div>
              <p class="text-[10px] text-slate-400 font-bold mt-2 uppercase tracking-widest">Verification Status</p>
            </div>

            <!-- Voucher Metadata Card -->
            <div class="bg-slate-50 rounded-xl p-4 border border-slate-200/60 space-y-3.5 text-xs font-semibold">
              <div class="flex justify-between border-b border-slate-200/60 pb-2">
                <span class="text-slate-500">Voucher Reference</span>
                <span class="font-mono font-bold text-emerald-800">${voucherRef}</span>
              </div>
              <div class="flex justify-between border-b border-slate-200/60 pb-2">
                <span class="text-slate-500">Family Head Name</span>
                <span class="text-slate-900 font-bold">${familyHead}</span>
              </div>
              <div class="flex justify-between border-b border-slate-200/60 pb-2">
                <span class="text-slate-500">Total Passengers (PAX)</span>
                <span class="text-slate-900 font-bold">${totalPax} PAX</span>
              </div>
              <div class="flex justify-between border-b border-slate-200/60 pb-2">
                <span class="text-slate-500">Departure Date</span>
                <span class="text-slate-900 font-bold">${formatStrDate(departureDate)}</span>
              </div>
              <div class="flex justify-between">
                <span class="text-slate-500">Return Date</span>
                <span class="text-slate-900 font-bold">${formatStrDate(returnDate)}</span>
              </div>
            </div>

            <!-- Trust Stamp -->
            <div class="text-center text-[10px] text-slate-400 font-bold uppercase tracking-wider space-y-1">
              <p><i class="fa-solid fa-shield-halved text-emerald-600 mr-1"></i> Digitally Signed & Verified Record</p>
              <p class="text-[8px] font-normal text-slate-400/80">Timestamp: ${verificationTime}</p>
            </div>
            
          </div>
        </div>
      </body>
      </html>
    `);
  } catch (err) {
    console.error("Verification Route Error:", err.message);
    res.status(500).send("Verification lookup failed.");
  }
});

// Route fallbacks for SPA client-side routes
app.get('/login', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});
app.get('/dashboard', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Catch-all route serving frontend index.html
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Start Server
app.listen(PORT, () => {
  console.log(`=======================================================`);
  console.log(` TRAVEL VOUCHER GENERATOR SERVER RUNNING ON PORT ${PORT} `);
  console.log(` Web App URL: http://localhost:${PORT} `);
  console.log(`=======================================================`);
});
