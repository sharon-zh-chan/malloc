"use client";

import { useEffect, useMemo, useState } from "react";
import type { FormEvent, ReactNode } from "react";
import { useRouter } from "next/navigation";
import { createClient, hasSupabaseConfig } from "@/lib/supabase/client";
import type { User } from "@supabase/supabase-js";
import type { SyncStatus } from "@/lib/types";
import { Button } from "@/components/ui/button";
import { ConfirmModal } from "@/components/confirm-modal";
import {
  consumePasswordRecoveryPending,
  hasPasswordRecoveryMarker,
  markPasswordRecoveryPending,
} from "@/lib/auth-recovery";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import {
  LogOut,
  Mail,
  Lock,
  Loader2,
  Cloud,
  CloudOff,
  RefreshCw,
  KeyRound,
  UserPlus,
} from "lucide-react";

interface AuthBarProps {
  user: User | null;
  syncStatus: SyncStatus;
  onAuthChange: () => void;
  onLogout: () => void;
  onLogoutStart?: () => void;
  renderSignedOut?: (actions: {
    openLogin: () => void;
    openSignup: () => void;
  }) => ReactNode;
}

type AuthMode =
  | "login"
  | "signup"
  | "signup-success"
  | "forgot-password"
  | "reset-password";

const SIGNUP_SUCCESS_KEY = "malloc_signup_success_pending";
const PASSWORD_RESET_SUCCESS_KEY = "malloc_password_reset_success_pending";
const PASSWORD_RESET_EMAIL_KEY = "malloc_password_reset_email";
const LOGOUT_REDIRECT_KEY = "malloc_logout_redirect_pending";

export function AuthBar({
  user,
  syncStatus,
  onAuthChange,
  onLogout,
  onLogoutStart,
  renderSignedOut,
}: AuthBarProps) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [showLogoutConfirm, setShowLogoutConfirm] = useState(false);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [mode, setMode] = useState<AuthMode>("login");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");

  const supabase = createClient();
  const authEnabled = hasSupabaseConfig() && supabase;

  const passwordMeetsRules = useMemo(
    () => password.length >= 8 && /\d/.test(password),
    [password],
  );

  useEffect(() => {
    const searchParams = new URLSearchParams(window.location.search);
    const authMode = searchParams.get("auth_mode");
    const authError = searchParams.get("auth_error");
    const hasPendingSignupSuccess =
      window.sessionStorage.getItem(SIGNUP_SUCCESS_KEY) === "true";
    const hasPendingPasswordResetSuccess =
      window.sessionStorage.getItem(PASSWORD_RESET_SUCCESS_KEY) === "true";
    const hasRecovery =
      hasPasswordRecoveryMarker(window.location.search, window.location.hash) ||
      consumePasswordRecoveryPending();

    if (hasPendingPasswordResetSuccess) {
      const resetEmail =
        window.sessionStorage.getItem(PASSWORD_RESET_EMAIL_KEY) ?? "";
      window.sessionStorage.removeItem(PASSWORD_RESET_SUCCESS_KEY);
      window.sessionStorage.removeItem(PASSWORD_RESET_EMAIL_KEY);
      setEmail(resetEmail);
      setMode("login");
      setOpen(true);
      setMessage(
        "Password reset. Log in with your new password to reopen your workspace.",
      );
      window.history.replaceState({}, "", window.location.pathname);
      return;
    }

    if (hasPendingSignupSuccess) {
      window.sessionStorage.removeItem(SIGNUP_SUCCESS_KEY);
      setMode("signup-success");
      setOpen(true);
      return;
    }

    if (hasRecovery || authMode === "reset-password") {
      setMode("reset-password");
      setOpen(true);
      window.history.replaceState({}, "", window.location.pathname);
    } else if (authError) {
      setError("That auth link did not work. Please request a fresh link.");
      setMode("login");
      setOpen(true);
      window.history.replaceState({}, "", window.location.pathname);
    }
  }, []);

  useEffect(() => {
    if (!authEnabled) return;

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((event) => {
      if (event !== "PASSWORD_RECOVERY") return;

      markPasswordRecoveryPending();
      setMode("reset-password");
      setOpen(true);
      setError("");
      setMessage("");
      setPassword("");
      setConfirmPassword("");
      window.history.replaceState({}, "", window.location.pathname);
      window.setTimeout(() => {
        consumePasswordRecoveryPending();
      }, 0);
    });

    return () => {
      subscription.unsubscribe();
    };
  }, [authEnabled, supabase]);

  const resetForm = (nextMode: AuthMode = "login") => {
    setMode(nextMode);
    setError("");
    setMessage("");
    setPassword("");
    setConfirmPassword("");
  };

  const closeAuthDialog = () => {
    if (document.activeElement instanceof HTMLElement) {
      document.activeElement.blur();
    }
    setOpen(false);
  };

  const authCallbackUrl = (next?: string) => {
    const callback = new URL("/auth/callback", window.location.origin);
    if (next) callback.searchParams.set("next", next);
    return callback.toString();
  };

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!authEnabled) return;
    if (mode !== "reset-password" && !email.trim()) return;
    if (mode !== "forgot-password" && !password) return;

    const authMode = mode;

    setLoading(true);
    setError("");
    setMessage("");

    if (authMode === "signup") {
      if (!passwordMeetsRules) {
        setLoading(false);
        setError("Use at least 8 characters and include a number.");
        return;
      }

      if (password !== confirmPassword) {
        setLoading(false);
        setError("The passwords do not match.");
        return;
      }

      closeAuthDialog();

      const { data, error: authError } = await supabase.auth.signUp({
        email: email.trim(),
        password,
        options: {
          emailRedirectTo: authCallbackUrl(),
        },
      });

      setLoading(false);
      if (authError) {
        setOpen(true);
        setError(authError.message);
      } else if (data.session) {
        setEmail("");
        setPassword("");
        setConfirmPassword("");
        setMessage("");
        window.sessionStorage.setItem(SIGNUP_SUCCESS_KEY, "true");
        setMode("signup-success");
        setOpen(true);
        onAuthChange();
      } else {
        setMode("login");
        setOpen(true);
        setMessage(
          "Account created. You can log in once Supabase has finished setting up your account.",
        );
        setPassword("");
        setConfirmPassword("");
      }
    } else if (authMode === "forgot-password") {
      const { error: authError } = await supabase.auth.resetPasswordForEmail(
        email.trim(),
        {
          redirectTo: authCallbackUrl("/?auth_mode=reset-password"),
        },
      );

      setLoading(false);
      if (authError) {
        setError(authError.message);
      } else {
        setMessage("Check your email for a password reset link.");
        setPassword("");
        setConfirmPassword("");
      }
    } else if (authMode === "reset-password") {
      if (!passwordMeetsRules) {
        setLoading(false);
        setError("Use at least 8 characters and include a number.");
        return;
      }

      if (password !== confirmPassword) {
        setLoading(false);
        setError("The passwords do not match.");
        return;
      }

      closeAuthDialog();

      const { error: authError } = await supabase.auth.updateUser({
        password,
      });

      setLoading(false);
      if (authError) {
        setOpen(true);
        setError(authError.message);
      } else {
        const resetEmail = user?.email ?? "";
        window.sessionStorage.setItem(PASSWORD_RESET_SUCCESS_KEY, "true");
        if (resetEmail) {
          window.sessionStorage.setItem(PASSWORD_RESET_EMAIL_KEY, resetEmail);
        }

        await supabase.auth.signOut();
        setPassword("");
        setConfirmPassword("");
        setEmail(resetEmail);
        setMode("login");
        setOpen(true);
        setMessage(
          "Password reset. Log in with your new password to reopen your workspace.",
        );
        onAuthChange();
      }
    } else {
      closeAuthDialog();

      const { error: authError } = await supabase.auth.signInWithPassword({
        email: email.trim(),
        password,
      });

      setLoading(false);
      if (authError) {
        setOpen(true);
        setError(authError.message);
      } else {
        setEmail("");
        setPassword("");
        setConfirmPassword("");
        setMessage("");
        onAuthChange();
      }
    }
  };

  const openLogin = () => {
    resetForm("login");
    setOpen(true);
  };

  const openSignup = () => {
    resetForm("signup");
    setOpen(true);
  };

  const confirmLogout = async () => {
    if (!authEnabled) return;
    window.sessionStorage.setItem(LOGOUT_REDIRECT_KEY, "true");
    onLogoutStart?.();
    setShowLogoutConfirm(false);
    onLogout();
    await supabase.auth.signOut();
    onAuthChange();
    router.replace("/logged-out");
  };

  const syncIcon = () => {
    switch (syncStatus) {
      case "syncing":
        return <RefreshCw className="h-3.5 w-3.5 animate-spin" />;
      case "synced":
        return <Cloud className="h-3.5 w-3.5" />;
      case "offline":
        return <CloudOff className="h-3.5 w-3.5" />;
      case "error":
        return <CloudOff className="h-3.5 w-3.5 text-destructive" />;
      case "conflict":
        return <CloudOff className="h-3.5 w-3.5 text-destructive" />;
      default:
        return null;
    }
  };

  const syncLabel = () => {
    switch (syncStatus) {
      case "syncing":
        return "Syncing...";
      case "synced":
        return "Synced";
      case "offline":
        return "Offline";
      case "error":
        return "Sync error";
      case "conflict":
        return "Some local changes were not synced";
      default:
        return "";
    }
  };

  const modalTitle =
    mode === "signup"
      ? "Create account"
      : mode === "signup-success"
        ? "You're all set!"
        : mode === "forgot-password"
          ? "Reset password"
          : mode === "reset-password"
            ? "Choose new password"
            : "Log in";

  const modalDescription =
    mode === "signup"
      ? "Use your email and a password with at least 8 characters and 1 number."
      : mode === "signup-success"
        ? (
          <span className="block space-y-1">
            <span className="block">Thanks for signing up.</span>
            <span className="block">Time to allocate your space!</span>
          </span>
        )
        : mode === "forgot-password"
          ? "Enter your email and we will send you a password reset link."
          : mode === "reset-password"
            ? "Enter a new password for your account."
            : "Use your email and password to sync this workspace.";

  const submitLabel =
    mode === "signup"
      ? "Create account"
      : mode === "signup-success"
        ? "Start allocating"
        : mode === "forgot-password"
          ? "Send reset link"
          : mode === "reset-password"
            ? "Update password"
            : "Log in";

  const submitDisabled =
    loading ||
    (mode !== "reset-password" && !email.trim()) ||
    (mode !== "forgot-password" && !password) ||
    ((mode === "signup" || mode === "reset-password") && !confirmPassword);

  const authDialog = authEnabled ? (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogContent className="w-[calc(100vw-2rem)] rounded-none border-foreground bg-card p-5 sm:max-w-md">
        <DialogHeader
          className={
            mode === "signup-success"
              ? "items-center space-y-3 text-center sm:text-center"
              : undefined
          }
        >
          <DialogTitle>{modalTitle}</DialogTitle>
          <DialogDescription>{modalDescription}</DialogDescription>
        </DialogHeader>

        {mode === "signup-success" ? (
          <Button
            type="button"
            onClick={() => setOpen(false)}
            className="h-10 w-full rounded-none"
          >
            {submitLabel}
          </Button>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-4">
            {mode !== "reset-password" && (
              <label className="block space-y-1.5">
                <span className="brand-label">Email</span>
                <div className="relative">
                  <Mail className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                  <Input
                    type="email"
                    value={email}
                    onChange={(e) => {
                      setEmail(e.target.value);
                      setError("");
                    }}
                    placeholder="you@example.com"
                    className="rounded-none border-foreground bg-background pl-10"
                    disabled={loading}
                    autoComplete="email"
                  />
                </div>
              </label>
            )}

            {mode !== "forgot-password" && (
              <label className="block space-y-1.5">
                <span className="brand-label">
                  {mode === "reset-password" ? "New password" : "Password"}
                </span>
                <div className="relative">
                  <Lock className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                  <Input
                    type="password"
                    value={password}
                    onChange={(e) => {
                      setPassword(e.target.value);
                      setError("");
                    }}
                    placeholder="At least 8 characters, 1 number"
                    className="rounded-none border-foreground bg-background pl-10"
                    disabled={loading}
                    autoComplete={
                      mode === "login" ? "current-password" : "new-password"
                    }
                  />
                </div>
              </label>
            )}

            {(mode === "signup" || mode === "reset-password") && (
              <label className="block space-y-1.5">
                <span className="brand-label">Confirm password</span>
                <div className="relative">
                  <Lock className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                  <Input
                    type="password"
                    value={confirmPassword}
                    onChange={(e) => {
                      setConfirmPassword(e.target.value);
                      setError("");
                    }}
                    placeholder="Type it again"
                    className="rounded-none border-foreground bg-background pl-10"
                    disabled={loading}
                    autoComplete="new-password"
                  />
                </div>
              </label>
            )}

            {(mode === "signup" || mode === "reset-password") && (
              <p
                className={`text-xs ${
                  password && !passwordMeetsRules
                    ? "text-destructive"
                    : "text-muted-foreground"
                }`}
              >
                Password must be at least 8 characters and include a number.
              </p>
            )}

            {error && <p className="text-xs text-destructive">{error}</p>}
            {message && <p className="text-xs text-muted-foreground">{message}</p>}

            <Button
              type="submit"
              disabled={submitDisabled}
              className="h-10 w-full rounded-none"
            >
              {loading ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                submitLabel
              )}
            </Button>
          </form>
        )}

        {mode !== "signup-success" && (
          <div className="flex flex-wrap items-center justify-center gap-x-3 gap-y-2 text-xs">
            {mode !== "login" && (
              <button
                type="button"
                onClick={() => resetForm("login")}
                className="text-muted-foreground transition-colors hover:text-foreground"
              >
                Back to log in
              </button>
            )}
            {mode !== "signup" && mode !== "reset-password" && (
              <button
                type="button"
                onClick={() => resetForm("signup")}
                className="text-muted-foreground transition-colors hover:text-foreground"
              >
                Create account
              </button>
            )}
            {mode === "login" && (
              <button
                type="button"
                onClick={() => resetForm("forgot-password")}
                className="text-muted-foreground transition-colors hover:text-foreground"
              >
                Forgot password?
              </button>
            )}
          </div>
        )}
      </DialogContent>
    </Dialog>
  ) : null;

  if (user) {
    return (
      <>
        <div className="flex items-center gap-3 flex-wrap">
          {syncStatus !== "idle" && (
            <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
              {syncIcon()}
              {syncLabel()}
            </span>
          )}

          <span className="text-xs text-muted-foreground truncate max-w-48">
            {user.email}
          </span>
          <button
            type="button"
            onClick={() => setShowLogoutConfirm(true)}
            className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors"
            aria-label="Log out"
          >
            <LogOut className="h-3.5 w-3.5" />
            <span className="hidden sm:inline">Log out</span>
          </button>
        </div>
        {authDialog}
        <ConfirmModal
          open={showLogoutConfirm}
          title="Log out?"
          message="Are you sure you want to log out?"
          confirmLabel="Log out"
          onConfirm={confirmLogout}
          onCancel={() => setShowLogoutConfirm(false)}
        />
      </>
    );
  }

  if (!authEnabled) {
    return (
      <span className="text-xs text-muted-foreground">Local preview</span>
    );
  }

  return (
    <>
      {renderSignedOut ? (
        renderSignedOut({ openLogin, openSignup })
      ) : (
        <div className="flex items-center justify-end gap-2">
          <Button
            type="button"
            size="sm"
            onClick={openLogin}
            className="h-8 rounded-none px-3 text-xs"
          >
            <KeyRound className="h-3.5 w-3.5" />
            Log in
          </Button>
          <Button
            type="button"
            size="sm"
            variant="outline"
            onClick={openSignup}
            className="h-8 rounded-none px-3 text-xs"
          >
            <UserPlus className="h-3.5 w-3.5" />
            Sign up
          </Button>
        </div>
      )}

      {authDialog}
    </>
  );
}
