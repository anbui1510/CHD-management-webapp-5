import React, { useEffect } from 'react';
import {
  Bell,
  ClipboardList,
  LayoutDashboard,
  LogOut,
  Moon,
  Settings,
  Stethoscope,
  Sun,
  Table,
  User
} from 'lucide-react';

const BOTTOM_TABS = [
  { id: 'SHEET', icon: Table, label: 'Xếp lịch' },
  { id: 'STAFF', icon: Stethoscope, label: 'Nhân viên' },
  { id: 'TASKS', icon: ClipboardList, label: 'Task' },
  { id: 'DASHBOARD', icon: LayoutDashboard, label: 'Dashboard' }
];

export function MobileShell({
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
  childrenByView
}) {
  const allowed = new Set(views || []);
  const tabs = BOTTOM_TABS.filter((tab) => allowed.has(tab.id));

  useEffect(() => {
    document.body.classList.add('mobile-ui');
    return () => document.body.classList.remove('mobile-ui');
  }, []);

  const body = childrenByView[activeView] || null;
  const navActive = tabs.some((tab) => tab.id === activeView) ? activeView : null;

  return (
    <div className="mobile-shell">
      <header className="mobile-topbar">
        <div className="mobile-brand">
          <span className="mobile-brand-title">{tenantLabel || 'Lịch khoa'}</span>
          {!hideDeptSelector && (
            <select
              className="mobile-dept-select"
              value={activeDept?.id}
              onChange={(e) => onSelectDept(e.target.value)}
              aria-label="Chọn khoa"
            >
              {(departments || []).map((dept) => (
                <option key={dept.id} value={dept.id}>{dept.name}</option>
              ))}
            </select>
          )}
        </div>
        <div className="mobile-top-actions">
          <button
            type="button"
            className="mobile-icon-btn"
            onClick={onToggleTheme}
            title={theme === 'dark' ? 'Nền sáng' : 'Nền tối'}
            aria-label={theme === 'dark' ? 'Nền sáng' : 'Nền tối'}
          >
            {theme === 'dark' ? <Sun size={18} /> : <Moon size={18} />}
          </button>
          <button
            type="button"
            className="mobile-icon-btn"
            onClick={onNotifications}
            title="Thông báo"
            aria-label="Thông báo"
          >
            <Bell size={18} />
          </button>
          <button
            type="button"
            className="mobile-icon-btn"
            onClick={onSettings}
            title="Cài đặt"
            aria-label="Cài đặt"
          >
            <Settings size={18} />
          </button>
          <button
            type="button"
            className="mobile-icon-btn"
            onClick={onProfile}
            title="Tài khoản"
            aria-label="Tài khoản"
          >
            <User size={18} />
          </button>
          <button
            type="button"
            className="mobile-icon-btn"
            onClick={onExit}
            title="Đăng xuất"
            aria-label="Đăng xuất"
          >
            <LogOut size={18} />
          </button>
        </div>
      </header>

      <main className="mobile-body">
        {body}
      </main>

      <nav className="mobile-bottom-nav" aria-label="Điều hướng chính">
        {tabs.map((tab) => {
          const Icon = tab.icon;
          const active = navActive === tab.id;
          return (
            <button
              key={tab.id}
              type="button"
              className={`mobile-nav-item${active ? ' active' : ''}`}
              onClick={() => onSelectView(tab.id)}
            >
              <Icon size={20} />
              <span>{tab.label}</span>
            </button>
          );
        })}
      </nav>
    </div>
  );
}
