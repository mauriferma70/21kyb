// server/helpers.js

/**
 * Convierte tiempo en formato H:MM:SS a segundos totales
 * Ej: "1:34:22" → 5662
 */
function timeToSeconds(timeStr) {
  if (!timeStr) return null;
  const parts = timeStr.split(':').map(Number);
  if (parts.length === 3) return parts[0] * 3600 + parts[1] * 60 + parts[2];
  if (parts.length === 2) return parts[0] * 60 + parts[1];
  return null;
}

/**
 * Convierte segundos a H:MM:SS
 * Ej: 5662 → "1:34:22"
 */
function secondsToTime(seconds) {
  if (!seconds) return null;
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = seconds % 60;
  return `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

/**
 * Genera el próximo runner_id en formato RB000001
 * Basado en el último ID en la base de datos
 */
function generateRunnerId(lastNumber) {
  const next = (lastNumber || 0) + 1;
  return 'RB' + String(next).padStart(6, '0');
}

/**
 * Normaliza texto: trim, capitaliza cada palabra, quita espacios dobles
 */
function normalizeName(str) {
  if (!str) return '';
  return str
    .trim()
    .replace(/\s+/g, ' ')
    .toLowerCase()
    .replace(/\b\w/g, c => c.toUpperCase());
}

/**
 * Normaliza DNI: solo números, max 10 dígitos
 */
function normalizeDni(dni) {
  if (!dni) return null;
  return String(dni).replace(/[^0-9]/g, '').slice(0, 10) || null;
}

/**
 * Compara dos nombres ignorando tildes y mayúsculas
 */
function namesMatch(a, b) {
  const normalize = s => s
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim();
  return normalize(a) === normalize(b);
}

module.exports = {
  timeToSeconds,
  secondsToTime,
  generateRunnerId,
  normalizeName,
  normalizeDni,
  namesMatch,
};
