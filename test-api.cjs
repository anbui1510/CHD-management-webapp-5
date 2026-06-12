const http = require('http');

http.get('http://0.0.0.0:3000/api/consults', (res) => {
  let body = '';
  res.on('data', chunk => body += chunk);
  res.on('end', () => {
    const data = JSON.parse(body);
    console.log("Consults length:", data.length);
    if(data.length > 0) {
      console.log(JSON.stringify(data[data.length-1], null, 2));
    }
  });
});
