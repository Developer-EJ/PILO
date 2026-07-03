param(
  [string]$Region = "ap-northeast-2",
  [string]$AwsCliPath = "C:\Program Files\Amazon\AWSCLIV2\aws.exe"
)

$ErrorActionPreference = "Stop"

function Read-OptionalSecureText {
  param([string]$Prompt)

  $secure = Read-Host $Prompt -AsSecureString
  if ($secure.Length -eq 0) {
    return ""
  }

  $bstr = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($secure)
  try {
    return [Runtime.InteropServices.Marshal]::PtrToStringBSTR($bstr)
  }
  finally {
    [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($bstr)
  }
}

function Put-SecretIfPresent {
  param(
    [string]$Name,
    [string]$Value
  )

  if ([string]::IsNullOrWhiteSpace($Value)) {
    Write-Output "skip    $Name"
    return
  }

  $null = & $AwsCliPath secretsmanager put-secret-value `
    --region $Region `
    --secret-id $Name `
    --secret-string $Value

  Write-Output "updated $Name"
}

if (-not (Test-Path -LiteralPath $AwsCliPath)) {
  throw "AWS CLI not found at $AwsCliPath"
}

Write-Output "Blank input skips that secret."

$openAiApiKey = Read-OptionalSecureText "OPENAI_API_KEY"
$githubAppId = Read-Host "GITHUB_APP_ID"
$githubPrivateKeyPath = Read-Host "GITHUB_APP_PRIVATE_KEY file path"
$livekitApiKey = Read-OptionalSecureText "LIVEKIT_API_KEY"
$livekitApiSecret = Read-OptionalSecureText "LIVEKIT_API_SECRET"
$livekitUrl = Read-Host "LIVEKIT_URL"

$githubPrivateKey = ""
if (-not [string]::IsNullOrWhiteSpace($githubPrivateKeyPath)) {
  $resolvedPath = Resolve-Path -LiteralPath $githubPrivateKeyPath
  $githubPrivateKey = Get-Content -LiteralPath $resolvedPath -Raw
}

Put-SecretIfPresent "pilo-dev/app-server/OPENAI_API_KEY" $openAiApiKey
Put-SecretIfPresent "pilo-dev/ai-worker/OPENAI_API_KEY" $openAiApiKey

Put-SecretIfPresent "pilo-dev/app-server/GITHUB_APP_ID" $githubAppId
Put-SecretIfPresent "pilo-dev/ai-worker/GITHUB_APP_ID" $githubAppId
Put-SecretIfPresent "pilo-dev/app-server/GITHUB_APP_PRIVATE_KEY" $githubPrivateKey
Put-SecretIfPresent "pilo-dev/ai-worker/GITHUB_APP_PRIVATE_KEY" $githubPrivateKey

Put-SecretIfPresent "pilo-dev/app-server/LIVEKIT_API_KEY" $livekitApiKey
Put-SecretIfPresent "pilo-dev/app-server/LIVEKIT_API_SECRET" $livekitApiSecret
Put-SecretIfPresent "pilo-dev/app-server/LIVEKIT_URL" $livekitUrl

Write-Output "done"
