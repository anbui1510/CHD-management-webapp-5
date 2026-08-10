import {
  Patient,
  Consult,
  CathLab,
  Staff,
  normalizePatientKey,
  findPatientByKey,
  formatVNTime,
} from '../types';
import { normalizeDiagnosisID } from '../data/source';
import { classifyDiagnosisText } from './diagnosisClassifier';
import { resolveStaffByNameOrKey } from './staffNameMatch';
import {
  buildCathImportDateKey,
  collectPatientHisIds,
  findExistingCathForHisMerge,
  mergeHisIntoExistingCath,
  normalizeCathDateKey,
  parseCathMethods,
  shouldSkipDuplicateHisImport,
} from './hisCathImport';
import {
  HIS_ADDRESS_WARNING,
  DEFAULT_HIS_PATIENT_ADDRESS,
  SCHEDULING_ELIGIBLE_RESULTS,
  BatchWriteOperation,
  buildCathImportKey,
  getDateDistanceDays,
  getHisCell,
  normalizeHisHeader,
  normalizeHisDoctor,
  normalizeHisKey,
  normalizeHisSex,
  normalizeRefKey,
  parseHisDateOnly,
  readHisWorkbookRows,
} from './hisCathImportHelpers';
import {
  HIS_IMPORT_AUTO_CLOSE_NOTIFY_TITLE,
  buildHisAutoCloseConsultLogLine,
  buildHisImportNotificationMessage,
  getHisImportMarkScore,
  getHisImportNotificationSeverity,
  getHisStageLabel,
  type HisWorkflowStage,
} from './workflowMessages';

export type HisImportRowStatus =
  | 'created'
  | 'merged'
  | 'skipped_existing'
  | 'skipped_invalid';

export interface HisImportRowResult {
  rowIndex: number;
  patientId: string;
  patientName: string;
  cathDate: string;
  cathMethod: string;
  diagnosisID: string;
  postDiagnosis: string;
  ptvMain: string;
  status: HisImportRowStatus;
  detail: string;
  consultKey?: string;
  cathKey?: string;
  newPatient?: boolean;
  workflowClosed?: boolean;
  workflowStage?: string;
}

export interface HisImportAutoCloseItem {
  consult: Consult;
  patient: Patient;
  cath: CathLab;
  stage: HisWorkflowStage;
  patch: Partial<Consult>;
}

export interface HisImportPlan {
  rows: HisImportRowResult[];
  patientsToCreate: Patient[];
  cathlabsToCreate: CathLab[];
  cathlabsToUpdate: CathLab[];
  consultsToAutoClose: HisImportAutoCloseItem[];
  skippedExisting: number;
  skippedInvalid: number;
  hasWork: boolean;
}

const hasConsultResult = (consult: Consult) => {
  const result = String(consult.ConsultResultID || '').trim().toLowerCase();
  return !!result && !['nodata', 'no data', '-', '—'].includes(result);
};

const isTransferredToCathLab = (consult: Consult) =>
  consult.TransferredToCathLab === true ||
  String(consult.TransferredToCathLab || '').trim().toLowerCase() === 'true' ||
  String(consult.TransferredToCathLab || '').trim().toLowerCase() === 'yes' ||
  String(consult.TransferredToCathLab || '').trim().toLowerCase() === 'có';

export const getHisWorkflowStage = (consult: Consult): HisWorkflowStage => {
  if (!hasConsultResult(consult)) return 'missing_staff_result';
  if (!consult.PlannedCathLabDate || !isTransferredToCathLab(consult)) return 'scheduler_missing_transfer';
  return 'missing_cath_result';
};

const findPatientByHisId = (patientId: string, patientList: Patient[]): Patient | undefined => {
  const normalizedId = normalizeHisKey(patientId);
  if (!normalizedId) return undefined;
  return patientList.find(patient => {
    const id1 = normalizeHisKey(patient.PatientID1);
    const id2Values = String(patient.PatientID2 || '')
      .split('-')
      .map(part => normalizeHisKey(part))
      .filter(Boolean);
    return id1 === normalizedId || id2Values.includes(normalizedId);
  });
};

const findBestConsultForHisCath = (
  patientKey: string,
  cathDate: string,
  consults: Consult[],
  cathlabs: CathLab[]
): Consult | undefined => {
  const normalizedPatient = normalizePatientKey(patientKey);
  const cathTime = new Date(`${parseHisDateOnly(cathDate)}T00:00:00`).getTime();
  if (!normalizedPatient || Number.isNaN(cathTime)) return undefined;

  const cathConsultKeys = new Set(cathlabs.map(cath => normalizeRefKey(cath.ConsultKey)).filter(Boolean));
  const eligibleResultSet = new Set(SCHEDULING_ELIGIBLE_RESULTS.map(item => item.toLowerCase()));

  const scored = consults
    .filter(consult => normalizePatientKey(consult.PatientKey) === normalizedPatient)
    .filter(consult => !cathConsultKeys.has(normalizeRefKey(consult.ConsultKey)))
    .map(consult => {
      const consultTime = consult.ConsultDate
        ? new Date(`${parseHisDateOnly(consult.ConsultDate)}T00:00:00`).getTime()
        : 0;
      const plannedDistance = consult.PlannedCathLabDate
        ? getDateDistanceDays(consult.PlannedCathLabDate, cathDate)
        : Number.POSITIVE_INFINITY;
      const consultDistance =
        consultTime > 0 ? Math.abs(cathTime - consultTime) / (1000 * 60 * 60 * 24) : Number.POSITIVE_INFINITY;
      const result = String(consult.ConsultResultID || '').trim().toLowerCase();
      const resultEligible = eligibleResultSet.has(result);
      const isPendingResult = !hasConsultResult(consult);
      const beforeOrSameCath = consultTime > 0 && consultTime <= cathTime;
      const score =
        (resultEligible ? 500 : 0) +
        (isPendingResult ? 180 : 0) +
        (isTransferredToCathLab(consult) ? 220 : 0) +
        (consult.PlannedCathLabDate ? 220 : 0) +
        (plannedDistance <= 7 ? 220 : plannedDistance <= 30 ? 120 : 0) +
        (beforeOrSameCath ? 120 : -300) -
        Math.min(consultDistance, 365);

      return { consult, score, plannedDistance, consultDistance, beforeOrSameCath, resultEligible, isPendingResult };
    })
    .filter(item => item.beforeOrSameCath || item.plannedDistance <= 7)
    .filter(item => item.resultEligible || item.isPendingResult || item.plannedDistance <= 7)
    .sort(
      (a, b) =>
        b.score - a.score || a.plannedDistance - b.plannedDistance || a.consultDistance - b.consultDistance
    );

  return scored[0]?.consult;
};

const buildExistingCathImportKeys = (patientList: Patient[], cathList: CathLab[]) => {
  const keys = new Set<string>();
  cathList.forEach(cath => {
    const patient = findPatientByKey(patientList, cath.PatientKey);
    const patientIds = patient
      ? collectPatientHisIds(patient)
      : [normalizeHisKey(cath.PatientKey)].filter(Boolean);
    const cathDate = normalizeCathDateKey(parseHisDateOnly(cath.CathDate));
    const cathMethods =
      parseCathMethods(cath.CathMethod).length > 0
        ? parseCathMethods(cath.CathMethod)
        : [String(cath.CathMethod || '')];
    patientIds.forEach(patientId => {
      if (patientId && cathDate) {
        keys.add(buildCathImportDateKey(patientId, cathDate));
      }
      cathMethods.forEach(method => {
        if (patientId && cathDate && method) {
          keys.add(buildCathImportKey(patientId, cathDate, method));
        }
      });
    });
  });
  return keys;
};

const buildHisAutoCloseConsultPatch = (
  consult: Consult,
  cathPayload: CathLab,
  stage: HisWorkflowStage,
  loggedInStaffId: string
): Partial<Consult> => {
  const logLine = buildHisAutoCloseConsultLogLine({
    isoTimestamp: new Date().toISOString(),
    stage,
    cathDateFormatted: formatVNTime(cathPayload.CathDate),
    cathKey: cathPayload.CathKey,
  });
  const resultPatch = hasConsultResult(consult)
    ? {}
    : {
        ConsultResultID: 'Can thiệp thông tim' as Consult['ConsultResultID'],
        DetailConsultResult:
          String(consult.DetailConsultResult || '').trim() || 'Đã thực hiện thông tim thực tế theo HIS',
        ConsultResultUpdatedBy: loggedInStaffId || 'HIS_IMPORT',
        ConsultResultUpdatedTime: new Date().toISOString(),
      };

  return {
    ...resultPatch,
    CallStatus: 'Đã can thiệp/mổ',
    PlannedCathLabDate: cathPayload.CathDate,
    TransferredToCathLab: true,
    CathMethod: Array.isArray(cathPayload.CathMethod)
      ? cathPayload.CathMethod.join(' + ')
      : String(cathPayload.CathMethod || ''),
    PostCathDepart: consult.PostCathDepart || 'Tim Mạch',
    ConsultNote: consult.ConsultNote ? `${consult.ConsultNote}\n${logLine}` : logLine,
  };
};

const invalidDetail = (patientId: string, cathMethod: string, cathDate: string) => {
  if (!patientId) return 'Thiếu Mã NB';
  if (!cathMethod) return 'Thiếu Tên dịch vụ';
  if (!cathDate) return 'Thiếu Thời gian bắt đầu PTTT';
  return 'Thiếu dữ liệu bắt buộc';
};

export async function buildHisImportPlan(input: {
  file: File;
  patients: Patient[];
  consults: Consult[];
  cathlabs: CathLab[];
  loggedInStaffId: string;
}): Promise<HisImportPlan> {
  const rows = await readHisWorkbookRows(input.file);
  const headerRowIndex = rows.findIndex(row => {
    const normalized = (row as unknown[]).map(normalizeHisHeader);
    return normalized.includes('manb') && normalized.includes('tendichvu');
  });

  if (headerRowIndex === -1) {
    throw new Error('Không tìm thấy dòng tiêu đề có cột "Mã NB" và "Tên dịch vụ".');
  }

  const headerMap = new Map<string, number>();
  (rows[headerRowIndex] as unknown[]).forEach((header, index) => {
    const normalized = normalizeHisHeader(header);
    if (normalized) headerMap.set(normalized, index);
  });

  const currentPatients = [...input.patients];
  let currentCathlabs = [...input.cathlabs];
  const patientsToCreate: Patient[] = [];
  const cathlabsToCreate: CathLab[] = [];
  const cathlabsToUpdate: CathLab[] = [];
  const consultsToAutoClose: HisImportAutoCloseItem[] = [];
  const rowResults: HisImportRowResult[] = [];
  const existingCathKeys = buildExistingCathImportKeys(currentPatients, currentCathlabs);
  const importedKeys = new Set<string>();
  let skippedExisting = 0;
  let skippedInvalid = 0;

  const upsertCathInMemory = (cath: CathLab) => {
    const idx = currentCathlabs.findIndex(item => item.CathKey === cath.CathKey);
    if (idx >= 0) currentCathlabs[idx] = cath;
    else currentCathlabs.push(cath);
  };

  const queueCathUpdate = (cath: CathLab) => {
    const idx = cathlabsToUpdate.findIndex(item => item.CathKey === cath.CathKey);
    if (idx >= 0) cathlabsToUpdate[idx] = cath;
    else cathlabsToUpdate.push(cath);
  };

  const pushSkipped = (
    rowIndex: number,
    patientId: string,
    patientName: string,
    cathMethod: string,
    cathDate: string,
    postDiagnosis: string,
    ptvMain: string,
    detail: string
  ) => {
    rowResults.push({
      rowIndex,
      patientId,
      patientName,
      cathDate,
      cathMethod,
      diagnosisID: '',
      postDiagnosis,
      ptvMain,
      status: 'skipped_existing',
      detail,
    });
  };

  rows.slice(headerRowIndex + 1).forEach((row, index) => {
    const sheetRowIndex = headerRowIndex + 2 + index;
    const patientId = getHisCell(row as unknown[], headerMap, ['manb']);
    const patientName = getHisCell(row as unknown[], headerMap, ['hovatennb', 'hotennb', 'hovatenbn']);
    const cathMethod = getHisCell(row as unknown[], headerMap, ['tendichvu']);
    const cathDate = parseHisDateOnly(getHisCell(row as unknown[], headerMap, ['thoigianbatdaupttt']));
    const preDiagnosis = getHisCell(row as unknown[], headerMap, ['chandoantruocttt']);
    const postDiagnosis = getHisCell(row as unknown[], headerMap, ['chandoansaupttt']) || preDiagnosis;
    const ptvMain = normalizeHisDoctor(getHisCell(row as unknown[], headerMap, ['ptvchinh']));

    if (!patientId || !cathMethod || !cathDate) {
      skippedInvalid++;
      rowResults.push({
        rowIndex: sheetRowIndex,
        patientId,
        patientName,
        cathDate,
        cathMethod,
        diagnosisID: '',
        postDiagnosis,
        ptvMain,
        status: 'skipped_invalid',
        detail: invalidDetail(patientId, cathMethod, cathDate),
      });
      return;
    }

    const importKey = buildCathImportKey(patientId, cathDate, cathMethod);
    const dateOnlyKey = buildCathImportDateKey(patientId, cathDate);
    if (importedKeys.has(importKey)) {
      skippedExisting++;
      pushSkipped(sheetRowIndex, patientId, patientName, cathMethod, cathDate, postDiagnosis, ptvMain, 'Trùng dòng trong file import');
      return;
    }

    let patient = findPatientByHisId(patientId, currentPatients);
    const existingCath = patient
      ? findExistingCathForHisMerge(patient.PatientKey, cathDate, currentCathlabs)
      : undefined;

    if (existingCath && shouldSkipDuplicateHisImport(existingCath, cathMethod)) {
      skippedExisting++;
      importedKeys.add(importKey);
      importedKeys.add(dateOnlyKey);
      pushSkipped(
        sheetRowIndex,
        patientId,
        patient?.PatientName || patientName,
        cathMethod,
        cathDate,
        postDiagnosis,
        ptvMain,
        `Ca HIS đã có phương pháp tương tự (${existingCath.CathKey})`
      );
      return;
    }

    if (!existingCath && (existingCathKeys.has(importKey) || existingCathKeys.has(dateOnlyKey))) {
      skippedExisting++;
      importedKeys.add(importKey);
      importedKeys.add(dateOnlyKey);
      pushSkipped(
        sheetRowIndex,
        patientId,
        patient?.PatientName || patientName,
        cathMethod,
        cathDate,
        postDiagnosis,
        ptvMain,
        'Ca đã tồn tại trong hệ thống'
      );
      return;
    }

    const isNewPatient = !patient;
    if (!patient) {
      patient = {
        PatientKey: `pat_his_${Date.now()}_${index}`,
        PatientID1: patientId,
        PatientID2: '',
        PatientName: patientName || patientId,
        OtherPatientName: '',
        PatientDOB: parseHisDateOnly(getHisCell(row as unknown[], headerMap, ['ngaysinh'])),
        PatientSex: normalizeHisSex(getHisCell(row as unknown[], headerMap, ['gioitinh'])),
        PatientAddress: DEFAULT_HIS_PATIENT_ADDRESS,
        PatientPhone1: '',
        PatientPhone2: '',
        PatientCreateBy: input.loggedInStaffId || 'HIS_IMPORT',
        PatientCreateTime: new Date().toISOString(),
        Outcome: 'Đã thông',
        PatientAddressDefaultWarning: HIS_ADDRESS_WARNING,
      };
      currentPatients.push(patient);
      patientsToCreate.push(patient);
    }

    const matchedConsult = findBestConsultForHisCath(
      patient.PatientKey,
      cathDate,
      input.consults,
      input.cathlabs
    );
    const autoDiagnosisID = normalizeDiagnosisID(
      matchedConsult?.DiagnosisID || classifyDiagnosisText(postDiagnosis, preDiagnosis)
    );
    const cathPayload: CathLab = {
      CathKey: `cath_his_${Date.now()}_${index}`,
      PatientKey: patient.PatientKey,
      ConsultKey: matchedConsult?.ConsultKey || '',
      CathDate: cathDate,
      DiagnosisID: autoDiagnosisID,
      PostDiagnosisID: autoDiagnosisID,
      PostDiagnosis: postDiagnosis,
      CathResultID: 'Thành công',
      CathMethod: cathMethod as CathLab['CathMethod'],
      CathPlan: 'Tái khám thường',
      CathNote: matchedConsult
        ? `Import từ file thủ thuật HIS; đối soát ConsultKey=${matchedConsult.ConsultKey}`
        : 'Import từ file thủ thuật HIS; chưa tìm thấy hội chẩn phù hợp để đối soát',
      _1stInterventionist: ptvMain,
      _2ndInterventionist: normalizeHisDoctor(getHisCell(row as unknown[], headerMap, ['ptv1'])),
      _3rdInterventionist: normalizeHisDoctor(getHisCell(row as unknown[], headerMap, ['ptv2'])),
      _4thInterventionist: '',
      PlannedFollowUpDate: '',
      CathUpdatedBy: input.loggedInStaffId,
      CathUpdatedTime: new Date().toISOString(),
    };

    let workflowClosed = false;
    let workflowStageLabel = '';

    if (existingCath) {
      const merged = mergeHisIntoExistingCath(existingCath, cathPayload, matchedConsult?.ConsultKey);
      upsertCathInMemory(merged);
      queueCathUpdate(merged);
      importedKeys.add(importKey);
      importedKeys.add(dateOnlyKey);
      existingCathKeys.add(importKey);
      existingCathKeys.add(dateOnlyKey);
      if (matchedConsult) {
        const stage = getHisWorkflowStage(matchedConsult);
        workflowClosed = true;
        workflowStageLabel = stage;
        consultsToAutoClose.push({
          consult: matchedConsult,
          patient,
          cath: merged,
          stage,
          patch: buildHisAutoCloseConsultPatch(matchedConsult, merged, stage, input.loggedInStaffId),
        });
      }
      rowResults.push({
        rowIndex: sheetRowIndex,
        patientId,
        patientName: patient.PatientName || patientName,
        cathDate,
        cathMethod,
        diagnosisID: autoDiagnosisID,
        postDiagnosis,
        ptvMain,
        status: 'merged',
        detail: `Gộp vào ca ${existingCath.CathKey}`,
        consultKey: matchedConsult?.ConsultKey,
        cathKey: merged.CathKey,
        newPatient: isNewPatient,
        workflowClosed,
        workflowStage: workflowStageLabel,
      });
      return;
    }

    cathlabsToCreate.push(cathPayload);
    upsertCathInMemory(cathPayload);
    if (matchedConsult) {
      const stage = getHisWorkflowStage(matchedConsult);
      workflowClosed = true;
      workflowStageLabel = stage;
      consultsToAutoClose.push({
        consult: matchedConsult,
        patient,
        cath: cathPayload,
        stage,
        patch: buildHisAutoCloseConsultPatch(matchedConsult, cathPayload, stage, input.loggedInStaffId),
      });
    }
    rowResults.push({
      rowIndex: sheetRowIndex,
      patientId,
      patientName: patient.PatientName || patientName,
      cathDate,
      cathMethod,
      diagnosisID: autoDiagnosisID,
      postDiagnosis,
      ptvMain,
      status: 'created',
      detail: matchedConsult
        ? `Đối soát ConsultKey=${matchedConsult.ConsultKey}`
        : 'Chưa tìm thấy hội chẩn phù hợp',
      consultKey: matchedConsult?.ConsultKey,
      cathKey: cathPayload.CathKey,
      newPatient: isNewPatient,
      workflowClosed,
      workflowStage: workflowStageLabel,
    });
    importedKeys.add(importKey);
    importedKeys.add(dateOnlyKey);
    existingCathKeys.add(importKey);
    existingCathKeys.add(dateOnlyKey);
  });

  return {
    rows: rowResults,
    patientsToCreate,
    cathlabsToCreate,
    cathlabsToUpdate,
    consultsToAutoClose,
    skippedExisting,
    skippedInvalid,
    hasWork: patientsToCreate.length > 0 || cathlabsToCreate.length > 0 || cathlabsToUpdate.length > 0,
  };
}

const resolveResponsibleStaffForHisStage = (
  consult: Consult,
  stage: HisWorkflowStage,
  cathPayload: CathLab,
  staffList: Staff[]
): Staff | undefined => {
  if (stage === 'missing_staff_result') {
    return (
      resolveStaffByNameOrKey(consult.RequestBy, staffList) ||
      resolveStaffByNameOrKey(consult.ConsultCreateBy, staffList)
    );
  }
  if (stage === 'scheduler_missing_transfer') {
    return (
      resolveStaffByNameOrKey(consult.CheckDeviceBy, staffList) ||
      resolveStaffByNameOrKey(consult.CheckDeviceUpdatedBy, staffList) ||
      resolveStaffByNameOrKey(consult.Scheduled2ndInterventionist, staffList) ||
      staffList.find(staff => String(staff.StaffRolePreset || '').includes('dieu-phoi')) ||
      resolveStaffByNameOrKey(consult.RequestBy, staffList)
    );
  }
  return (
    resolveStaffByNameOrKey(cathPayload._1stInterventionist, staffList) ||
    resolveStaffByNameOrKey(cathPayload._2ndInterventionist, staffList) ||
    resolveStaffByNameOrKey(consult.Scheduled1stInterventionist, staffList) ||
    resolveStaffByNameOrKey(consult.Scheduled2ndInterventionist, staffList) ||
    resolveStaffByNameOrKey(consult.RequestBy, staffList)
  );
};

export function buildHisWorkflowNotificationAndMarkOperations(
  consult: Consult,
  patient: Patient,
  cathPayload: CathLab,
  stage: HisWorkflowStage,
  staffList: Staff[],
  loggedInStaffId: string
): BatchWriteOperation[] {
  const responsible = resolveResponsibleStaffForHisStage(consult, stage, cathPayload, staffList);
  const adminStaff = staffList.filter(staff => String(staff.Role || '').toLowerCase() === 'admin');
  const recipients = new Map<string, Staff>();
  if (responsible) recipients.set(responsible.StaffKey, responsible);
  adminStaff.forEach(staff => recipients.set(staff.StaffKey, staff));

  const baseDedup = `his-auto-close:${consult.ConsultKey}:${cathPayload.CathDate}:${stage}`;
  const title = HIS_IMPORT_AUTO_CLOSE_NOTIFY_TITLE;
  const message = buildHisImportNotificationMessage({
    patientName: patient.PatientName || '',
    diagnosisID: consult.DiagnosisID,
    cathDateFormatted: formatVNTime(cathPayload.CathDate),
    stage,
  });
  const operations: BatchWriteOperation[] = [];

  Array.from(recipients.values()).forEach(staff => {
    operations.push({
      endpoint: 'notifications',
      method: 'POST',
      data: {
        NotificationKey: `notif_${baseDedup}:${staff.StaffKey}`.replace(/[^a-zA-Z0-9_-]/g, '_'),
        StaffKey: staff.StaffKey,
        StaffName: staff.StaffName,
        Title: title,
        Message: message,
        Severity: getHisImportNotificationSeverity(stage),
        RelatedEntityType: 'Consult',
        RelatedEntityKey: consult.ConsultKey,
        PatientKey: patient.PatientKey,
        PatientID: patient.PatientID1,
        PatientName: patient.PatientName,
        DedupKey: `${baseDedup}:notify:${staff.StaffKey}`,
        IsRead: false,
        CreatedTime: new Date().toISOString(),
        ReadTime: '',
      },
    });
  });

  if (responsible) {
    operations.push({
      endpoint: 'doctor-performance-marks',
      method: 'POST',
      data: {
        MarkKey: `mark_${baseDedup}:${responsible.StaffKey}`.replace(/[^a-zA-Z0-9_-]/g, '_'),
        StaffKey: responsible.StaffKey,
        StaffName: responsible.StaffName,
        MarkType: stage,
        Score: getHisImportMarkScore(stage),
        Label: getHisStageLabel(stage),
        Reason: message,
        RelatedEntityType: 'Consult',
        RelatedEntityKey: consult.ConsultKey,
        PatientKey: patient.PatientKey,
        PatientID: patient.PatientID1,
        PatientName: patient.PatientName,
        DedupKey: `${baseDedup}:mark:${responsible.StaffKey}`,
        CreatedBy: loggedInStaffId || 'HIS_IMPORT',
        CreatedTime: new Date().toISOString(),
      },
    });
  }

  return operations;
}

export const HIS_IMPORT_ROW_STATUS_LABELS: Record<HisImportRowStatus, string> = {
  created: 'Tạo mới',
  merged: 'Gộp ca',
  skipped_existing: 'Bỏ qua (đã có)',
  skipped_invalid: 'Bỏ qua (thiếu DL)',
};
