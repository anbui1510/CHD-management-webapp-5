import { createClient } from '@supabase/supabase-js';
import crypto from 'crypto';
import dotenv from 'dotenv';
dotenv.config();

const supabaseUrl = process.env.VITE_SUPABASE_URL;
const supabaseAnonKey = process.env.VITE_SUPABASE_ANON_KEY;

const supabase = createClient(supabaseUrl, supabaseAnonKey);

async function bridgeHashPassword(password, salt) {
  const msgUint8 = new TextEncoder().encode(password + ':' + salt);
  const hashBuffer = await crypto.webcrypto.subtle.digest('SHA-256', msgUint8);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
}

async function testLogin(username, password) {
  const { data, error } = await supabase.from('Staff').select('*');
  if (error) {
    console.log('Error fetching staff:', error);
    return;
  }
  
  const staffList = data;
  
  const user = staffList.find(s => s.StaffName === username || s.id === username || s.StaffKey === username);
  if (!user) {
    console.log(`User not found for username: ${username}`);
    return;
  }
  
  console.log(`User found:`, user.StaffName);
  
  const expectedPassword = String(user.Password || '1111').trim();
  const inputPassword = String(password).trim();
  const hashedInput = await bridgeHashPassword(inputPassword, String(user.StaffKey || user.id));

  console.log('inputPassword:', inputPassword);
  console.log('hashedInput:', hashedInput);
  console.log('expectedPassword:', expectedPassword);
  
  if (inputPassword !== expectedPassword && hashedInput !== expectedPassword) {
    console.log('Login FAILED');
  } else {
    console.log('Login SUCCESS');
  }
}

async function run() {
  console.log('--- Test Admin ---');
  await testLogin('Admin', '1111');
  
  console.log('\n--- Test Admin with StaffKey ---');
  await testLogin('11111', '1111');
  
  console.log('\n--- Test Bùi Tuấn Ân ---');
  await testLogin('Bùi Tuấn Ân', '1111');
  
  console.log('\n--- Test Bùi Tuấn Ân with StaffKey ---');
  await testLogin('1378', '1111');
}

run();
