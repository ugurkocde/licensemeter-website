---
description: "Understand first sign-in, invitations, pending access requests and the empty dashboard."
---

# Sign in and find your workspace

Use the same email address you intend to use for LicenseMeter membership. Your LicenseMeter sign-in and the Microsoft account that grants connector consent serve different purposes.

{% stepper %}
{% step %}
## Leave the sample workspace if necessary

If the sidebar identifies a **Demo workspace**, select **Sign out**. Demo users cannot save prices, connect providers or accept an invitation into a real workspace.
{% endstep %}
{% step %}
## Open sign-in

Open [LicenseMeter](https://www.licensemeter.com/) and select **Start free**, then the sign-in action in that area. You can also open the hosted service's [sign-in entry](https://www.licensemeter.com/auth/sign-in) directly.

The hosted page currently offers **Continue with email** and **Continue with Google**. For a new email account, select **Sign up**, enter **First name**, **Last name** and **Email**, then **Continue**. Complete the verification, authentication and MFA steps the service presents. Use an email address you control; Google sign-in must resolve to the identity intended for your membership. Available methods can change with the installation's configuration.

<figure><img src="../.gitbook/assets/onboarding-sign-in.webp" alt="LicenseMeter hosted sign-in page with email, Google and Sign up options"><figcaption><p>Public hosted sign-in page, captured without entering an email or credentials.</p></figcaption></figure>

<figure><img src="../.gitbook/assets/onboarding-sign-up.webp" alt="Hosted sign-up form with First name, Last name and Email fields"><figcaption><p>Public hosted sign-up form. No account was created for this illustration.</p></figcaption></figure>

Use the invited email for an invitation. Do not assume that a personal address and a work address reach the same workspace. Self-hosted installations may instead open Microsoft sign-in directly.

If you see **Request scan access** rather than a working sign-in action, use [Support](https://www.licensemeter.com/support) or contact your installation's operator. The sample workspace remains a way to explore. Do not grant Microsoft consent to solve a missing LicenseMeter login option.
{% endstep %}
{% step %}
## Identify which workspace you entered

The hosted account flow resolves invitations and existing memberships first. For a new account, a verified company email may join an existing workspace or request approval according to its owner's settings. If it does not join, the account gets its own empty workspace.

| What you see | Meaning | Next step |
| --- | --- | --- |
| Your organization's populated dashboard | You have membership and it already contains data | Check your role, freshness and prices before reviewing findings |
| **Add your Microsoft 365 directory** | The active workspace has no Microsoft assessment yet | Connect Microsoft or import authorized exports |
| **You asked to join… An admin there needs to approve it** | Your access request is pending | Ask that workspace's Admin or Owner to review **Settings > Members > Access requests** |
| An unfamiliar or empty workspace despite an invitation | You may be signed in with another email, the invite may have expired, or another workspace is active | Check the email, switch workspace, or ask for **Resend** |

While approval is pending, your own workspace does not contain the other workspace's organizational data. Dismissing the notice only hides it in that browser; it does not cancel or approve the request. After approval, refresh and use the workspace switcher when available.
{% endstep %}
{% step %}
## Check the workspace name and role

On desktop, the workspace is in the sidebar. On mobile, open the menu. The switcher appears when you can access more than one workspace; your role applies separately in each. Viewer access is enough for reports, but a workspace Admin or Owner must maintain the connection and prices.
{% endstep %}
{% endstepper %}

<figure><img src="../.gitbook/assets/onboarding-empty.webp" alt="New workspace showing Add your Microsoft 365 directory and the CSV assessment option"><figcaption><p>Isolated LicenseMeter documentation workspace with fictional data. No live provider connection or customer data is shown.</p></figcaption></figure>

The sidebar's **Connected tenant** label identifies a non-demo workspace; it is not proof that a provider connection or first sync has succeeded. Use the connector status and [first-sync checklist](first-sync.md) to verify that.

## If a colleague invited you

Invitations expire after **14 days** if unclaimed. Ask an authorized member to use **Settings > Members > Resend** for an expired invitation. Resending restarts the expiry period. Where invitation email is unavailable, sign in to the same installation using the exact invited identity. The [membership guide](../workspace/members.md) explains administrator actions and domain-join options.

Next: [Choose the Microsoft connection path](../connectors/microsoft.md), or [review existing data](first-sync.md).
