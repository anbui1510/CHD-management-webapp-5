import React from 'react';
import {
  Bell,
  Calendar,
  ClipboardList,
  LayoutDashboard,
  LogOut,
  Moon,
  RefreshCw,
  Settings,
  Stethoscope,
  Sun,
  Table,
  User
} from 'lucide-react';

const NAV_ITEMS = [
  { id: 'SHEET', icon: Table, label: 'Bảng Sheet' },
  { id: 'CALENDAR', icon: Calendar, label: 'Lịch Google' },
  { id: 'DASHBOARD', icon: LayoutDashboard, label: 'Dashboard' },
  { id: 'STAFF', icon: Stethoscope, label: 'Quản Lý BS' },
  { id: 'TASKS', icon: ClipboardList, label: 'Quản Lý Task' }
];

export function Navbar({
  activeDept,
  departments,
  onSelectDept,
  activeView,
  onSelectView,
  views,
  theme,
  onToggleTheme,
  onNotifications,
  onProfile,
  onSettings,
  onExit,
  hideDeptSelector = false,
  tenantLabel = '',
  onSheetSync,
  sheetSyncTitle = '',
}) {
  return (
    <header className="navbar">
      <div className="brand-logo">
        <div className="brand-icon">
          <Calendar size={22} />
        </div>
        <div>
          <span>Smart Scheduler</span>
          <span style={{ fontSize: '0.7rem', display: 'block', color: 'var(--accent-blue)', fontWeight: 500 }}>
            {tenantLabel || 'Xếp Lịch Khoa Bệnh Viện'}
          </span>
        </div>
      </div>

      {/* Department Selector */}
      {!hideDeptSelector && (
        <div className="dept-selector-wrapper">
          <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>Khoa:</span>
          <select 
            className="dept-select" 
            value={activeDept?.id} 
            onChange={(e) => onSelectDept(e.target.value)}
          >
            {departments.map(d => (
              <option key={d.id} value={d.id}>{d.name}</option>
            ))}
          </select>
        </div>
      )}

      {/* View Switcher */}
      <div className="nav-views">
        {NAV_ITEMS.filter(item => !views || views.includes(item.id)).map(item => {
          const Icon = item.icon;
          return (
            <button
              key={item.id}
              className={`nav-btn ${activeView === item.id ? 'active' : ''}`}
              onClick={() => onSelectView(item.id)}
            >
              <Icon size={16} /> {item.label}
            </button>
          );
        })}
      </div>

      <div className="nav-actions">
        {onSheetSync && (
          <button
            type="button"
            className="nav-icon-btn"
            onClick={onSheetSync}
            title={sheetSyncTitle || 'Đồng bộ từ Google Sheet'}
            aria-label="Đồng bộ từ Google Sheet"
          >
            <RefreshCw size={18} />
          </button>
        )}
        <button
          type="button"
          className="nav-icon-btn"
          onClick={onToggleTheme}
          title={theme === 'dark' ? 'Nền trắng (sáng)' : 'Nền tối'}
          aria-label={theme === 'dark' ? 'Nền trắng (sáng)' : 'Nền tối'}
        >
          {theme === 'dark' ? <Sun size={18} color="#f59e0b" /> : <Moon size={18} color="#6366f1" />}
        </button>
        <button
          type="button"
          className="nav-icon-btn"
          title="Thông báo"
          aria-label="Thông báo"
          onClick={onNotifications}
        >
          <Bell size={18} />
        </button>
        <button
          type="button"
          className="nav-icon-btn"
          title="Hồ sơ cá nhân"
          aria-label="Hồ sơ cá nhân"
          onClick={onProfile}
        >
          <User size={18} />
        </button>
        <button
          type="button"
          className="nav-icon-btn"
          title="Cài đặt"
          aria-label="Cài đặt"
          onClick={onSettings}
        >
          <Settings size={18} />
        </button>
        <button
          type="button"
          className="nav-icon-btn"
          title="Thoát"
          aria-label="Thoát"
          onClick={onExit}
        >
          <LogOut size={18} />
        </button>
      </div>
    </header>
  );
}
