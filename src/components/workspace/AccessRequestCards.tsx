import { JoinRequestNotice } from "./JoinRequestNotice";
import type { accessRequestNoticesOf } from "~/server/domainJoin";

export const AccessRequestCards = ({
  requests,
}: {
  requests: Awaited<ReturnType<typeof accessRequestNoticesOf>>;
}) => (
  <div className="mx-auto max-w-3xl space-y-6 pb-6">
    <header>
      <p className="text-brand-text text-xs font-medium tracking-wider uppercase">
        Your account
      </p>
      <h1 className="font-display text-ink mt-2 text-3xl tracking-tight">
        Workspace access
      </h1>
    </header>
    {requests.map((request) => (
      <JoinRequestNotice
        key={`${request.id}:${request.status}`}
        requestId={request.id}
        workspaceName={request.tenantName ?? "your company’s workspace"}
        status={request.status}
        requestedAt={request.createdAt.toISOString()}
        contacts={request.contacts}
      />
    ))}
  </div>
);
