require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_ANON_KEY);

async function checkDb() {
  try {
    const { data, error } = await supabase
      .from('vouchers')
      .select('id, booking_agent_name')
      .limit(1);

    if (error) {
      if (error.message.includes('booking_agent_name')) {
        console.log("Database connection OK, but booking_agent_name column does not exist yet (run migration).");
      } else {
        throw error;
      }
    } else {
      console.log("SUCCESS querying booking_agent_name:\n", data);
    }
  } catch (e) {
    console.error("Failed to query DB:", e.message);
  }
}

checkDb();
