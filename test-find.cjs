const http = require('http');

http.get('http://0.0.0.0:3000/api/patients', (res) => {
  let body = '';
  res.on('data', chunk => body += chunk);
  res.on('end', () => {
    const data = JSON.parse(body);
    const pat = data.find(p => p.PatientKey === 'pat_001');
    console.log("pat_001 found:", !!pat);
  });
});
