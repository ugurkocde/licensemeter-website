import type { Metadata } from "next";

import { CopyBlock } from "~/components/mcp/CopyBlock";
import { CreateTokenForm } from "~/components/mcp/CreateTokenForm";
import { RevokeTokenButton } from "~/components/mcp/RevokeTokenButton";
import { Card } from "~/components/ui";
import { FeatureLockPanel } from "~/components/workspace/FeatureLock";
import { siteUrl } from "~/env";
import { fmtAgo, fmtDate } from "~/lib/format";
import { hasRole, requireAccess } from "~/server/access";
import { hasFeature } from "~/server/entitlement";
import {
  listTokens,
  MAX_ACTIVE_TOKENS,
  TOKEN_NAME_MAX,
  type TokenSummary,
} from "~/server/mcp/tokens";

export const metadata: Metadata = { title: "MCP server" };

const TokenTable = ({
  tokens,
  canManage,
}: {
  tokens: TokenSummary[];
  canManage: boolean;
}) => (
  <div className="overflow-x-auto">
    <table className="w-full text-sm">
      <thead>
        <tr className="text-ink-faint text-left text-xs">
          <th scope="col" className="py-2 pr-4 font-medium">
            Name
          </th>
          <th scope="col" className="py-2 pr-4 font-medium">
            Token
          </th>
          <th scope="col" className="py-2 pr-4 font-medium">
            Created
          </th>
          <th scope="col" className="py-2 pr-4 font-medium">
            Last used
          </th>
          {canManage && (
            <th scope="col" className="py-2 text-right font-medium">
              <span className="sr-only">Actions</span>
            </th>
          )}
        </tr>
      </thead>
      <tbody>
        {tokens.map((t) => (
          <tr key={t.id} className="border-line border-t">
            <td className="py-2 pr-4 font-medium">{t.name}</td>
            <td className="py-2 pr-4 font-mono text-xs">{t.tokenPrefix}…</td>
            <td className="text-ink-soft py-2 pr-4">{fmtDate(t.createdAt)}</td>
            <td className="text-ink-soft py-2 pr-4">
              {t.lastUsedAt ? fmtAgo(t.lastUsedAt) : "Never"}
            </td>
            {canManage && (
              <td className="py-2 text-right">
                <RevokeTokenButton tokenId={t.id} tokenName={t.name} />
              </td>
            )}
          </tr>
        ))}
      </tbody>
    </table>
  </div>
);

export default async function McpPage() {
  const ctx = await requireAccess("viewer");
  // The shared demo grants every visitor a role, so its tokens stay fixed.
  const canManage = hasRole(ctx, "admin") && !ctx.tenant.isDemo;
  const tokens = await listTokens(ctx.tenant.id);

  if (!hasFeature(ctx.entitlement, "mcp")) {
    return (
      <div className="mx-auto flex max-w-4xl flex-col gap-6 pb-8">
        <FeatureLockPanel
          feature="mcp"
          overQuantity={ctx.entitlement.state === "overQuantity"}
        />
        {/* Tokens from an earlier plan are refused by the endpoint, and can
            still be revoked here. */}
        {tokens.length > 0 && (
          <Card title="Existing tokens">
            <p className="text-ink-soft mb-3 text-sm">
              The endpoint refuses these tokens while the plan does not include
              the MCP server. They work again after an upgrade, unless you
              revoke them.
            </p>
            <TokenTable tokens={tokens} canManage={canManage} />
          </Card>
        )}
      </div>
    );
  }

  const endpoint = `${siteUrl().replace(/\/$/, "")}/api/mcp`;
  const snippet = JSON.stringify(
    {
      mcpServers: {
        licensemeter: {
          type: "http",
          url: endpoint,
          headers: { Authorization: "Bearer YOUR_TOKEN" },
        },
      },
    },
    null,
    2,
  );

  return (
    <div className="mx-auto flex max-w-4xl flex-col gap-6 pb-8">
      <header className="rise rise-1">
        <h1 className="font-display text-3xl tracking-tight">MCP server</h1>
        <p className="text-ink-soft mt-1 max-w-2xl text-sm">
          A read-only Model Context Protocol endpoint for this workspace. An MCP
          client can query waste, findings, trends and the license inventory. It
          cannot change anything, and a token only ever reads this workspace.
        </p>
      </header>

      <div className="rise rise-2 flex flex-col gap-6">
        <Card title="Connect a client">
          <div className="flex flex-col gap-4">
            <div>
              <h3 className="text-ink-faint mb-1 text-xs">Endpoint</h3>
              <CopyBlock label="Endpoint URL" value={endpoint} />
            </div>
            <div>
              <h3 className="text-ink-faint mb-1 text-xs">
                Client configuration
              </h3>
              <CopyBlock
                label="Client configuration"
                value={snippet}
                multiline
              />
              <p className="text-ink-faint mt-2 text-xs">
                Replace YOUR_TOKEN with a token from the list below. The token
                travels in the Authorization header only, never in the URL. The
                exact file and keys depend on your MCP client.
              </p>
            </div>
          </div>
        </Card>

        <Card title="Access tokens">
          <p className="text-ink-soft mb-3 text-sm">
            Each token reads this workspace with the tools listed below. User
            names and sign-in addresses are left out unless the client asks for
            them explicitly. Up to {MAX_ACTIVE_TOKENS} tokens can be active.
          </p>
          {tokens.length > 0 ? (
            <TokenTable tokens={tokens} canManage={canManage} />
          ) : (
            <p className="text-ink-soft py-4 text-center text-sm">
              No tokens yet.
            </p>
          )}
          {canManage ? (
            <CreateTokenForm
              atLimit={tokens.length >= MAX_ACTIVE_TOKENS}
              nameMax={TOKEN_NAME_MAX}
            />
          ) : (
            <p className="text-ink-faint border-line mt-4 border-t pt-4 text-xs">
              {ctx.tenant.isDemo
                ? "The demo workspace keeps its tokens fixed. Connect your own tenant to create tokens."
                : "Owners and admins can create and revoke tokens."}
            </p>
          )}
        </Card>

        <Card title="Tools">
          <dl className="grid gap-x-8 gap-y-3 text-sm sm:grid-cols-2">
            <div>
              <dt className="font-mono text-xs">get_waste_summary</dt>
              <dd className="text-ink-soft mt-0.5">
                Monthly waste, split by category, open findings, last sync.
              </dd>
            </div>
            <div>
              <dt className="font-mono text-xs">list_findings</dt>
              <dd className="text-ink-soft mt-0.5">
                Findings by status and category, largest amount first.
              </dd>
            </div>
            <div>
              <dt className="font-mono text-xs">get_waste_trend</dt>
              <dd className="text-ink-soft mt-0.5">
                Daily or monthly spend and waste within your history window.
              </dd>
            </div>
            <div>
              <dt className="font-mono text-xs">list_licenses</dt>
              <dd className="text-ink-soft mt-0.5">
                Purchased, assigned and unused seats with their monthly cost.
              </dd>
            </div>
          </dl>
        </Card>
      </div>
    </div>
  );
}
