export const clamp = (value, min, max) => Math.min(max, Math.max(min, value));

export const getStoredString = (key, fallbackValue) => {
  if (typeof window === 'undefined' || !window.localStorage) return fallbackValue;
  const value = window.localStorage.getItem(key);
  return value ? value : fallbackValue;
};

export const getStoredNumber = (key, fallbackValue) => {
  if (typeof window === 'undefined' || !window.localStorage) return fallbackValue;
  const value = Number(window.localStorage.getItem(key));
  if (Number.isNaN(value)) return fallbackValue;
  return clamp(value, 0, 100);
};

export const setStoredValue = (key, value) => {
  if (typeof window === 'undefined' || !window.localStorage) return;
  window.localStorage.setItem(key, value);
};
