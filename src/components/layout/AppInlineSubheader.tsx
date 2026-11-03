import React, { useCallback, useEffect, useMemo } from 'react';
import { ClipboardList, Download, Heart, LayoutDashboard, Plus, UserCog } from 'lucide-react';
import type { ActiveMenuId } from '../../config/navigation';
import { getViewSubheaderTitle } from '../../config/viewSubheaderTitles';
import { useViewSubheaderContext } from '../../context/ViewSubheaderContext';

const INLINE_SUBHEADER_MENUS: ActiveMenuId[] = [
  'home',
  'workspace',
  'profile',
  'patients',
  'consult-list',
  'excel-export',
];

interface AppInlineSubheaderProps {
  activeMenu: ActiveMenuId;
  patientSearch: string;
  onPatientSearchChange: (value: string) => void;
  onAddPatient: () => void;
  consultListSearch: string;
  onConsultListSearchChange: (value: string) => void;
  onAddConsult: () => void;
  profileName?: string;
}

export default function AppInlineSubheader({
  activeMenu,
  patientSearch,
  onPatientSearchChange,
  onAddPatient,
  consultListSearch,
  onConsultListSearchChange,
  onAddConsult,
  profileName,
}: AppInlineSubheaderProps) {
  const { setConfig } = useViewSubheaderContext();

  const handlePatientSearch = useCallback(
    (value: string) => onPatientSearchChange(value),
    [onPatientSearchChange]
  );

  const handleConsultSearch = useCallback(
    (value: string) => onConsultListSearchChange(value),
    [onConsultListSearchChange]
  );

  const patientsActions = useMemo(
    () => (
      <button
        type="button"
        onClick={onAddPatient}
        className="bg-primary text-primary-foreground hover:bg-primary/90 font-medium px-3 py-1.5 rounded-md text-xs flex items-center justify-center gap-1 shadow-sm transition cursor-pointer shrink-0"
      >
        <Plus className="w-3.5 h-3.5" /> Thêm bệnh nhi mới
      </button>
    ),
    [onAddPatient]
  );

  const consultActions = useMemo(
    () => (
      <div className="flex items-center gap-1.5 shrink-0">
        <button
          type="button"
          onClick={onAddConsult}
          className="bg-primary text-primary-foreground hover:bg-primary/90 font-medium px-3 py-1.5 rounded-md text-xs flex items-center justify-center gap-1 shadow-sm transition cursor-pointer"
        >
          <Plus className="w-3.5 h-3.5" /> Đăng kí staff
        </button>
      </div>
    ),
    [onAddConsult]
  );

  useEffect(() => {
    if (!INLINE_SUBHEADER_MENUS.includes(activeMenu)) {
      return;
    }

    const title =
      activeMenu === 'profile' && profileName
        ? `${getViewSubheaderTitle(activeMenu)} · ${profileName}`
        : getViewSubheaderTitle(activeMenu);

    const iconMap: Partial<Record<ActiveMenuId, React.ReactNode>> = {
      home: <Heart className="w-4 h-4" />,
      workspace: <LayoutDashboard className="w-4 h-4" />,
      profile: <UserCog className="w-4 h-4" />,
      patients: <Heart className="w-4 h-4" />,
      'consult-list': <ClipboardList className="w-4 h-4" />,
      'excel-export': <Download className="w-4 h-4" />,
    };

    if (activeMenu === 'patients') {
      setConfig({
        title,
        icon: iconMap.patients,
        searchValue: patientSearch,
        onSearchChange: handlePatientSearch,
        actions: patientsActions,
      });
      return;
    }

    if (activeMenu === 'consult-list') {
      setConfig({
        title,
        icon: iconMap['consult-list'],
        searchValue: consultListSearch,
        onSearchChange: handleConsultSearch,
        actions: consultActions,
      });
      return;
    }

    setConfig({
      title,
      icon: iconMap[activeMenu],
      showSearch: false,
    });
  }, [
    activeMenu,
    profileName,
    patientSearch,
    consultListSearch,
    handlePatientSearch,
    handleConsultSearch,
    patientsActions,
    consultActions,
    setConfig,
  ]);

  // Chỉ clear khi rời nhóm menu inline (hoặc unmount), không clear mỗi lần gõ search.
  useEffect(() => {
    if (!INLINE_SUBHEADER_MENUS.includes(activeMenu)) {
      return;
    }
    return () => setConfig(null);
  }, [activeMenu, setConfig]);

  return null;
}
