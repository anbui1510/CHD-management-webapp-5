import { useCallback, useRef } from 'react';
import {
  applyMedicalDataBundle,
  fetchMedicalDataBundle,
  type MedicalDataSetters,
  type RefreshScope
} from '../api/medicalDataRefresh';

const REFRESH_COOLDOWN_MS = 2500;

export function useRefreshMedicalData(setters: MedicalDataSetters) {
  const metaRef = useRef({ pending: null as Promise<void> | null, lastAt: 0 });

  return useCallback(async (scope: RefreshScope = 'clinical', force = false) => {
    const meta = metaRef.current;
    const now = Date.now();
    if (!force && meta.pending) return meta.pending;
    if (!force && now - meta.lastAt < REFRESH_COOLDOWN_MS) return;

    meta.pending = fetchMedicalDataBundle(force)
      .then(bundle => {
        applyMedicalDataBundle(bundle, scope, setters);
        meta.lastAt = Date.now();
      })
      .catch(err => {
        console.error('Failed to refresh medical data:', err);
        throw err;
      })
      .finally(() => {
        meta.pending = null;
      });

    return meta.pending;
  }, [setters]);
}
