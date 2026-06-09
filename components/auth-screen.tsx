"use client";

import { AuthBar } from "./auth-bar";

interface AuthScreenProps {
  onAuthChange: () => void;
  onStartLocalPreview?: () => void;
}

export function AuthScreen({
  onAuthChange,
  onStartLocalPreview,
}: AuthScreenProps) {
  return (
    <main className="min-h-screen bg-background">
      <div className="flex min-h-screen flex-col">
        <header className="border-b brand-rule bg-card px-4 py-5 md:px-8">
          <img
            src="/brand/malloc-wordmark.svg"
            alt="malloc - Space for what's on your mind."
            className="h-16 w-auto sm:h-[76px]"
          />
        </header>

        <section className="brand-panel-grid flex flex-1 items-center px-4 py-10 md:px-8">
          <div className="mx-auto w-full max-w-2xl">
            <p className="brand-label mb-3">Welcome</p>
            <h1 className="text-3xl font-semibold leading-tight sm:text-4xl">
              Hello, welcome to Malloc!
            </h1>
            <p className="mt-5 max-w-xl text-base leading-7 text-muted-foreground">
              This is the space for capturing tasks, notepad notes and whatever
              is on your mind.
            </p>
            <AuthBar
              user={null}
              syncStatus="idle"
              onAuthChange={onAuthChange}
              onLogout={() => {}}
              renderSignedOut={({ openLogin, openSignup }) => (
                <p className="mt-6 max-w-xl text-base leading-7 text-muted-foreground">
                  <button
                    type="button"
                    onClick={openSignup}
                    className="font-semibold text-primary underline-offset-4 transition-colors hover:text-primary/80 hover:underline"
                  >
                    Sign up
                  </button>{" "}
                  to get started, or{" "}
                  <button
                    type="button"
                    onClick={openLogin}
                    className="font-semibold text-primary underline-offset-4 transition-colors hover:text-primary/80 hover:underline"
                  >
                    log in
                  </button>{" "}
                  to continue.
                </p>
              )}
            />
            {onStartLocalPreview && (
              <button
                type="button"
                onClick={onStartLocalPreview}
                className="mt-5 inline-flex border border-foreground bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground transition-colors hover:bg-primary/90"
              >
                Open local workspace
              </button>
            )}
            <p className="mt-8 text-base text-foreground">Enjoy!</p>
          </div>
        </section>
      </div>
    </main>
  );
}
