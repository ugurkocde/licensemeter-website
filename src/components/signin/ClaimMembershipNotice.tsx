import { Suspense } from "react";

import { pendingClaimFor } from "~/server/access";
import { auth } from "~/server/auth";

import { ClaimMembershipCard } from "./ClaimMembershipCard";

/**
 * Server mount of the claim card: renders nothing unless the signed-in person
 * has an earlier membership that still waits for their confirmation.
 */
export const ClaimMembershipNotice = async () => {
  const session = await auth();
  if (!session?.user || session.user.isDemo) return null;
  if (!(await pendingClaimFor(session))) return null;
  // The card reads the query string, which needs a boundary of its own.
  return (
    <Suspense fallback={null}>
      <ClaimMembershipCard email={session.user.email} />
    </Suspense>
  );
};
