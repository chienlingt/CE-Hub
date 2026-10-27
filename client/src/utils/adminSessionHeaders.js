export function adminSessionHeaders() {
  try {
    const token = JSON.parse(sessionStorage.getItem('adminSession'))?.token;
    return token ? { Authorization: `Bearer ${token}` } : {};
  } catch { return {}; }
}
