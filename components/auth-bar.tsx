"use client";

import { useState } from "react";
import { createClient, hasSupabaseConfig } from "@/lib/supabase/client";
import type { User } from "@supabase/supabase-js";
import type { SyncStatus } from "@/lib/types";
import {
  LogOut,
  Mail,
  Lock,
  Loader2,
  Cloud,
  CloudOff,
  RefreshCw,
} from "lucide-react";

interface AuthBarProps {
  user: User | null;
  syncStatus: SyncStatus;
  onAuthChange: () => void;
}

export function AuthBar({ user, syncStatus, onAuthChange }: AuthBarProps) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [mode, setMode] = useState<"login" | "signup">("login");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");

  const supabase = createClient();
  const authEnabled = hasSupabaseConfig() && supabase;

  const handleSubmit = async () => {
    if (!authEnabled) return;
    if (!email.trim() || !password.trim()) return;
    setLoading(true);
    setError("");
    setMessage("");

    if (mode === "signup") {
      const { data, error: authError } = await supabase.auth.signUp({
        email: email.trim(),
        password: password.trim(),
      });

      setLoading(false);
      if (authError) {
        setError(authError.message);
      } else if (data.session) {
        // Email confirmation is disabled - user is auto-confirmed
        setEmail("");
        setPassword("");
        setMessage("");
        onAuthChange();
      } else {
        setMessage(
          "Account created! Check your email to confirm, then log in. (Tip: disable email confirmation in Supabase dashboard to skip this.)"
        );
        setMode("login");
        setPassword("");
      }
    } else {
      console.log("[v0] Attempting login with email:", email.trim());
      const { data, error: authError } = await supabase.auth.signInWithPassword({
        email: email.trim(),
        password: password.trim(),
      });

      console.log("[v0] Login result - data:", data, "error:", authError);
      setLoading(false);
      if (authError) {
        console.log("[v0] Login error:", authError.message);
        setError(authError.message);
      } else {
        console.log("[v0] Login successful, session:", data.session);
        setEmail("");
        setPassword("");
        setMessage("");
        onAuthChange();
      }
    }
  };

  const handleLogout = async () => {
    if (!authEnabled) return;
    await supabase.auth.signOut();
    onAuthChange();
  };

  const syncIcon = () => {
    switch (syncStatus) {
      case "syncing":
        return <RefreshCw className="h-3.5 w-3.5 animate-spin" />;
      case "synced":
        return <Cloud className="h-3.5 w-3.5" />;
      case "offline":
        return <CloudOff className="h-3.5 w-3.5" />;
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
      case "conflict":
        return "Conflict detected (remote applied)";
      default:
        return "";
    }
  };

  if (user) {
    return (
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
          onClick={handleLogout}
          className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors"
          aria-label="Log out"
        >
          <LogOut className="h-3.5 w-3.5" />
          <span className="hidden sm:inline">Log out</span>
        </button>
      </div>
    );
  }

  if (!authEnabled) {
    return (
      <span className="text-xs text-muted-foreground">Local preview</span>
    );
  }

  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex items-center gap-2 flex-wrap">
        <div className="relative">
          <Mail className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
          <input
            type="email"
            value={email}
            onChange={(e) => {
              setEmail(e.target.value);
              setError("");
            }}
            onKeyDown={(e) => {
              if (e.key === "Enter") handleSubmit();
            }}
            placeholder="Email"
            className="w-40 text-xs text-foreground bg-background/50 pl-8 pr-3 py-1.5 rounded sketchy-border-light outline-none focus:ring-2 focus:ring-primary/30 placeholder:text-muted-foreground"
            disabled={loading}
          />
        </div>
        <div className="relative">
          <Lock className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
          <input
            type="password"
            value={password}
            onChange={(e) => {
              setPassword(e.target.value);
              setError("");
            }}
            onKeyDown={(e) => {
              if (e.key === "Enter") handleSubmit();
            }}
            placeholder="Password"
            className="w-32 text-xs text-foreground bg-background/50 pl-8 pr-3 py-1.5 rounded sketchy-border-light outline-none focus:ring-2 focus:ring-primary/30 placeholder:text-muted-foreground"
            disabled={loading}
          />
        </div>
        <button
          type="button"
          onClick={handleSubmit}
          disabled={loading || !email.trim() || !password.trim()}
          className="text-xs font-medium bg-primary text-primary-foreground px-3 py-1.5 hover:bg-primary/90 transition-colors disabled:opacity-50"
          style={{ borderRadius: "8px 6px 10px 6px" }}
        >
          {loading ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
          ) : mode === "login" ? (
            "Log in"
          ) : (
            "Sign up"
          )}
        </button>
      </div>
      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={() => {
            setMode(mode === "login" ? "signup" : "login");
            setError("");
            setMessage("");
          }}
          className="text-xs text-muted-foreground hover:text-foreground transition-colors"
        >
          {mode === "login"
            ? "Need an account? Sign up"
            : "Have an account? Log in"}
        </button>
      </div>
      {error && <p className="text-xs text-destructive">{error}</p>}
      {message && (
        <p className="text-xs text-muted-foreground">{message}</p>
      )}
    </div>
  );
}
