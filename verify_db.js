require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_ANON_KEY);

async function checkDb() {
  try {
    const { data, error } = await supabase
      .from('vouchers')
      .select('*')
      .eq('id', 'UMR-2026-1234');

    if (error) throw error;
    console.log("SUCCESS: Found voucher in Supabase database:\n", JSON.stringify(data, null, 2));
  } catch (e) {
    console.error("Failed to query DB:", e.message);
  }
}

checkDb();
