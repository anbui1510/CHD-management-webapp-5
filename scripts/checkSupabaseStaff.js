import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config();

const supabaseUrl = process.env.VITE_SUPABASE_URL;
const supabaseAnonKey = process.env.VITE_SUPABASE_ANON_KEY;

const supabase = createClient(supabaseUrl, supabaseAnonKey);

async function checkStaff() {
  const { data, error } = await supabase.from('Staff').select('id, StaffKey, StaffName, Password');
  console.log(JSON.stringify(data, null, 2));
}

checkStaff();
