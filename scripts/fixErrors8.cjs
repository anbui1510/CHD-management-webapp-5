const fs = require('fs');

// 1. CathLabRoomView.tsx
let cathContent = fs.readFileSync('src/components/CathLabRoomView.tsx', 'utf8');

// Line 787: Fix duplicate id (which is ConsultKey)
cathContent = cathContent.replace(/id:\s*matchedConsult\?\.id\s*\|\|\s*'',/g, "ConsultKey: matchedConsult?.id || '',");

// Line 1095: Fix ConsultKey -> id in Consult payload
// It might be `ConsultKey: currentConsult.id` or similar inside a `const dummyConsult: Consult = {`
// Let's just find `ConsultKey: currentConsult?.id` or similar.
// The error log: "Conversion of type '{ ConsultKey: string; PatientKey: any; ConsultType: \"Staff thông\";..."
cathContent = cathContent.replace(/ConsultKey:\s*currentConsult\.id/g, 'id: currentConsult.id');
cathContent = cathContent.replace(/ConsultKey:\s*Date\.now\(\)\.toString\(\)/g, 'id: Date.now().toString()');

// Line 1116: Fix PatientKey -> id in Patient payload
// The error log: "Conversion of type '{ PatientKey: any; PatientID1: any;..."
cathContent = cathContent.replace(/PatientKey:\s*p\.id/g, 'id: p.id');

fs.writeFileSync('src/components/CathLabRoomView.tsx', cathContent, 'utf8');


// 2. StaffResultsView.tsx
let staffContent = fs.readFileSync('src/components/StaffResultsView.tsx', 'utf8');

// Line 314 & 316: Property 'PatientKey' is missing & duplicate id
// Let's check what it is:
// Maybe it's `id: p.id` instead of `PatientKey: p.id` inside a `Consult` payload? No, `PatientKey` is missing in `Consult`.
// In `Consult`, `PatientKey` is a foreign key, so it MUST BE `PatientKey`!
// And `Consult` also has `id: consult.id`.
staffContent = staffContent.replace(/id:\s*p\.id,/g, 'PatientKey: p.id,');

fs.writeFileSync('src/components/StaffResultsView.tsx', staffContent, 'utf8');

console.log('Fixed final component errors.');
