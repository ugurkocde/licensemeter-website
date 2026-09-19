"use client";

import { useSearchParams } from "next/navigation";
import { useState } from "react";

import { Button } from "~/components/ui";

const CLAIM_REQUEST_PATH = "/api/auth/claim/request";

type State = "idle" | "sending" | "sent" | "limited" | "failed";

/**
 * Shown after sign-in to someone whose earlier LicenseMeter membership could
 * not be linked to their Microsoft account automatically. One button asks for a
 * one-time link to the address on that membership. The confirmation is the same
 * whatever the server found, so the card never confirms which addresses have an
 * account. Without JavaScript the form posts to the same route natively, and a
 * route that answers such a post with a redirect to ?claim=sent lands on the
 * same confirmation.
 */
export const ClaimMembershipCard = ({ email }: { email?: string | null }) => {
  const sentByFormPost = useSearchParams().get("claim") === "sent";
  const [state, setState] = useState<State>(sentByFormPost ? "sent" : "idle");

  const request = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setState("sending");
    try {
      const res = await fetch(CLAIM_REQUEST_PATH, {
        method: "POST",
        headers: { accept: "application/json" },
      });
      setState(res.ok ? "sent" : res.status === 429 ? "limited" : "failed");
    } catch {
      setState("failed");
    }
  };

  return (
    <aside
      aria-labelledby="claim-title"
      className="border-line bg-card shadow-card mb-6 rounded-2xl border p-5 sm:p-6"
    >
      <h2
        id="claim-title"
        className="text-[17px] font-semibold tracking-tight text-balance"
      >
        We found an existing LicenseMeter account for this email address
      </h2>
      {state === "sent" ? (
        <p role="status" className="text-ink-soft mt-2 max-w-2xl text-sm">
          Check your inbox{email ? ` at ${email}` : ""}. If the address has an
          account, the link is on its way. It works once and only for a short
          time, and it opens your earlier workspace with this sign-in.
        </p>
      ) : (
        <>
          <p className="text-ink-soft mt-2 max-w-2xl text-sm">
            Confirm it is yours: we send a one-time link to{" "}
            {email ? (
              <span className="text-ink font-medium [overflow-wrap:anywhere]">
                {email}
              </span>
            ) : (
              "that address"
            )}
            . Your earlier workspace and its history are linked to this sign-in
            once you open it.
          </p>
          <form
            action={CLAIM_REQUEST_PATH}
            method="post"
            onSubmit={request}
            className="mt-4"
          >
            <Button
              type="submit"
              variant="primary"
              disabled={state === "sending"}
              className="w-full sm:w-auto"
            >
              {state === "sending" ? "Sending the link" : "Send me the link"}
            </Button>
          </form>
          {(state === "limited" || state === "failed") && (
            <p role="alert" className="text-danger-text mt-3 text-sm">
              {state === "limited"
                ? "A link was requested several times already. Please wait a few minutes before asking again."
                : "The link could not be sent just now. Please try again in a moment."}
            </p>
          )}
        </>
      )}
    </aside>
  );
};
