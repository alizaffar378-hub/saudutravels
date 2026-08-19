require('dotenv').config();
const express = require('express');
const path = require('path');
const fs = require('fs');
const QRCode = require('qrcode');
const { createClient } = require('@supabase/supabase-js');
const WebSocket = require('ws');

const app = express();
const PORT = process.env.PORT || 3000;

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_ANON_KEY, {
  realtime: {
    transport: WebSocket
  }
});

app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));
app.use(express.static(path.join(__dirname, 'public')));

const DATA_DIR = path.join(__dirname, 'data');
const VOUCHERS_FILE = path.join(DATA_DIR, 'vouchers.json');
const SETTINGS_FILE = path.join(DATA_DIR, 'settings.json');
const USER_NAMES_FILE = path.join(DATA_DIR, 'user_names.json');

// Ensure data directory & files exist
if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
if (!fs.existsSync(VOUCHERS_FILE)) fs.writeFileSync(VOUCHERS_FILE, JSON.stringify([]));
if (!fs.existsSync(SETTINGS_FILE)) fs.writeFileSync(SETTINGS_FILE, JSON.stringify({}));
if (!fs.existsSync(USER_NAMES_FILE)) fs.writeFileSync(USER_NAMES_FILE, JSON.stringify({}));

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

const resolveAgentName = (email, role) => {
  if (!email || email === 'unknown') return 'System';
  const parts = (role || '').split(':');
  if (parts[1]) return parts[1].trim();
  
  const nameMap = readJSONFile(USER_NAMES_FILE, {});
  if (nameMap[email.toLowerCase()]) return nameMap[email.toLowerCase()];

  let username = email.split('@')[0];
  return username.charAt(0).toUpperCase() + username.slice(1);
};

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
      createdByRole: (row.form_data && row.form_data.createdByRole) || 'staff_pending',
      bookingAgentName: row.booking_agent_name || (row.form_data && row.form_data.bookingAgentName) || ''
    }));

    res.json({ success: true, vouchers });
  } catch (err) {
    console.error("Supabase GET Error:", err.message);
    res.status(500).json({ success: false, message: err.message });
  }
});

// 4. POST Voucher (Create or Update)
app.post('/api/vouchers', async (req, res) => {
  const formData = req.body;
  if (!formData.id) {
    return res.status(400).json({ success: false, message: 'Voucher ID is required' });
  }

  const requesterRole = req.headers['x-user-role'] || 'staff_pending';
  const requesterEmail = req.headers['x-user-email'] || 'unknown';
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
  } catch (e) {
    // Keep it new if it doesn't exist
  }

  if (hasApprovalRights) {
    status = 'APPROVED';
  }

  const isReqAdmin = (requesterRole.split(':')[0] === 'admin');
  let bookingAgentName = formData.bookingAgentName;
  if (!isReqAdmin) {
    bookingAgentName = resolveAgentName(requesterEmail, requesterRole);
  }

  const updatedFormData = { 
    ...formData, 
    status, 
    createdBy, 
    createdByRole,
    bookingAgentName
  };

  try {
    const payload = {
      id: formData.id,
      voucher_ref: formData.voucherRef || formData.id,
      family_head: formData.familyHead,
      package_name: formData.packageName,
      voucher_date: formData.voucherDate,
      status: status,
      created_by: createdBy,
      form_data: updatedFormData
    };

    const { error } = await supabase
      .from('vouchers')
      .upsert({
        ...payload,
        booking_agent_name: bookingAgentName || null
      });

    if (error) {
      if (error.message.includes('booking_agent_name') || error.code === 'P0002' || error.message.includes('does not exist')) {
        console.warn("booking_agent_name column does not exist in DB yet, falling back to saving in form_data JSON");
        const { error: fallbackError } = await supabase
          .from('vouchers')
          .upsert(payload);
        if (fallbackError) throw fallbackError;
      } else {
        throw error;
      }
    }

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
function buildSelfContainedPdfHtml(data, agencySettings, qrDataUrl, baseUrl, isWebView = false) {
  let calculatedPackageDays = 0;
  if (data.flight && data.flight.departureDate && data.flight.returnDate) {
    const depDate = new Date(data.flight.departureDate);
    const retDate = new Date(data.flight.returnDate);
    if (!isNaN(depDate) && !isNaN(retDate)) {
      const timeDiff = retDate - depDate;
      calculatedPackageDays = Math.max(0, Math.ceil(timeDiff / (1000 * 3600 * 24))) + 1;
    }
  }

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
    
    const parts = (role || '').split(':');
    const baseRole = parts[0];
    const fullName = parts[1] || '';

    let roleDisplay = '';
    if (baseRole === 'admin') roleDisplay = 'Admin';
    else if (baseRole === 'staff_approved') roleDisplay = 'Staff - Approved';
    else if (baseRole === 'staff_pending') roleDisplay = 'Staff - Pending';

    if (fullName) {
      return `${fullName} (${roleDisplay || baseRole})`;
    }

    let username = email.split('@')[0];
    username = username.charAt(0).toUpperCase() + username.slice(1);
    
    return `${username} (${roleDisplay || baseRole || role})`;
  };

  // 1. Passenger Basic Details Table Rows
  const passBasicRowsHtml = (data.passengers || []).map((p, idx) => `
    <tr style="${idx % 2 === 1 ? 'background-color: #f9fafb;' : 'background-color: #ffffff;'}">
      <td data-label="Sr." style="text-align: center; font-weight: bold; color: #111827;">${idx + 1}</td>
      <td data-label="Passport No" style="font-weight: bold; color: #111827;">${p.passportNo || '-'}</td>
      <td data-label="Passenger Name" style="font-weight: 800; color: #065f46;">${p.name || '-'}</td>
      <td data-label="Gender" style="text-align: center; font-weight: bold; color: #111827;">${p.gender || '-'}</td>
      <td data-label="Type" style="text-align: center;"><span style="background: #e0f2fe; color: #0369a1; padding: 1px 4px; border-radius: 2px; font-size: 8.5px; font-weight: 800;">${p.type || '-'}</span></td>
    </tr>
  `).join('');

  // 2. Visa & MOFA Details Table Rows
  const passVisaRowsHtml = (data.passengers || []).map((p, idx) => `
    <tr style="${idx % 2 === 1 ? 'background-color: #f9fafb;' : 'background-color: #ffffff;'}">
      <td data-label="Sr." style="text-align: center; font-weight: bold; color: #111827;">${idx + 1}</td>
      <td data-label="Passenger Name" style="font-weight: 800; color: #111827;">${p.name || '-'}</td>
      <td data-label="MOFA No" style="font-weight: bold; color: #111827;">${p.mofaNo || '-'}</td>
      <td data-label="Group No" style="font-weight: bold; color: #111827;">${p.groupNo || '-'}</td>
      <td data-label="Visa No" style="font-weight: bold; color: #111827;">${p.visaNo || '-'}</td>
      <td data-label="PNR" style="font-weight: 800; font-family: monospace; color: #047857;">${p.pnr || '-'}</td>
    </tr>
  `).join('');

  // 3. Hotel Rows
  const hotelRowsHtml = (data.hotels || []).map((h, idx) => `
    <tr style="${idx % 2 === 1 ? 'background-color: #f9fafb;' : 'background-color: #ffffff;'}">
      <td data-label="City" style="font-weight: 800; color: #047857;">${h.city || '-'}</td>
      <td data-label="Hotel Name" style="font-weight: 800; color: #111827;">${h.hotelName || '-'}</td>
      <td data-label="Room Type" style="font-weight: bold; color: #1f2937;">${h.roomType || '-'}</td>
      <td data-label="Meal Plan" style="font-weight: bold; color: #1f2937;">${h.mealPlan || '-'}</td>
      <td data-label="Check In" style="font-weight: bold; color: #111827;">${formatDateToDMY(h.checkIn)}</td>
      <td data-label="Check Out" style="font-weight: bold; color: #111827;">${formatDateToDMY(h.checkOut)}</td>
      <td data-label="Bed" style="font-weight: bold; color: #111827; text-align: center;">${h.bed || '-'}</td>
      <td data-label="Nights" style="text-align: center; font-weight: 800; color: #047857; background-color: #ecfdf5;">${h.totalNights || 0} Nts</td>
    </tr>
  `).join('');

  const termsUrduLines = (data.termsUrdu || '').split('\n').filter(l => l.trim()).map(l => `<li style="margin-bottom: 2px;">${l}</li>`).join('');
  const termsEngLines = (data.termsEnglish || '').split('\n').filter(l => l.trim()).map(l => `<li style="margin-bottom: 2px;">${l}</li>`).join('');

  const showMakkah = data.ziyarat && data.ziyarat.makkahIncluded === 'Yes';
  const showMadinah = data.ziyarat && data.ziyarat.madinahIncluded === 'Yes';
  const showZiyaratSection = data.showZiyaratDetails && (showMakkah || showMadinah);

  let ziyaratRowsHtml = '';
  if (showMakkah) {
    ziyaratRowsHtml += `
      <tr>
        <td data-label="City" style="font-weight: 900; color: #047857;">Makkah</td>
        <td data-label="Ziyarat Included" style="font-weight: 800;">Yes</td>
        <td data-label="Date" style="font-weight: 800;">${formatDateToDMY(data.ziyarat.makkahDate)}</td>
      </tr>
    `;
  }
  if (showMadinah) {
    ziyaratRowsHtml += `
      <tr style="${showMakkah ? 'background-color: #f9fafb;' : ''}">
        <td data-label="City" style="font-weight: 900; color: #047857;">Madinah</td>
        <td data-label="Ziyarat Included" style="font-weight: 800;">Yes</td>
        <td data-label="Date" style="font-weight: 800;">${formatDateToDMY(data.ziyarat.madinahDate)}</td>
      </tr>
    `;
  }

  let letterheadLogoHtml = '';
  if (agencySettings.logo && (agencySettings.logo.startsWith('data:image') || agencySettings.logo.startsWith('http') || agencySettings.logo.includes('/'))) {
    letterheadLogoHtml = `<img src="${agencySettings.logo}" style="max-height: 80px; max-width: 200px; object-fit: contain; margin-bottom: 2px;" alt="Logo">`;
  } else {
    letterheadLogoHtml = `<i class="fa-solid fa-kaaba" style="color: #047857; font-size: 40px; margin-bottom: 4px;"></i>`;
  }

  return `
  <!DOCTYPE html>
  <html lang="en">
  <head>
    <meta charset="UTF-8">
    <meta name="viewport" content="${isWebView ? 'width=device-width, initial-scale=1.0' : 'width=794, initial-scale=1.0'}">
    <link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.4.0/css/all.min.css">
    ${baseUrl ? `<base href="${baseUrl}/">` : ''}
    <style>
      @import url('https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@300;400;500;600;700;800&family=Noto+Naskh+Arabic:wght@400;600;700&display=swap');
      @page {
        size: A4 portrait;
        margin: 0;
      }
      * {
        box-sizing: border-box !important;
        margin: 0;
        padding: 0;
        font-family: 'Plus Jakarta Sans', Arial, Helvetica, sans-serif !important;
      }
      .font-arabic, [dir="rtl"], [dir="rtl"] * {
        font-family: 'Noto Naskh Arabic', 'Times New Roman', serif !important;
      }
      html, body {
        width: ${isWebView ? '100% !important; max-width: 100%' : '794px'} !important;
        height: auto !important;
        margin: 0 auto !important;
        padding: 0 !important;
        background: ${isWebView ? '#f1f5f9' : '#ffffff'} !important;
        color: #111827 !important;
        font-size: 12px !important;
        line-height: 1.35 !important;
        -webkit-print-color-adjust: exact !important;
        print-color-adjust: exact !important;
        overflow: visible !important;
      }
      
      .pdf-container, .voucher-container {
        position: relative !important;
        width: ${isWebView ? '100% !important; max-width: 800px' : '794px'} !important;
        min-height: ${isWebView ? 'auto' : '1123px'} !important;
        height: auto !important;
        box-sizing: border-box !important;
        padding: 20px !important;
        margin: ${isWebView ? '20px auto' : '0 auto'} !important;
        background: #ffffff !important;
        overflow: visible !important;
        page-break-after: auto !important;
        page-break-before: auto !important;
        page-break-inside: auto !important;
        display: flex !important;
        flex-direction: column !important;
        justify-content: space-between !important;
        ${isWebView ? 'border-radius: 12px !important; box-shadow: 0 10px 15px -3px rgba(0,0,0,0.1), 0 4px 6px -2px rgba(0,0,0,0.05) !important; border: 1px solid #e2e8f0 !important;' : ''}
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
        z-index: 0 !important;
        opacity: 0.08 !important;
      }
      
      .header { display: flex; flex-direction: column; align-items: center; justify-content: center; text-align: center; padding-bottom: 8px; border-bottom: 2px solid #047857; margin-bottom: 8px; width: 100%; position: relative; }
      .brand-title { font-size: 13.5px; font-weight: 900; color: #047857; text-transform: uppercase; margin-top: 2px; line-height: 1.25; }
      .brand-tagline { font-size: 9.5px; color: #374151; font-weight: bold; margin-top: 1px; }
      .company-info { display: flex; flex-wrap: wrap; align-items: center; justify-content: center; gap: 4px 15px; font-size: 9px; color: #1f2937; font-weight: bold; width: 100%; border-top: 1px solid #e5e7eb; padding-top: 6px; margin-top: 4px; }
      
      .banner { background-color: #047857; color: white; padding: 6px 10px; font-weight: 900; border-radius: 4px; display: flex; justify-content: space-between; align-items: center; margin-bottom: 8px; font-size: 11px; }
      .banner-ref { color: #fef08a; font-family: monospace; font-size: 12px; font-weight: bold; }
      
      .info-grid { display: flex; gap: 8px; background-color: #f0fdf4; border: 1.5px solid #a7f3d0; padding: 6px 10px; border-radius: 4px; margin-bottom: 8px; font-size: 10px; }
      .info-item { flex: 1; }
      .info-label { display: block; font-size: 8px; text-transform: uppercase; color: #4b5563; font-weight: 800; margin-bottom: 2px; }
      .info-value { font-weight: 900; color: #111827; font-size: 11px; }
      
      table { width: 100%; border-collapse: collapse; margin-bottom: 8px; font-size: 9.5px; table-layout: fixed; }
      th { background-color: #f3f4f6; color: #111827; text-align: left; padding: 4px 6px; font-weight: 800; border: 1px solid #9ca3af; font-size: 8.5px; text-transform: uppercase; }
      td { padding: 4px 6px; border: 1px solid #d1d5db; word-wrap: break-word !important; word-break: break-word !important; white-space: normal !important; font-size: 9.5px; color: #111827; }
      
      tr {
        page-break-inside: avoid !important;
        break-inside: avoid !important;
      }
      thead {
        display: table-header-group !important;
      }
      .card, table, .info-grid {
        page-break-inside: avoid !important;
        break-inside: avoid !important;
      }
      
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
      
      @media (max-width: 767px) {
        .pdf-container, .voucher-container {
          width: 100% !important;
          max-width: 100% !important;
          margin: 0 auto !important;
          padding: 10px !important;
          border-radius: 8px !important;
          border: none !important;
          box-shadow: none !important;
        }
        .header {
          display: flex !important;
          flex-direction: column !important;
          align-items: center !important;
          gap: 12px !important;
          padding-bottom: 12px !important;
        }
        .booking-agent-header, .qr-header-box {
          position: static !important;
          width: 100% !important;
          max-width: 320px !important;
          margin: 0 auto !important;
          display: flex !important;
          justify-content: center !important;
          align-items: center !important;
          text-align: center !important;
        }
        .booking-agent-header {
          flex-direction: column !important;
          padding: 6px 12px !important;
          order: 2 !important;
        }
        .qr-header-box {
          flex-direction: row !important;
          padding: 6px 12px !important;
          justify-content: center !important;
          order: 3 !important;
        }
        .brand-info {
          order: 1 !important;
        }
        .banner {
          flex-direction: column !important;
          align-items: center !important;
          gap: 4px !important;
          text-align: center !important;
        }
        .banner > div {
          display: flex !important;
          flex-wrap: wrap !important;
          justify-content: center !important;
          gap: 8px !important;
        }
        .banner > div > span {
          margin-left: 0 !important;
        }
        .info-grid {
          display: grid !important;
          grid-template-columns: repeat(2, 1fr) !important;
          gap: 8px !important;
        }
        .info-grid > div:last-child {
          grid-column: span 2 !important;
        }
        
        table, thead, tbody, th, td, tr {
          display: block !important;
          width: 100% !important;
        }
        thead {
          display: none !important;
        }
        tr {
          margin-bottom: 10px !important;
          border: 1px solid #cbd5e1 !important;
          border-radius: 6px !important;
          background-color: #ffffff !important;
          padding: 6px !important;
          overflow: hidden !important;
          box-shadow: 0 1px 2px 0 rgba(0,0,0,0.05) !important;
        }
        tr:nth-child(even) {
          background-color: #f8fafc !important;
        }
        td {
          border: none !important;
          border-bottom: 1px solid #f1f5f9 !important;
          position: relative !important;
          padding: 6px 8px 6px 45% !important;
          text-align: right !important;
          font-size: 10px !important;
          display: flex !important;
          justify-content: flex-end !important;
          align-items: center !important;
          min-height: 28px !important;
        }
        td:last-child {
          border-bottom: none !important;
        }
        td::before {
          content: attr(data-label) !important;
          position: absolute !important;
          left: 8px !important;
          width: 40% !important;
          text-align: left !important;
          font-weight: 800 !important;
          color: #047857 !important;
          text-transform: uppercase !important;
          font-size: 8px !important;
          white-space: nowrap !important;
          overflow: hidden !important;
          text-overflow: ellipsis !important;
        }
        td[colspan] {
          padding-left: 8px !important;
          text-align: center !important;
          justify-content: center !important;
        }
        td[colspan]::before {
          display: none !important;
        }
        .terms-grid {
          flex-direction: column !important;
          gap: 8px !important;
        }
        .footer {
          flex-direction: column !important;
          gap: 4px !important;
          text-align: center !important;
        }
        /* Mobile Watermark overrides */
        .watermark-overlay {
          width: 90% !important;
          opacity: 0.05 !important;
        }
        .watermark-overlay > div {
          font-size: 28pt !important;
          border-width: 4px !important;
          padding: 6px 12px !important;
          letter-spacing: 2px !important;
        }
      }
    </style>
  </head>
  <body>
    ${isWebView ? `
      <div style="background-color: #065f46; color: white; padding: 12px 20px; font-weight: 800; text-align: center; font-size: 13px; text-transform: uppercase; letter-spacing: 1px; display: flex; justify-content: center; align-items: center; gap: 8px; border-bottom: 3px solid #047857; font-family: 'Plus Jakarta Sans', sans-serif;">
        <svg style="width: 16px; height: 16px; fill: #fef08a;" viewBox="0 0 24 24">
          <path d="M12 2C6.5 2 2 6.5 2 12s4.5 10 10 10 10-4.5 10-10S17.5 2 12 2zm-2 15l-5-5 1.41-1.41L10 14.17l7.59-7.59L19 8l-9 9z"/>
        </svg>
        <span>VERIFIED OFFICIAL VOUCHER - SAUDI PAK TRAVELS</span>
      </div>
    ` : ''}
    <div class="voucher-container">
      <div class="watermark-overlay" style="color: ${data.status === 'APPROVED' ? '#00875A' : '#EF4444'} !important;">
        <div style="font-family: 'Impact', 'Arial Black', 'Arial', sans-serif !important; font-size: ${data.status === 'APPROVED' ? '85pt' : '70pt'} !important; font-weight: 950 !important; border: 8px double currentColor !important; padding: 15px 40px !important; border-radius: 12px !important; letter-spacing: 6px !important; white-space: nowrap !important; line-height: 1.1 !important; text-transform: uppercase !important; display: inline-block !important;">
          ${data.status === 'APPROVED' ? 'APPROVED' : 'NOT APPROVED'}
        </div>
      </div>
      <div>
        <div class="header">
          <!-- Booking Agent Badge on the Top Left -->
          <div class="booking-agent-header" style="position: absolute; left: 0; top: 4px; text-align: left; font-size: 9px; color: #111827; background-color: #f0fdf4; border: 1px solid #a7f3d0; padding: 10px 18px; border-radius: 4px; line-height: 1.3;">
            <span style="display: block; font-size: 11px; text-transform: uppercase; color: #047857; font-weight: 800; letter-spacing: 0.5px;">Booking By</span>
            <strong style="color: #065f46; font-weight: 900; font-size: 16.5px;">${data.bookingAgentName || '-'}</strong>
          </div>
          <!-- QR Code Badge on the Top Right -->
          <div class="qr-header-box" style="position: absolute; right: 0; top: 4px; display: flex; align-items: center; gap: 10px; background-color: #ffffff; border: 1px solid #d1d5db; padding: 8px 12px; border-radius: 4px; line-height: 1.25;">
            ${qrDataUrl ? `<img src="${qrDataUrl}" style="width: 72px; height: 72px; object-fit: contain;" alt="QR Verification">` : ''}
            <div style="font-size: 9px; color: #374151; text-align: left;">
              <strong style="color: #047857; display: block; font-size: 10.5px; text-transform: uppercase; font-weight: 800;">VERIFIED</strong>
              Scan to verify<br>
              <span style="font-family: monospace; font-weight: 900; color: #111827; font-size: 9px;">${data.id}</span>
            </div>
          </div>
          <div class="brand-info" style="display: flex; flex-direction: column; align-items: center;">
            ${letterheadLogoHtml}
            <div class="brand-title">${agencySettings.agencyName || 'SAUDI PAK GROUP OF TRAVELS'}</div>
            <div class="brand-tagline">${agencySettings.tagline || 'Official Services Voucher'}</div>
            ${agencySettings.licenseNo ? `<div style="font-size: 8.5px; color: #047857; font-weight: 800; margin-top: 2px;">Lic / IATA: ${agencySettings.licenseNo}</div>` : ''}
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
            <span class="info-value" style="display: block; font-weight: 900; color: #111827; font-size: 11px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">${data.familyHead}</span>
          </div>
          <div class="info-item">
            <span class="info-label">Package Name</span>
            <span class="info-value" style="display: block; font-weight: 900; color: #047857; font-size: 11px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">${data.packageName}</span>
          </div>
          <div class="info-item">
            <span class="info-label">PAX Breakdown</span>
            <span class="info-value" style="display: block; font-weight: 900; color: #111827; font-size: 10px;">${data.adultsCount || 0} Adults, ${data.childrenCount || 0} Child, ${data.infantsCount || 0} Inf</span>
          </div>
          <div class="info-item" style="text-align: center;">
            <span class="info-label" style="text-align: center;">Total PAX</span>
            <span class="info-value" style="display: inline-block; background: #047857; color: white; padding: 2px 6px; border-radius: 3px; font-size: 9.5px; font-weight: 900;">${data.totalPax} Person(s)</span>
          </div>
          <div class="info-item" style="text-align: center;">
            <span class="info-label" style="text-align: center;">Total Package Days</span>
            <span class="info-value" style="display: inline-block; background: #065f46; color: white; padding: 2px 6px; border-radius: 3px; font-size: 9.5px; font-weight: 950; margin-top: 2px;">${calculatedPackageDays > 0 ? calculatedPackageDays + ' Days' : '-'}</span>
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
                <th style="width: 50%;">Passenger Name</th>
                <th style="width: 12%; text-align: center;">Gender</th>
                <th style="width: 13%; text-align: center;">Type</th>
              </tr>
            </thead>
            <tbody>
              ${passBasicRowsHtml || '<tr><td colspan="5" style="text-align:center; font-weight: bold;">No passenger details listed</td></tr>'}
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
                <th style="width: 12%;">City</th>
                <th style="width: 23%;">Hotel Name</th>
                <th style="width: 14%;">Room Type</th>
                <th style="width: 13%;">Meal Plan</th>
                <th style="width: 11%;">Check-In</th>
                <th style="width: 11%;">Check-Out</th>
                <th style="width: 10%; text-align: center;">Bed Type</th>
                <th style="width: 6%; text-align: center;">Nights</th>
              </tr>
            </thead>
            <tbody>
              ${hotelRowsHtml || '<tr><td colspan="8" style="text-align:center; font-weight: bold;">No accommodation details listed</td></tr>'}
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
                <th style="width: 10%;">Sector</th>
                <th style="width: 18%;">Airline</th>
                <th style="width: 12%;">Flight No</th>
                <th style="width: 14%;">Route</th>
                <th style="width: 14%;">Date</th>
                <th style="width: 16%; text-align: center;">Departure Time</th>
                <th style="width: 16%; text-align: center;">Arrival Time</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td data-label="Flight Type" style="font-weight: 900; color: #047857;">Departure</td>
                <td data-label="Airline" style="font-weight: 800;">${data.flight ? data.flight.departureAirline || '-' : '-'}</td>
                <td data-label="Flight No" style="font-weight: 900; font-family: monospace;">${data.flight ? data.flight.departureFlightNo || '-' : '-'}</td>
                <td data-label="Route" style="font-weight: 900; color: #065f46;">${data.flight ? data.flight.departureRoute || '-' : '-'}</td>
                <td data-label="Date" style="font-weight: 800;">${formatDateToDMY(data.flight ? data.flight.departureDate : '')}</td>
                <td data-label="Dep. Time" style="font-weight: 800; text-align: center;">${data.flight ? data.flight.departureTime || '-' : '-'}</td>
                <td data-label="Arrival Time" style="font-weight: 800; text-align: center;">${data.flight ? data.flight.departureArrivalTime || '-' : '-'}</td>
              </tr>
              <tr style="background-color: #f9fafb;">
                <td data-label="Flight Type" style="font-weight: 900; color: #047857;">Return</td>
                <td data-label="Airline" style="font-weight: 800;">${data.flight ? data.flight.returnAirline || '-' : '-'}</td>
                <td data-label="Flight No" style="font-weight: 900; font-family: monospace;">${data.flight ? data.flight.returnFlightNo || '-' : '-'}</td>
                <td data-label="Route" style="font-weight: 900; color: #065f46;">${data.flight ? data.flight.returnRoute || '-' : '-'}</td>
                <td data-label="Date" style="font-weight: 800;">${formatDateToDMY(data.flight ? data.flight.returnDate : '')}</td>
                <td data-label="Dep. Time" style="font-weight: 800; text-align: center;">${data.flight ? data.flight.returnTime || '-' : '-'}</td>
                <td data-label="Arrival Time" style="font-weight: 800; text-align: center;">${data.flight ? data.flight.returnArrivalTime || '-' : '-'}</td>
              </tr>
            </tbody>
          </table>
        </div>

        ${showZiyaratSection ? `
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
              ${ziyaratRowsHtml}
            </tbody>
          </table>
        </div>` : ''}

        <!-- 5. TRANSPORT & TRANSFER DETAILS TABLE -->
        <div style="margin-bottom: 8px;">
          <div class="section-title" style="background-color: #047857;">
            <span>TRANSPORT & TRANSFER DETAILS</span>
          </div>
          <table>
            <thead>
              <tr>
                <th style="width: 14%;">Date</th>
                <th style="width: 20%;">Company</th>
                <th style="width: 22%;">Vehicle</th>
                <th style="width: 16%;">Route No</th>
                <th style="width: 28%;">Transport Route</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td data-label="Date" style="font-weight: 800; color: #111827;">${data.transport ? formatDateToDMY(data.transport.date) : '-'}</td>
                <td data-label="Company" style="font-weight: 800; color: #111827;">${data.transport ? data.transport.transporter || '-' : '-'}</td>
                <td data-label="Vehicle" style="font-weight: 800; color: #111827;">${data.transport ? data.transport.vehicleType || '-' : '-'}</td>
                <td data-label="Route No" style="font-weight: 900; color: #047857; font-family: monospace;">${data.transport ? data.transport.routeNo || '-' : '-'}</td>
                <td data-label="Transport Route" style="font-weight: 800; color: #111827;">${data.transport ? data.transport.route || '-' : '-'}</td>
              </tr>
            </tbody>
          </table>
        </div>

        <!-- 6. HELPLINES -->
        <div class="helpline-qr-bar">
          <div>
            <div class="helpline-title">24/7 KSA EMERGENCY HELPLINES:</div>
            <div class="helpline-numbers" style="display: flex; gap: 20px;">
              <span>Makkah: <strong style="color: #047857;">${data.helplines ? data.helplines.makkah || '-' : '-'}</strong></span>
              <span>Medina: <strong style="color: #047857;">${data.helplines ? data.helplines.medina || '-' : '-'}</strong></span>
              <span>Transport: <strong style="color: #047857;">${data.helplines ? data.helplines.transport || '-' : '-'}</strong></span>
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

        <!-- Contacts Bar in Footer -->
        <div class="company-info-footer" style="display: flex; flex-wrap: wrap; align-items: center; justify-content: center; gap: 4px 15px; font-size: 9px; color: #1f2937; font-weight: bold; width: 100%; border-top: 1px solid #e5e7eb; border-bottom: 1px solid #e5e7eb; padding: 4px 0; margin-top: 6px; margin-bottom: 6px;">
          ${agencySettings.phone1 || agencySettings.phone2 ? `<span><i class="fa-solid fa-phone" style="color: #047857; margin-right: 4px;"></i>${agencySettings.phone1 || ''}${agencySettings.phone2 ? ' | ' + agencySettings.phone2 : ''}</span>` : ''}
          ${agencySettings.email ? `<span><i class="fa-solid fa-envelope" style="color: #047857; margin-right: 4px;"></i>${agencySettings.email}</span>` : ''}
          ${agencySettings.website ? `<span><i class="fa-solid fa-globe" style="color: #047857; margin-right: 4px;"></i>${agencySettings.website}</span>` : ''}
          ${agencySettings.address ? `<span><i class="fa-solid fa-location-dot" style="color: #047857; margin-right: 4px;"></i>${agencySettings.address}</span>` : ''}
        </div>

        <div class="footer" style="border-top: none; padding-top: 0;">
          <span>Prepared By: <strong>${data.agentName || formatCreatorName(data.createdBy, data.createdByRole)}</strong></span>
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
const isProduction = process.env.NODE_ENV === 'production' || process.env.VERCEL;

let puppeteerCore = null;
async function loadPuppeteerCore() {
  if (puppeteerCore) return puppeteerCore;
  try {
    const mod = await import('puppeteer-core');
    puppeteerCore = mod.default || mod;
    return puppeteerCore;
  } catch (e) {
    console.warn("puppeteer-core is not loaded: ", e.message);
    return null;
  }
}


function getLocalChromePath() {
  const fs = require('fs');
  const path = require('path');
  
  const winPaths = [
    'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
    'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
    path.join(process.env.LOCALAPPDATA || '', 'Google\\Chrome\\Application\\chrome.exe'),
    'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
    'C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe'
  ];
  
  for (const p of winPaths) {
    if (fs.existsSync(p)) return p;
  }
  
  const macPaths = [
    '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
    '/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge'
  ];
  for (const p of macPaths) {
    if (fs.existsSync(p)) return p;
  }
  
  const linuxPaths = [
    '/usr/bin/google-chrome',
    '/usr/bin/chromium',
    '/usr/bin/chromium-browser'
  ];
  for (const p of linuxPaths) {
    if (fs.existsSync(p)) return p;
  }
  
  return null;
}

app.post('/api/generate-pdf', async (req, res) => {
  let hasPuppeteer = false;
  let localPuppeteer = null;

  const core = await loadPuppeteerCore();

  try {
    const pLib = 'puppeteer';
    localPuppeteer = require(pLib);
    hasPuppeteer = true;
  } catch (_) {}
  if (core) {
    hasPuppeteer = true;
  }

  if (!hasPuppeteer) {
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
      
      const isReqAdmin = (requesterRole.split(':')[0] === 'admin');
      if (!isReqAdmin) {
        formData.bookingAgentName = resolveAgentName(requesterEmail, requesterRole);
      }
    }

    // Upsert voucher into Supabase vouchers table
    if (formData && formData.id) {
      try {
        const payload = {
          id: formData.id,
          voucher_ref: formData.voucherRef || formData.id,
          family_head: formData.familyHead,
          package_name: formData.packageName,
          voucher_date: formData.voucherDate,
          status: status,
          created_by: createdBy,
          form_data: formData
        };

        const { error } = await supabase
          .from('vouchers')
          .upsert({
            ...payload,
            booking_agent_name: formData.bookingAgentName || null
          });

        if (error) {
          // Fallback if booking_agent_name column does not exist yet
          if (error.message.includes('booking_agent_name') || error.code === 'P0002' || error.message.includes('does not exist')) {
            console.warn("booking_agent_name column does not exist in DB yet, falling back to saving in form_data JSON");
            await supabase.from('vouchers').upsert(payload);
          } else {
            throw error;
          }
        }
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
        const protocol = req.headers['x-forwarded-proto'] || req.protocol || 'http';
        const host = req.headers.host;
        const baseUrl = process.env.PUBLIC_APP_URL || `${protocol}://${host}`;
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

    const protocol = req.headers['x-forwarded-proto'] || req.protocol || 'http';
    const host = req.headers['x-forwarded-host'] || req.get('host') || 'localhost:3000';
    const baseUrl = `${protocol}://${host}`;

    const htmlContent = buildSelfContainedPdfHtml(formData, agencySettings, qrDataUrl, baseUrl);

    if (isProduction) {
      if (!process.env.BROWSERLESS_TOKEN) {
        throw new Error("BROWSERLESS_TOKEN environment variable is not set");
      }
      browser = await core.connect({
        browserWSEndpoint: `wss://chrome.browserless.io?token=${process.env.BROWSERLESS_TOKEN}`
      });
    } else {
      if (localPuppeteer) {
        browser = await localPuppeteer.launch({
          headless: "new",
          args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage']
        });
      } else if (core) {
        const localChromePath = getLocalChromePath();
        browser = await core.launch({
          headless: "new",
          args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage'],
          executablePath: localChromePath || undefined
        });
      } else {
        throw new Error("No browser launcher is available");
      }
    }

    const page = await browser.newPage();
    
    // Set viewport to standard A4 resolution at 96 dpi (794x1123)
    await page.setViewport({ width: 794, height: 1123, deviceScaleFactor: 2 });

    try {
      // Use 8 seconds timeout to prevent serverless execution freeze on slow external assets
      await page.setContent(htmlContent, { waitUntil: 'networkidle0', timeout: 8000 });
      // Robust wait for all web fonts (such as Google Fonts) to be fully loaded and parsed
      await page.evaluateHandle('document.fonts.ready');
    } catch (setErr) {
      console.warn("Puppeteer page load timeout or font loading warning:", setErr.message);
    }

    const pdfBuffer = await page.pdf({
      format: 'A4',
      printBackground: true,
      preferCSSPageSize: true,
      margin: { top: '0mm', right: '0mm', bottom: '0mm', left: '0mm' }
    });

    if (isProduction) {
      await browser.disconnect();
    } else {
      await browser.close();
    }
    browser = null;

    const filename = req.body.filename || `Voucher_${formData.id || 'export'}.pdf`;
    const downloadName = filename.endsWith('.pdf') ? filename : `${filename}.pdf`;

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="${downloadName}"`);
    res.setHeader('Content-Length', pdfBuffer.length);
    return res.end(pdfBuffer);

  } catch (error) {
    if (browser) {
      try {
        if (isProduction) {
          await browser.disconnect();
        } else {
          await browser.close();
        }
      } catch(e) {}
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

    const nameMap = readJSONFile(USER_NAMES_FILE, {});
    const fullName = nameMap[data.email.toLowerCase()] || '';

    res.json({
      success: true,
      user: {
        email: data.email,
        role: data.role,
        fullName: fullName
      }
    });
  } catch (err) {
    console.error("Auth Login Error:", err.message);
    res.status(500).json({ success: false, message: err.message });
  }
});

app.get('/api/booking-agents', async (req, res) => {
  try {
    const { data, error } = await supabase
      .from('app_users')
      .select('email, role')
      .order('email', { ascending: true });

    if (error) throw error;

    const nameMap = readJSONFile(USER_NAMES_FILE, {});
    const agents = (data || [])
      .filter(u => {
        const r = u.role || '';
        return r === 'admin' || r.startsWith('staff_approved');
      })
      .map(u => {
        const parts = u.role.split(':');
        const fullName = parts[1] || nameMap[u.email.toLowerCase()] || u.email.split('@')[0];
        return {
          email: u.email,
          name: fullName
        };
      });

    res.json({ success: true, agents });
  } catch (err) {
    console.error("Booking Agents fetch error:", err.message);
    res.status(500).json({ success: false, message: err.message });
  }
});

app.get('/api/auth/users', async (req, res) => {
  const requesterRole = req.headers['x-user-role'] || '';
  if (requesterRole !== 'admin') {
    return res.status(403).json({ success: false, message: 'Access denied: Admin only' });
  }

  try {
    const { data, error } = await supabase
      .from('app_users')
      .select('id, email, role, created_at')
      .order('email', { ascending: true });

    if (error) throw error;

    // Merge names locally
    const nameMap = readJSONFile(USER_NAMES_FILE, {});
    const usersWithNames = data.map(u => ({
      ...u,
      fullName: nameMap[u.email.toLowerCase()] || ''
    }));

    res.json({ success: true, users: usersWithNames });
  } catch (err) {
    console.error("Auth Get Users Error:", err.message);
    res.status(500).json({ success: false, message: err.message });
  }
});

app.post('/api/auth/users', async (req, res) => {
  const requesterRole = req.headers['x-user-role'] || '';
  if (requesterRole !== 'admin') {
    return res.status(403).json({ success: false, message: 'Access denied: Admin only' });
  }

  const { email, password, role, fullName } = req.body;
  if (!email || !password || !role) {
    return res.status(400).json({ success: false, message: 'Missing fields' });
  }

  try {
    // Insert into DB with clean role (satisfies database check constraints)
    const { error } = await supabase
      .from('app_users')
      .insert({
        email: email.trim().toLowerCase(),
        password: password,
        role: role
      });

    if (error) throw error;

    // Save name mapping locally
    if (fullName) {
      const nameMap = readJSONFile(USER_NAMES_FILE, {});
      nameMap[email.trim().toLowerCase()] = fullName.trim();
      writeJSONFile(USER_NAMES_FILE, nameMap);
    }

    res.json({ success: true, message: 'User created successfully' });
  } catch (err) {
    console.error("Auth Create User Error:", err.message);
    res.status(500).json({ success: false, message: err.message });
  }
});

app.delete('/api/auth/users/:id', async (req, res) => {
  const requesterRole = req.headers['x-user-role'] || '';
  if (requesterRole !== 'admin') {
    return res.status(403).json({ success: false, message: 'Access denied: Admin only' });
  }

  const { id } = req.params;
  try {
    // Fetch email first to clean up local mapping
    const { data: targetUser } = await supabase
      .from('app_users')
      .select('email')
      .eq('id', id)
      .single();

    const { error } = await supabase
      .from('app_users')
      .delete()
      .eq('id', id);

    if (error) throw error;

    if (targetUser && targetUser.email) {
      const nameMap = readJSONFile(USER_NAMES_FILE, {});
      delete nameMap[targetUser.email.toLowerCase()];
      writeJSONFile(USER_NAMES_FILE, nameMap);
    }

    res.json({ success: true, message: 'User deleted successfully' });
  } catch (err) {
    console.error("Auth Delete User Error:", err.message);
    res.status(500).json({ success: false, message: err.message });
  }
});

// 11. POST Approve Voucher
app.post('/api/vouchers/:id/approve', async (req, res) => {
  const { id } = req.params;
  const requesterRole = req.headers['x-user-role'] || '';

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
    const voucherRef = voucher.voucher_ref || voucher.id;

    // Load agency settings
    const savedSettings = readJSONFile(SETTINGS_FILE, {});
    const agencySettings = savedSettings && savedSettings.agencyName ? savedSettings : {
      agencyName: 'SAUDI PAK GROUP OF TRAVELS',
      tagline: 'Hajj & Umrah Pilgrimage',
      phone1: '03169666666',
      phone2: '+966 50 9876543',
      email: 'saudipakavi@gmail.com',
      website: 'www.saudipak.com.pk',
      address: 'Suite # 6-7, Hajvari Arcade, Kutchery Road, Multan',
      licenseNo: 'DTS-4492'
    };

    const protocol = req.headers['x-forwarded-proto'] || req.protocol || 'http';
    const host = req.headers.host;
    const baseUrl = process.env.PUBLIC_APP_URL || `${protocol}://${host}`;

    let qrDataUrl = '';
    try {
      const verifyUrl = `${baseUrl}/verify?voucher=${voucherRef}`;
      qrDataUrl = await QRCode.toDataURL(verifyUrl, {
        errorCorrectionLevel: 'M',
        margin: 2,
        width: 150,
        color: { dark: '#047857', light: '#ffffff' }
      });
    } catch (qrErr) {
      console.error("QR Code generation in verify route failed:", qrErr);
    }

    const fullHtml = buildSelfContainedPdfHtml(formData, agencySettings, qrDataUrl, baseUrl, true);
    res.send(fullHtml);
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
  console.log(`======================================================= `);
});