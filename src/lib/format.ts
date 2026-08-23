const pad = (n: number) => String(n).padStart(2, "0");

export const fmtMoney = (n: number) =>
  "$" +
  (Number.isFinite(n) ? n : 0).toLocaleString("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });

export const fmtQty = (n: number) => {
  if (!Number.isFinite(n)) return "0";
  return Number.isInteger(n) ? String(n) : String(Math.round(n * 1000) / 1000);
};

export const fmtDateTime = (s: string) => {
  const d = new Date(s.replace(" ", "T"));
  if (isNaN(d.getTime())) return s;
  return `${pad(d.getDate())}/${pad(d.getMonth() + 1)}/${d.getFullYear()} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
};

export const fmtDate = (s: string) => {
  const d = new Date(s.replace(" ", "T"));
  if (isNaN(d.getTime())) return s;
  return `${pad(d.getDate())}/${pad(d.getMonth() + 1)}/${d.getFullYear()}`;
};

/** "YYYY-MM-DD" -> "DD/MM" */
export const shortDay = (iso: string) => `${iso.slice(8, 10)}/${iso.slice(5, 7)}`;

export const isoToday = () => {
  const d = new Date();
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
};

export const isoAddDays = (iso: string, days: number) => {
  const d = new Date(iso + "T00:00:00");
  d.setDate(d.getDate() + days);
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
};

export const monthBounds = (offset = 0): [string, string] => {
  const now = new Date();
  const first = new Date(now.getFullYear(), now.getMonth() + offset, 1);
  const last = new Date(now.getFullYear(), now.getMonth() + offset + 1, 0);
  const f = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  return [f(first), f(last)];
};

export const humanSize = (bytes: number) => {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
};

export const errMsg = (e: unknown) =>
  typeof e === "string" ? e : e instanceof Error ? e.message : JSON.stringify(e);
