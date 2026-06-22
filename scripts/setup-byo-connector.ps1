<#
.SYNOPSIS
  Creates a "bring your own" LicenseMeter connector app registration in YOUR
  Microsoft 365 tenant and prints the credentials to paste into LicenseMeter.

.DESCRIPTION
  For customers who prefer their own Entra app registration over LicenseMeter's
  managed (one-click admin-consent) app. The app is single-tenant, read-only,
  and gets exactly the application permissions LicenseMeter requires:
    User.Read.All, AuditLog.Read.All, Reports.Read.All,
    LicenseAssignment.Read.All, ReportSettings.Read.All
  (the same set the in-product connector page lists and the test-connection
  enforces). App role IDs are resolved dynamically from the Microsoft Graph
  service principal, so no hardcoded GUIDs can go stale.

  The script also GRANTS admin consent for those permissions and creates a
  client secret (default) or registers a certificate you supply. Run it as a
  Global Administrator (or Privileged Role Administrator) of the tenant you
  want LicenseMeter to read.

.PARAMETER UseCertificate
  Register a certificate credential instead of a client secret. Provide the
  public certificate via -CertPath. You keep the private key and paste it
  (PEM) into LicenseMeter together with the certificate.

.PARAMETER CertPath
  Path to a public certificate (.cer/.crt/.pem) when -UseCertificate is set.

.EXAMPLE
  ./setup-byo-connector.ps1
  Creates the app with a 12-month client secret and prints Tenant/Client/Secret.

.EXAMPLE
  ./setup-byo-connector.ps1 -UseCertificate -CertPath ./licensemeter.cer
  Creates the app and registers the certificate; paste the matching private key
  (PEM) plus the certificate (PEM) into LicenseMeter.

.NOTES
  Requires the Microsoft.Graph PowerShell module:
    Install-Module Microsoft.Graph -Scope CurrentUser
#>
param(
  [switch]$UseCertificate,
  [string]$CertPath
)

$ErrorActionPreference = "Stop"

if ($UseCertificate -and -not $CertPath) {
  throw "-CertPath is required when -UseCertificate is set."
}

Import-Module Microsoft.Graph.Applications -ErrorAction Stop
Import-Module Microsoft.Graph.Identity.DirectoryManagement -ErrorAction Stop

# Application.ReadWrite.All creates the app; AppRoleAssignment.ReadWrite.All
# grants admin consent for the application permissions below.
Connect-MgGraph -Scopes "Application.ReadWrite.All", "AppRoleAssignment.ReadWrite.All" -NoWelcome

$tenantId = (Get-MgContext).TenantId

$graphAppId = "00000003-0000-0000-c000-000000000000"
$graphSp = Get-MgServicePrincipal -Filter "appId eq '$graphAppId'"
if (-not $graphSp) { throw "Microsoft Graph service principal not found in this tenant." }

# Read-only application permissions LicenseMeter requires. Keep in lockstep with
# src/lib/scopes.ts (CONNECTOR_SCOPES); a drift test asserts they match.
$connectorRoles = @(
  "User.Read.All",
  "AuditLog.Read.All",
  "Reports.Read.All",
  "LicenseAssignment.Read.All",
  "ReportSettings.Read.All"
)

function Get-GraphAppRole {
  param([string]$Value)
  $role = $graphSp.AppRoles | Where-Object { $_.Value -eq $Value -and $_.AllowedMemberTypes -contains "Application" }
  if (-not $role) { throw "App role '$Value' not found on the Graph service principal." }
  return $role
}

Write-Host "Resolving Graph application role IDs..." -ForegroundColor Cyan
$roles = $connectorRoles | ForEach-Object { Get-GraphAppRole -Value $_ }
$resourceAccess = $roles | ForEach-Object { @{ Id = $_.Id; Type = "Role" } }

# --- Create the app registration (single-tenant, app permissions) -------------
Write-Host "Creating 'LicenseMeter Connector (BYO)'..." -ForegroundColor Cyan
$app = New-MgApplication `
  -DisplayName "LicenseMeter Connector (BYO)" `
  -SignInAudience "AzureADMyOrg" `
  -RequiredResourceAccess @(
    @{ ResourceAppId = $graphAppId; ResourceAccess = $resourceAccess }
  )

$sp = New-MgServicePrincipal -AppId $app.AppId

# --- Grant admin consent for every application permission ----------------------
Write-Host "Granting admin consent..." -ForegroundColor Cyan
foreach ($role in $roles) {
  New-MgServicePrincipalAppRoleAssignment `
    -ServicePrincipalId $sp.Id `
    -PrincipalId $sp.Id `
    -ResourceId $graphSp.Id `
    -AppRoleId $role.Id | Out-Null
}

# --- Credential ----------------------------------------------------------------
$thumbprint = $null
$secretText = $null
if ($UseCertificate) {
  Write-Host "Registering certificate..." -ForegroundColor Cyan
  $cert = [System.Security.Cryptography.X509Certificates.X509Certificate2]::new($CertPath)
  Update-MgApplication -ApplicationId $app.Id -KeyCredentials @(
    @{
      Type  = "AsymmetricX509Cert"
      Usage = "Verify"
      Key   = $cert.RawData
    }
  )
  $thumbprint = $cert.Thumbprint
} else {
  Write-Host "Creating client secret..." -ForegroundColor Cyan
  $secret = Add-MgApplicationPassword -ApplicationId $app.Id -PasswordCredential @{
    DisplayName = "licensemeter"
    EndDateTime = (Get-Date).AddMonths(12)
  }
  $secretText = $secret.SecretText
}

# --- Output --------------------------------------------------------------------
Write-Host ""
Write-Host "Done. Paste these into the LicenseMeter Microsoft connector (Advanced):" -ForegroundColor Green
Write-Host ""
Write-Host "Directory (tenant) ID:    $tenantId"
Write-Host "Application (client) ID:  $($app.AppId)"
if ($UseCertificate) {
  Write-Host "Certificate thumbprint:   $thumbprint"
  Write-Host ""
  Write-Host "Paste the matching PRIVATE KEY (PEM) and the CERTIFICATE (PEM) into LicenseMeter." -ForegroundColor Yellow
} else {
  Write-Host "Client secret:            $secretText"
  Write-Host ""
  Write-Host "The secret expires $((Get-Date).AddMonths(12).ToString('yyyy-MM-dd')) and is shown only once. Store it safely." -ForegroundColor Yellow
}
Write-Host "Consent can take a minute to propagate before the first sync succeeds." -ForegroundColor Yellow
