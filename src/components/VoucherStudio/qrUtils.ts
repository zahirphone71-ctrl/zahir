export function buildAutoLoginQrUrl(
  loginUrl: string,
  code: string,
  pin?: string,
  authMode?: string
): string {
  const safeUrl = (loginUrl || '10.0.0.1')
    .trim()
    .replace(/^(https?:\/\/)+/i, '')
    .replace(/[<>"'`\s]/g, '')
    .slice(0, 200);

  let hostAndPath = safeUrl;
  if (!hostAndPath.includes('/')) {
    hostAndPath += '/login';
  }

  const password =
    authMode === 'user_only'
      ? (pin || '')
      : authMode === 'user_pass' && pin
      ? pin
      : (pin || code);
  const encodedUser = encodeURIComponent((code || '').slice(0, 64));
  const encodedPass = encodeURIComponent((password || '').slice(0, 64));

  const separator = hostAndPath.includes('?') ? '&' : '?';
  return `http://${hostAndPath}${separator}username=${encodedUser}&password=${encodedPass}&autologin=1`;
}
