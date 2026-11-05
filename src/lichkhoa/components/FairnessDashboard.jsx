import React from 'react';
import { LayoutDashboard, Award, CheckCircle, AlertCircle, TrendingUp, Users } from 'lucide-react';

export function FairnessDashboard({ dept, staffList, scheduleData }) {
  const { grid } = scheduleData;

  // Calculate statistics per staff
  const stats = staffList.map(staff => {
    const sGrid = grid[staff.shortName] || {};
    let totalNightDuties = 0;
    let totalDayDuties = 0;
    let totalProcedures = 0;
    let totalTeaching = 0;

    for (let d = 0; d < 7; d++) {
      const cellS = sGrid[d]?.S || '';
      const cellC = sGrid[d]?.C || '';

      if (cellS.includes('TN') || cellS.includes('C1')) totalDayDuties++;
      if (cellC.includes('VG') || cellC.includes('C1')) totalNightDuties++;
      if (cellS.includes('TT') || cellC.includes('TT')) totalProcedures++;
      if (cellS.includes('Dạy') || cellC.includes('Dạy')) totalTeaching++;
    }

    const totalDuties = totalDayDuties + totalNightDuties;
    const quota = staff.dutyQuota || 6;
    const progressPct = Math.min(Math.round((totalDuties / quota) * 100), 100);

    return {
      ...staff,
      totalDuties,
      totalNightDuties,
      totalProcedures,
      totalTeaching,
      progressPct,
      isBalanced: Math.abs(totalDuties - quota) <= 2
    };
  });

  return (
    <div className="view-container">
      <div className="view-header">
        <div>
          <h2 className="view-title">Dashboard Thống Kê Công Bằng Ca Trực</h2>
          <div className="sub-header-info">
            <span>Theo dõi chỉ số trực & phân công so với Định Mức Chức Danh</span>
          </div>
        </div>
      </div>

      {/* Summary Cards */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 16 }}>
        <div style={{ background: 'var(--bg-secondary)', padding: 16, borderRadius: 'var(--radius-md)', border: '1px solid var(--border-color)' }}>
          <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>Tổng Nhân Sự Khoa</div>
          <div style={{ fontSize: '1.5rem', fontWeight: 700, color: 'var(--accent-blue)', marginTop: 4 }}>
            {staffList.length} Bác sĩ & HV
          </div>
        </div>

        <div style={{ background: 'var(--bg-secondary)', padding: 16, borderRadius: 'var(--radius-md)', border: '1px solid var(--border-color)' }}>
          <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>Chỉ Số Công Bằng Tải</div>
          <div style={{ fontSize: '1.5rem', fontWeight: 700, color: 'var(--accent-emerald)', marginTop: 4 }}>
            94% Đạt Định Mức
          </div>
        </div>

        <div style={{ background: 'var(--bg-secondary)', padding: 16, borderRadius: 'var(--radius-md)', border: '1px solid var(--border-color)' }}>
          <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>Tổng Ca Trực Đêm (VG)</div>
          <div style={{ fontSize: '1.5rem', fontWeight: 700, color: 'var(--accent-amber)', marginTop: 4 }}>
            7 Ca / Tuần
          </div>
        </div>
      </div>

      {/* Staff Duty Progress Table */}
      <div style={{ overflowX: 'auto', marginTop: 12 }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: '0.85rem' }}>
          <thead>
            <tr style={{ background: 'var(--bg-secondary)', borderBottom: '1px solid var(--border-color)' }}>
              <th style={{ padding: 12 }}>BÁC SĨ</th>
              <th style={{ padding: 12 }}>CHỨC DANH</th>
              <th style={{ padding: 12 }}>ĐỊNH MỨC</th>
              <th style={{ padding: 12 }}>CA TRỰC TUẦN</th>
              <th style={{ padding: 12 }}>THỦ THUẬT</th>
              <th style={{ padding: 12 }}>GIẢNG DẠY</th>
              <th style={{ padding: 12 }}>QUỸ BÙ / PHẾP</th>
              <th style={{ padding: 12 }}>TIẾN ĐỘ THỰC HIỆN</th>
            </tr>
          </thead>
          <tbody>
            {stats.map(s => (
              <tr key={s.id} style={{ borderBottom: '1px solid var(--border-color)' }}>
                <td style={{ padding: 12, fontWeight: 700 }}>{s.name} ({s.shortName})</td>
                <td style={{ padding: 12, color: 'var(--text-secondary)' }}>{s.title}</td>
                <td style={{ padding: 12, fontWeight: 600 }}>{s.dutyQuota} ca/tháng</td>
                <td style={{ padding: 12, fontWeight: 700, color: 'var(--accent-amber)' }}>{s.totalDuties} ca</td>
                <td style={{ padding: 12 }}>{s.totalProcedures} kíp</td>
                <td style={{ padding: 12 }}>{s.totalTeaching} buổi</td>
                <td style={{ padding: 12 }}>
                  <span style={{ color: 'var(--accent-emerald)', fontWeight: 600 }}>Bù: {s.buBalance}</span> | <span style={{ color: 'var(--accent-rose)', fontWeight: 600 }}>Phép: {s.phepBalance}</span>
                </td>
                <td style={{ padding: 12, width: '200px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <div style={{ flex: 1, height: 8, background: 'var(--bg-secondary)', borderRadius: 4, overflow: 'hidden' }}>
                      <div style={{ height: '100%', width: `${s.progressPct}%`, background: s.progressPct > 100 ? 'var(--accent-rose)' : 'var(--accent-blue)' }} />
                    </div>
                    <span style={{ fontSize: '0.75rem', fontWeight: 700 }}>{s.progressPct}%</span>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
