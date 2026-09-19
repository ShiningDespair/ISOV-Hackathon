// ---------------------------------------------------------------------
// PDF SABLONLARI — tek giris noktasi
//
// `renderTemplate(tip, model)` cagrilir; bilinmeyen tip haftalika duser
// (rapor uretimi de ayni varsayilani kullaniyor: reportService
// PERIOD_LABELS'ta tanimsiz tip -> 'haftalik').
// ---------------------------------------------------------------------
import { renderGunluk, MAX_ITEMS as GUNLUK_MAX_ITEMS } from './gunluk.js';
import { renderHaftalik } from './haftalik.js';

export const TEMPLATE_TYPES = Object.freeze(['gunluk', 'haftalik']);

export function normalizeTemplateType(value) {
  const s = String(value || '').toLowerCase();
  return TEMPLATE_TYPES.includes(s) ? s : 'haftalik';
}

export function renderTemplate(tip, model = {}) {
  return normalizeTemplateType(tip) === 'gunluk'
    ? renderGunluk(model)
    : renderHaftalik(model);
}

export { renderGunluk, renderHaftalik, GUNLUK_MAX_ITEMS };
export default { renderTemplate, normalizeTemplateType, TEMPLATE_TYPES };
