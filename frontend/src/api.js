const BASE = import.meta.env.VITE_API_URL || '';

export function getSession() {
  try {
    return JSON.parse(localStorage.getItem('session'));
  } catch {
    return null;
  }
}
export const setSession = (s) =>
  s ? localStorage.setItem('session', JSON.stringify(s)) : localStorage.removeItem('session');

export async function api(method, path, body) {
  const s = getSession();
  const res = await fetch(BASE + '/api' + path, {
    method,
    headers: { 'Content-Type': 'application/json', ...(s && { Authorization: 'Bearer ' + s.token }) },
    body: body && JSON.stringify(body),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || 'Something went wrong');
  return data;
}
