export const PASSWORD_RECOVERY_KEY = "malloc_password_recovery_pending";

export function hasPasswordRecoveryMarker(search: string, hash: string) {
  const searchParams = new URLSearchParams(search);
  const hashParams = new URLSearchParams(hash.replace(/^#/, ""));

  return (
    searchParams.get("auth_mode") === "reset-password" ||
    searchParams.get("type") === "recovery" ||
    hashParams.get("type") === "recovery"
  );
}

export function markPasswordRecoveryPending() {
  if (typeof window === "undefined") return;
  window.sessionStorage.setItem(PASSWORD_RECOVERY_KEY, "true");
}

export function consumePasswordRecoveryPending() {
  if (typeof window === "undefined") return false;
  const isPending =
    window.sessionStorage.getItem(PASSWORD_RECOVERY_KEY) === "true";
  if (isPending) {
    window.sessionStorage.removeItem(PASSWORD_RECOVERY_KEY);
  }
  return isPending;
}
