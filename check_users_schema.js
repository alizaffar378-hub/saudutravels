require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_ANON_KEY);

async function checkUsersTable() {
  try {
    const { data, error } = await supabase
      .from('app_users')
      .select('*')
      .limit(5);

    if (error) {
      console.log("Error querying app_users table:", error.message);
    } else {
      console.log("app_users table queried successfully. Records:", JSON.stringify(data, null, 2));
    }
  } catch (e) {
    console.error("Exception checking users table:", e.message);
  }
}

checkUsersTable();
