<#
.SYNOPSIS
  Creates the two LicenseMeter app registrations in your (product) Entra tenant.

.DESCRIPTION
  1. "LicenseMeter Sign-in"  - multi-tenant, delegated, used only for OIDC login
     (openid/profile/email). No Graph permissions declared.
  2. "LicenseMeter Connector" - multi-tenant, application permissions, granted
     per customer tenant via the admin-consent flow. Read-only scopes only:
     User.Read.All, AuditLog.Read.All, Reports.Read.All,
     LicenseAssignment.Read.All, ReportSettings.Read.All.

  App role IDs are resolved dynamically from the Microsoft Graph service
  principal, so no hardcoded GUIDs can go stale.

  Run as a user who can create applications in the tenant that should own the
  apps (your product tenant, not a customer tenant).

.PARAMETER BaseUrl
  Public base URL of the deployment, e.g. https://app.licensemeter.example
  Use http://localhost:3000 for local development.

.EXAMPLE
  ./setup-entra.ps1 -BaseUrl "http://localhost:3000"

.NOTES
  - Secrets created here expire after 12 months; rotate before then. For
    production, prefer a certificate credential on the connector app.
  - Before customer tenants can consent, complete publisher verification
    (Microsoft AI Cloud Partner Program account + verified publisher domain),
    otherwise consent is blocked in most tenants:
    https://learn.microsoft.com/entra/identity-platform/publisher-verification-overview
#>
param(
  [Parameter(Mandatory = $true)]
  [string]$BaseUrl
)

$ErrorActionPreference = "Stop"
$BaseUrl = $BaseUrl.TrimEnd("/")

Import-Module Microsoft.Graph.Applications -ErrorAction Stop

Connect-MgGraph -Scopes "Application.ReadWrite.All" -NoWelcome

$graphAppId = "00000003-0000-0000-c000-000000000000"
$graphSp = Get-MgServicePrincipal -Filter "appId eq '$graphAppId'"
if (-not $graphSp) { throw "Microsoft Graph service principal not found in this tenant." }

function Get-GraphAppRole {
  param([string]$Value)
  $role = $graphSp.AppRoles | Where-Object { $_.Value -eq $Value -and $_.AllowedMemberTypes -contains "Application" }
  if (-not $role) { throw "App role '$Value' not found on the Graph service principal." }
  return $role.Id
}

$connectorRoles = @(
  "User.Read.All",
  "AuditLog.Read.All",
  "Reports.Read.All",
  "LicenseAssignment.Read.All",
  "ReportSettings.Read.All"
)

Write-Host "Resolving Graph application role IDs..." -ForegroundColor Cyan
$resourceAccess = foreach ($value in $connectorRoles) {
  @{ Id = (Get-GraphAppRole -Value $value); Type = "Role" }
}

# --- 1. Sign-in app -----------------------------------------------------------
Write-Host "Creating 'LicenseMeter Sign-in'..." -ForegroundColor Cyan
$signin = New-MgApplication `
  -DisplayName "LicenseMeter Sign-in" `
  -SignInAudience "AzureADMultipleOrgs" `
  -Web @{ RedirectUris = @("$BaseUrl/api/auth/callback/microsoft-entra-id") } `
  -OptionalClaims @{
    # xms_edov tells LicenseMeter that Microsoft verified the owner of the email
    # domain. Only then is an existing member linked to the sign-in by email.
    IdToken = @(
      @{ Name = "email"; Essential = $false },
      @{ Name = "xms_edov"; Essential = $false }
    )
  }

$signinSecret = Add-MgApplicationPassword -ApplicationId $signin.Id -PasswordCredential @{
  DisplayName = "licensemeter"
  EndDateTime = (Get-Date).AddMonths(12)
}
New-MgServicePrincipal -AppId $signin.AppId | Out-Null

# --- 2. Connector app ----------------------------------------------------------
Write-Host "Creating 'LicenseMeter Connector'..." -ForegroundColor Cyan
$connector = New-MgApplication `
  -DisplayName "LicenseMeter Connector" `
  -SignInAudience "AzureADMultipleOrgs" `
  -Web @{ RedirectUris = @("$BaseUrl/api/connect/callback") } `
  -RequiredResourceAccess @(
    @{ ResourceAppId = $graphAppId; ResourceAccess = $resourceAccess }
  )

$connectorSecret = Add-MgApplicationPassword -ApplicationId $connector.Id -PasswordCredential @{
  DisplayName = "licensemeter"
  EndDateTime = (Get-Date).AddMonths(12)
}
New-MgServicePrincipal -AppId $connector.AppId | Out-Null

# --- Output ---------------------------------------------------------------------
Write-Host ""
Write-Host "Done. Add these to your .env (and to Vercel for production):" -ForegroundColor Green
Write-Host ""
Write-Host "AUTH_MICROSOFT_ENTRA_ID_ID=`"$($signin.AppId)`""
Write-Host "AUTH_MICROSOFT_ENTRA_ID_SECRET=`"$($signinSecret.SecretText)`""
Write-Host "CONNECTOR_CLIENT_ID=`"$($connector.AppId)`""
Write-Host "CONNECTOR_CLIENT_SECRET=`"$($connectorSecret.SecretText)`""
Write-Host ""
Write-Host "Secrets expire $((Get-Date).AddMonths(12).ToString('yyyy-MM-dd')). Store them safely; they are shown only once." -ForegroundColor Yellow
Write-Host "Next steps: publisher verification, then grant consent in a customer tenant via the app's Connect page." -ForegroundColor Yellow
