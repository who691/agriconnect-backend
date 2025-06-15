// config/supabaseClient.js
const { createClient } = require('@supabase/supabase-js');

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_KEY;

if (!supabaseUrl || !supabaseServiceKey) {
  console.error("Supabase URL or Service Key is missing. Check .env file.");
  // Optionally, throw an error or handle initialization failure
}

const supabase = createClient(supabaseUrl, supabaseServiceKey);

module.exports = supabase;