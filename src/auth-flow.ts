export function passwordChecks(password: string) {
  return {
    length: password.length >= 8,
    mixed: /[A-Za-z]/.test(password) && /\d/.test(password),
  };
}

export function passwordStrength(password: string) {
  if (!password) return 0;
  const checks = passwordChecks(password);
  if (!checks.length || !checks.mixed) return 1;
  if (password.length < 12) return 2;
  return /[^A-Za-z\d]/.test(password) || (/[a-z]/.test(password) && /[A-Z]/.test(password)) ? 4 : 3;
}

export function isExistingSignup(
  error: { code?: string; message?: string } | null,
  identities: unknown,
) {
  if (error) {
    return error.code === "email_exists" || error.code === "user_already_exists" || /user already registered/i.test(error.message ?? "");
  }
  return Array.isArray(identities) && identities.length === 0;
}
