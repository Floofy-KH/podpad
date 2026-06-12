# PodPad

A beginner-friendly project to explore the intersection of AI agents and Solid Pods.

## Project Goal

Build a simple notes assistant that stores data in a Solid Pod and performs lightweight agent tasks (summarization, tagging, and action extraction).

This project is intended to help learn:
- Solid fundamentals (identity, auth, Pod data access)
- Agentic workflow basics (ingest, analyze, write back)
- How Solid and agent patterns interact in practice

## Current Scope

Initial scope is intentionally small and desktop-developer friendly:
- CLI-first workflow
- No deployment or infrastructure setup yet
- Minimal dependencies and moving parts

## Phase 0 Baseline

Phase 0 establishes a minimal TypeScript CLI scaffold for learning and for the next Solid Pod integration slices.

- Runtime baseline: Node.js 20.11+
- Entry point: src/cli.ts
- Build output: dist/

### Phase 0 Commands

- npm run dev -- phase0-check
- npm run check
- npm run build
- npm test

## Phase 1A: Solid Connectivity Foundation

Phase 1A adds a connectivity smoke check that validates:
- Solid authentication using a refresh-token flow
- Pod base access
- Idempotent bootstrap for notes/ and summaries/ containers

Run:
- npm run dev -- connectivity-check

Solid setup prerequisites (manual for now):
1. Create or use an existing Solid identity with an OIDC issuer.
2. Register an OAuth client for CLI usage and capture client ID/secret.
3. Obtain a refresh token for that client.
4. Confirm the target Pod base URL is reachable for that identity.
5. Confirm this identity can read and write under the target Pod location.

Required environment variables:
- SOLID_OIDC_ISSUER
- SOLID_CLIENT_ID
- SOLID_CLIENT_SECRET
- SOLID_REFRESH_TOKEN
- SOLID_POD_BASE_URL

Optional environment variables:
- SOLID_TOKEN_TYPE (DPoP or Bearer, default DPoP)
- SOLID_AUTH_MAX_RETRIES (non-negative integer, default 2)
- SOLID_AUTH_RETRY_DELAY_MS (non-negative integer, default 2000)
- SOLID_NOTES_CONTAINER_URL
- SOLID_SUMMARIES_CONTAINER_URL

## Planned Features (Phase 1)

- Add note
- List notes
- Summarize notes
- Save summaries back to the Pod

Suggested command ideas:
- add-note
- list-notes
- summarize-notes

## Non-Goals (for now)

- No web frontend required
- No production infrastructure
- No multi-user support
- No advanced policy management yet (ACP/WAC deep dive later)

## Learning Focus

- Solid authentication flow for scripts/apps
- Read/write resources in Pod containers
- Basic data organization strategy:
  - notes/
  - summaries/
- Simple agent loop:
  - ingest -> analyze -> persist

## Early Milestones

### Milestone 1: Solid Basics
- Authenticate
- Create/read/write one resource in Pod
- Set up notes and summaries containers

### Milestone 2: Agent Behavior
- Generate summaries from notes
- Persist generated outputs to Pod
- Add basic error handling/logging

### Milestone 3: Polish
- Search/filter notes
- Config file for provider/settings
- Optional small local UI wrapper later

## Status

Project initialized in planning stage.
Name selected: PodPad.

## Repeatable Auth Setup (Phase 1A)

The commands below are the repeatable setup flow for Solid auth on `solidcommunity.net`.

### 1. Register a client and capture client ID/secret

Run in PowerShell:

```powershell
$body = @{
  client_name = "PodPad CLI"
  redirect_uris = @("http://127.0.0.1:8787/callback")
  grant_types = @("authorization_code", "refresh_token")
  response_types = @("code")
  token_endpoint_auth_method = "client_secret_basic"
} | ConvertTo-Json -Depth 6

$client = Invoke-RestMethod -Method Post -Uri "https://solidcommunity.net/.oidc/reg" -ContentType "application/json" -Body $body

Write-Host "Client ID:     $($client.client_id)"
Write-Host "Client Secret: $($client.client_secret)"
```

### 2. Request an auth code with PKCE

Run in PowerShell, then copy the full callback URL from your browser and paste it when prompted:

```powershell
$clientId = "PASTE_CLIENT_ID"
$redirectUri = "http://127.0.0.1:8787/callback"
$issuer = "https://solidcommunity.net"
$scope = "openid webid offline_access profile"

function New-Base64UrlString([byte[]]$bytes) {
  [Convert]::ToBase64String($bytes).TrimEnd('=').Replace('+','-').Replace('/','_')
}

$verifierBytes = New-Object byte[] 64
[System.Security.Cryptography.RandomNumberGenerator]::Create().GetBytes($verifierBytes)
$pkceVerifier = New-Base64UrlString $verifierBytes

$sha = [System.Security.Cryptography.SHA256]::Create()
$challengeBytes = $sha.ComputeHash([Text.Encoding]::ASCII.GetBytes($pkceVerifier))
$pkceChallenge = New-Base64UrlString $challengeBytes

$stateBytes = New-Object byte[] 24
[System.Security.Cryptography.RandomNumberGenerator]::Create().GetBytes($stateBytes)
$state = New-Base64UrlString $stateBytes

$authUrl = "$issuer/.oidc/auth?response_type=code" +
  "&client_id=$([Uri]::EscapeDataString($clientId))" +
  "&redirect_uri=$([Uri]::EscapeDataString($redirectUri))" +
  "&scope=$([Uri]::EscapeDataString($scope))" +
  "&code_challenge=$([Uri]::EscapeDataString($pkceChallenge))" +
  "&code_challenge_method=S256" +
  "&state=$([Uri]::EscapeDataString($state))" +
  "&prompt=consent"

Start-Process $authUrl
$callbackUrl = Read-Host "Paste callback URL"

if ($callbackUrl -notmatch "[\?\&]code=([^&]+)") { throw "No code found." }
$authCode = [Uri]::UnescapeDataString($matches[1])

if ($callbackUrl -notmatch "[\?\&]state=([^&]+)") { throw "No state found." }
$returnedState = [Uri]::UnescapeDataString($matches[1])
if ($returnedState -ne $state) { throw "State mismatch." }

$env:PODPAD_CLIENT_ID = $clientId
$env:PODPAD_PKCE_VERIFIER = $pkceVerifier
$env:PODPAD_AUTH_CODE = $authCode
$env:PODPAD_REDIRECT_URI = $redirectUri
```

### 3. Exchange auth code for refresh token

```powershell
$clientSecret = "PASTE_CLIENT_SECRET"
$basic = [Convert]::ToBase64String([Text.Encoding]::ASCII.GetBytes("$env:PODPAD_CLIENT_ID`:$clientSecret"))

$token = Invoke-RestMethod `
  -Method Post `
  -Uri "https://solidcommunity.net/.oidc/token" `
  -Headers @{ Authorization = "Basic $basic" } `
  -ContentType "application/x-www-form-urlencoded" `
  -Body @{
    grant_type    = "authorization_code"
    code          = $env:PODPAD_AUTH_CODE
    redirect_uri  = $env:PODPAD_REDIRECT_URI
    code_verifier = $env:PODPAD_PKCE_VERIFIER
  }

if (-not $token.refresh_token) { throw "No refresh_token returned." }
Write-Host "Refresh token: $($token.refresh_token)"
```

### 4. Populate `.env`

Fill your local `.env` file with values from steps 1-3 and your Pod URL.

### 5. Load `.env` into current PowerShell process and run check

```powershell
Get-Content .env |
  Where-Object { $_ -and -not $_.Trim().StartsWith("#") } |
  ForEach-Object {
    $name, $value = $_ -split "=", 2
    Set-Item -Path "Env:$name" -Value $value
  }

npm run dev -- connectivity-check
```