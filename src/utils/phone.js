export const normalizeJid = (number) => {
  if (!number) return number;
  let clean = number.toString().replace(/[\+\s\-]/g, '');
  if (!clean.includes('@')) {
    clean += '@s.whatsapp.net';
  }
  return clean;
};

export const isValidPhone = (number) => {
  if (!number) return false;
  const clean = number.toString().replace(/[\+\s\-]/g, '').split('@')[0];
  return /^\d{7,15}$/.test(clean);
};
