param(
  [string[]] $Path = @(
    "docs/db/migrations/202606281200_donghyun_auth_workspace_canvas_init.sql",
    "docs/db/seeds/001_donghyun_auth_workspace_canvas_seed.sql"
  ),
  [string] $ComposeFile = "docker-compose.dev.yml",
  [string] $Service = "postgres",
  [string] $Database = "pilo",
  [string] $User = "pilo",
  [switch] $SkipComposeUp
)

$ErrorActionPreference = "Stop"

$scriptRoot = Split-Path -Parent $MyInvocation.MyCommand.Path
$repoRoot = Resolve-Path (Join-Path $scriptRoot "..\..")
$composePath = Join-Path $repoRoot $ComposeFile

if (-not (Test-Path -LiteralPath $composePath)) {
  throw "Compose file not found: $composePath"
}

Push-Location $repoRoot
try {
  if (-not $SkipComposeUp) {
    docker compose -f $ComposeFile up -d $Service | Out-Host

    if ($LASTEXITCODE -ne 0) {
      throw "Failed to start $Service with Docker Compose. Check that Docker Desktop is running."
    }
  }

  $healthy = $false

  for ($attempt = 1; $attempt -le 30; $attempt++) {
    $health = docker inspect -f "{{.State.Health.Status}}" pilo-postgres 2>$null

    if ($LASTEXITCODE -eq 0 -and ($health -eq "healthy" -or [string]::IsNullOrWhiteSpace($health))) {
      $healthy = $true
      break
    }

    Start-Sleep -Seconds 1
  }

  if (-not $healthy) {
    throw "Postgres container is not healthy. Run 'docker compose -f $ComposeFile ps' for details."
  }

  foreach ($relativePath in $Path) {
    $sqlPath = Resolve-Path (Join-Path $repoRoot $relativePath)

    Write-Host "Applying $relativePath"
    Get-Content -Raw -Encoding UTF8 -LiteralPath $sqlPath |
      docker compose -f $ComposeFile exec -T $Service psql -v ON_ERROR_STOP=1 -U $User -d $Database

    if ($LASTEXITCODE -ne 0) {
      throw "Failed to apply SQL file: $relativePath"
    }
  }
}
finally {
  Pop-Location
}
