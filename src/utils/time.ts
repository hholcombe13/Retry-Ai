export const nowUtc = (): Date => new Date();

export const toIso = (date: Date): string => date.toISOString();

export const addMinutes = (date: Date, minutes: number): Date => {
  return new Date(date.getTime() + minutes * 60 * 1000);
};

export const addHours = (date: Date, hours: number): Date => {
  return new Date(date.getTime() + hours * 60 * 60 * 1000);
};

export const addDays = (date: Date, days: number): Date => {
  return new Date(date.getTime() + days * 24 * 60 * 60 * 1000);
};

export const fromIso = (value: string | null): Date | null => {
  if (!value) return null;
  return new Date(value);
};

export const isPast = (value: string | null | undefined): boolean => {
  if (!value) return false;
  return new Date(value).getTime() <= Date.now();
};
