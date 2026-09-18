"use client";

import Script from "next/script";
import Link from "next/link";
import { buttonClass } from "~/components/ui";
import { SUPPORT_EMAIL } from "~/lib/support";
import { useEffect, useRef, useState, type FormEvent } from "react";

type Turnstile = {
  render: (element: HTMLElement, options: Record<string, unknown>) => string;
  reset: (id: string) => void;
  remove: (id: string) => void;
};

export function SupportForm({
  siteKey,
  nonce,
  supportEmail = SUPPORT_EMAIL,
}: {
  siteKey?: string;
  nonce?: string;
  supportEmail?: string;
}) {
  const container = useRef<HTMLDivElement>(null);
  const widget = useRef<string | null>(null);
  const submitting = useRef(false);
  const requestId = useRef<string | null>(null);
  const [ready, setReady] = useState(false);
  const [token, setToken] = useState("");
  const [pending, setPending] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState("");
  const api = () => (window as Window & { turnstile?: Turnstile }).turnstile;

  useEffect(() => {
    const turnstile = api();
    if (!siteKey || !ready || !container.current || !turnstile || sent) return;
    widget.current = turnstile.render(container.current, {
      sitekey: siteKey,
      action: "support",
      theme: "light",
      callback: (value: string) => {
        setToken(value);
      },
      "expired-callback": () => setToken(""),
      "error-callback": () => {
        setToken("");
        setError(
          `Verification could not load. Try again or email ${supportEmail}.`,
        );
      },
    });
    return () => {
      if (widget.current !== null) turnstile.remove(widget.current);
      widget.current = null;
    };
  }, [ready, siteKey, sent, supportEmail]);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (submitting.current || (siteKey && !token)) return;
    submitting.current = true;
    setPending(true);
    setError("");
    const data = new FormData(event.currentTarget);
    requestId.current ??= crypto.randomUUID();
    try {
      const response = await fetch("/api/support", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: data.get("name"),
          email: data.get("email"),
          subject: data.get("subject"),
          message: data.get("message"),
          website: data.get("website"),
          token,
          requestId: requestId.current,
        }),
        signal: AbortSignal.timeout(30000),
      });
      const result = (await response.json()) as {
        success?: boolean;
        error?: string;
      };
      if (!response.ok || result.success !== true)
        throw new Error(
          result.error ?? "Your request could not be sent. Please try again.",
        );
      setSent(true);
    } catch (cause) {
      setError(
        cause instanceof Error && cause.name === "Error"
          ? cause.message
          : `We could not confirm your request was sent. Try again or email ${supportEmail}.`,
      );
      setToken("");
      if (widget.current !== null) api()?.reset(widget.current);
    } finally {
      submitting.current = false;
      setPending(false);
    }
  }

  if (sent)
    return (
      <div
        role="status"
        className="border-brand/20 bg-brand-soft rounded-2xl border p-8"
      >
        <h2 className="text-ink text-xl font-semibold">Support request sent</h2>
        <p className="text-ink-soft mt-3">
          Thank you for getting in touch. We’ll reply to the email address you
          provided.
        </p>
        <Link
          href="/"
          className="text-brand-deep mt-6 inline-flex min-h-11 items-center font-semibold underline underline-offset-4"
        >
          Back to home
        </Link>
      </div>
    );

  const inputClass =
    "mt-2 block min-h-11 w-full rounded-lg border border-line-input bg-card px-3 py-2.5 text-base text-ink focus-visible:border-brand focus-visible:ring-2 focus-visible:ring-brand/40 focus-visible:ring-offset-2 focus-visible:ring-offset-card focus-visible:outline-none";
  return (
    <>
      {siteKey && (
        <Script
          src="https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit"
          nonce={nonce}
          onReady={() => setReady(true)}
          onError={() =>
            setError(
              `Verification could not load. Please email ${supportEmail}.`,
            )
          }
        />
      )}
      <form onSubmit={submit} className="space-y-6" aria-busy={pending}>
        <fieldset disabled={pending} className="space-y-6">
          <div className="grid gap-6 sm:grid-cols-2">
            <label
              className="text-ink block text-sm font-semibold"
              htmlFor="support-name"
            >
              Name
              <input
                id="support-name"
                name="name"
                autoComplete="name"
                required
                maxLength={100}
                className={inputClass}
              />
            </label>
            <label
              className="text-ink block text-sm font-semibold"
              htmlFor="support-email"
            >
              Email address
              <input
                id="support-email"
                name="email"
                type="email"
                autoComplete="email"
                required
                maxLength={254}
                className={inputClass}
              />
            </label>
          </div>
          <label
            className="text-ink block text-sm font-semibold"
            htmlFor="support-subject"
          >
            Subject
            <input
              id="support-subject"
              name="subject"
              required
              maxLength={160}
              className={inputClass}
            />
          </label>
          <label
            className="text-ink block text-sm font-semibold"
            htmlFor="support-message"
          >
            Message
            <textarea
              id="support-message"
              name="message"
              required
              maxLength={10000}
              rows={7}
              aria-describedby="support-message-hint"
              className={inputClass}
            />
          </label>
          <p
            id="support-message-hint"
            className="text-ink-soft text-sm leading-6"
          >
            Describe what happened and what you expected. Please leave out
            passwords, access tokens, and tenant data.
          </p>
          <div hidden aria-hidden="true">
            <label htmlFor="support-website">Website</label>
            <input
              id="support-website"
              name="website"
              tabIndex={-1}
              autoComplete="off"
            />
          </div>
        </fieldset>
        <div ref={container} />
        {error && (
          <p role="alert" className="text-danger-text text-sm">
            {error}
          </p>
        )}
        <p className="text-ink-soft text-sm leading-6">
          We use your details to respond to your request. Read our{" "}
          <Link
            href="/privacy"
            className="text-brand-deep underline underline-offset-4"
          >
            privacy policy
          </Link>
          .
        </p>
        <button
          type="submit"
          disabled={pending || Boolean(siteKey && !token)}
          className={buttonClass("primary")}
        >
          {pending ? "Sending…" : "Send support request"}
        </button>
      </form>
    </>
  );
}
