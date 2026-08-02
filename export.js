const fs = require('fs');

async function exportPatientsCSV() {
    const url = 'https://script.google.com/macros/s/AKfycbxl6qltY-bkccq-iODOCJWFOhn8ksMiJ9JQ6t92eZQz5pvesbhFa116IFTPOWxPyIiG6A/exec';

    const response = await fetch(url);
    const data = await response.json();

    const patients = data.patients;

    if (!patients || patients.length === 0) {
        console.log('Không có dữ liệu');
        return;
    }

    const headers = Object.keys(patients[0]);

    const csvRows = [
        headers.join(','),
        ...patients.map(row =>
            headers.map(field =>
                `"${String(row[field] ?? '').replace(/"/g, '""')}"`
            ).join(',')
        )
    ];

    fs.writeFileSync(
        'patients.csv',
        csvRows.join('\n'),
        'utf8'
    );

    console.log('Đã tạo patients.csv');
}

exportPatientsCSV();