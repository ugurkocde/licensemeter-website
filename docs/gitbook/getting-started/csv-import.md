---
description: "Analyze exported Microsoft users and optional usage data without granting connector consent."
icon: file-csv
---

# Import Microsoft CSV exports

Use CSV import when you have admin-center exports but are not ready to grant a live connector access. This creates a snapshot, not a continuously refreshed connection.

{% stepper %}
{% step %}
## Prepare the user export

In the Microsoft 365 admin center, export users from **Users > Active users**. Keep the header row. This is the required file and identifies users, assigned licenses and blocked accounts.
{% endstep %}
{% step %}
## Add a usage export if available

Export the detailed **Reports > Usage > Active users** report. This optional file supplies activity dates. Without identifiable activity data, the import cannot support the same inactivity conclusions as a complete live connection.
{% endstep %}
{% step %}
## Import and analyze

In LicenseMeter, choose **Try it with CSV exports** on the Microsoft connection flow. Select **User export**, optionally select **Usage export**, and set a workspace name if desired. Select **Analyze my exports**.
{% endstep %}
{% step %}
## Review coverage and prices

Check the resulting findings, then set [contract prices](../licenses-and-prices.md). Review the date and scope of your exports before comparing results over time.
{% endstep %}
{% endstepper %}

Do not rename or remove identifying columns. If the import fails, use a fresh export and read the validation message. Concealed user names can prevent user-level matching; see [report privacy and detection coverage](../troubleshooting/report-privacy.md).

The ChatGPT and Claude connector imports are different: those accept a pasted member table on their respective connector pages. See [ChatGPT](../connectors/chatgpt.md) and [Claude](../connectors/claude.md).
