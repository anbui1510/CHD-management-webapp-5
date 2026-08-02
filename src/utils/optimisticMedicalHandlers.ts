import type { CathLab, CMR, Consult, Patient, Staff } from '../types';

export type OptimisticMedicalHandlers = {
  patchConsult?: (consultKey: string, patch: Partial<Consult>) => void;
  patchPatient?: (patientKey: string, patch: Partial<Patient>) => void;
  patchCmr?: (cmrKey: string, patch: Partial<CMR>) => void;
  addCmr?: (cmr: CMR) => void;
  patchCathlab?: (cathKey: string, patch: Partial<CathLab>) => void;
  addCathlab?: (cath: CathLab) => void;
  addConsult?: (consult: Consult) => void;
  addPatient?: (patient: Patient) => void;
  patchStaff?: (staffKey: string, patch: Partial<Staff>) => void;
};

export const getCmrRecordKey = (cmr: Partial<CMR>) =>
  String(cmr.id || cmr.id || '').trim();
