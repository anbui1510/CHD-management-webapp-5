import assert from 'node:assert';
import { isPreservedLocalStorageKey } from './clearAppStorage';

console.log('--- USER PREFERENCES & STORAGE PERSISTENCE TESTS ---');

// 1. Test SessionTimeout keys preservation
assert(isPreservedLocalStorageKey('SessionTimeout_109'), 'SessionTimeout_109 must be preserved');
assert(isPreservedLocalStorageKey('SessionTimeout_admin'), 'SessionTimeout_admin must be preserved');
assert(isPreservedLocalStorageKey('SessionTimeout_GLOBAL'), 'SessionTimeout_GLOBAL must be preserved');
assert(isPreservedLocalStorageKey('LastActivity_109'), 'LastActivity_109 must be preserved');

// 2. Test Home Dashboard card and quick access preferences
assert(isPreservedLocalStorageKey('home_selected_stats'), 'home_selected_stats must be preserved');
assert(isPreservedLocalStorageKey('home_quick_shortcuts'), 'home_quick_shortcuts must be preserved');

// 3. Test Mobile quick tabs
assert(isPreservedLocalStorageKey('mobile_quick_tabs_109'), 'mobile_quick_tabs_109 must be preserved');
assert(isPreservedLocalStorageKey('mobile_quick_tabs_admin'), 'mobile_quick_tabs_admin must be preserved');

// 4. Test Notification / PWA flags
assert(isPreservedLocalStorageKey('push_prompt_dismissed'), 'push_prompt_dismissed must be preserved');
assert(isPreservedLocalStorageKey('pwa_install_dismissed'), 'pwa_install_dismissed must be preserved');

// 5. Test Auth & Config
assert(isPreservedLocalStorageKey('CHD_AUTH_TOKEN', true), 'CHD_AUTH_TOKEN must be preserved when preserveAuth=true');
assert(isPreservedLocalStorageKey('CHD_AUTH_STAFF_KEY', true), 'CHD_AUTH_STAFF_KEY must be preserved when preserveAuth=true');
assert(isPreservedLocalStorageKey('CurrentStaffKey', true), 'CurrentStaffKey must be preserved when preserveAuth=true');
assert(isPreservedLocalStorageKey('chd_apps_script_url'), 'chd_apps_script_url must be preserved');
assert(isPreservedLocalStorageKey('chd_apps_script_secret'), 'chd_apps_script_secret must be preserved');
assert(isPreservedLocalStorageKey('CHD_APP_BUILD_ID'), 'CHD_APP_BUILD_ID must be preserved');

// 6. Test Module 7 LichKhoa
assert(isPreservedLocalStorageKey('LICHKHOA_DATA_STORE_V1'), 'LICHKHOA_DATA_STORE_V1 must be preserved');
assert(isPreservedLocalStorageKey('LICHKHOA_SEED_VERSION_V1'), 'LICHKHOA_SEED_VERSION_V1 must be preserved');
assert(isPreservedLocalStorageKey('LICHKHOA_CLOUD_META_V1'), 'LICHKHOA_CLOUD_META_V1 must be preserved');
assert(isPreservedLocalStorageKey('LICHKHOA_SHEET_ID'), 'LICHKHOA_SHEET_ID must be preserved');
assert(isPreservedLocalStorageKey('TIM_MACH_CUSTOM'), 'TIM_MACH_CUSTOM must be preserved');

// 7. Test that arbitrary/random temporary garbage keys are NOT preserved
assert(!isPreservedLocalStorageKey('random_junk_key'), 'Random junk key should not be preserved');
assert(!isPreservedLocalStorageKey('temp_cache_123'), 'Temp cache should not be preserved');

console.log('ALL STORAGE PRESERVATION ASSERTIONS PASSED SUCCESSFULLY!');
