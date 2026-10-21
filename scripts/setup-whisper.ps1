param(
  [ValidateSet("x64", "ARM64")]
  [string]$Architecture = "x64"
)

$ErrorActionPreference = "Stop"

$WhisperVersion = "v1.9.4"
$WhisperRevision = "927cfce34f31707e17f2bff35c349632fb9e2c3a"
$WhisperRepository = "https://github.com/ggml-org/whisper.cpp.git"
$ProjectRoot = (Resolve-Path (Join-Path $PSScriptRoot "..")).Path
$WhisperSource = Join-Path $ProjectRoot ".local\whisper.cpp"
$WhisperBuild = Join-Path $WhisperSource "build-$($Architecture.ToLowerInvariant())"
$WhisperParent = Split-Path $WhisperSource
$InstallLockPath = Join-Path $WhisperParent "whisper.cpp.install-lock"

foreach ($Command in @("git", "cmake")) {
  if ($null -eq (Get-Command $Command -ErrorAction SilentlyContinue)) {
    throw "Required command not found: $Command"
  }
}

New-Item -ItemType Directory -Force $WhisperParent | Out-Null

try {
  $InstallLock = [System.IO.File]::Open(
    $InstallLockPath,
    [System.IO.FileMode]::OpenOrCreate,
    [System.IO.FileAccess]::ReadWrite,
    [System.IO.FileShare]::None
  )
} catch [System.IO.IOException] {
  throw "Another whisper.cpp setup may be running. Could not acquire the installation lock at $InstallLockPath. Retry after the other setup finishes."
}

try {
  if (Test-Path -LiteralPath $WhisperSource) {
    if (-not (Test-Path -LiteralPath (Join-Path $WhisperSource ".git") -PathType Container)) {
      throw "Refusing to overwrite existing path: $WhisperSource. It may be an incomplete installation. Inspect it, then move or remove it manually before retrying."
    }

    $CurrentVersion = (& git -C $WhisperSource describe --tags --exact-match 2>$null)
    if ($LASTEXITCODE -ne 0) {
      throw "Could not verify the existing whisper.cpp version at $WhisperSource. It was left unchanged."
    }

    $CurrentRevision = (& git -C $WhisperSource rev-parse HEAD 2>$null)
    if ($LASTEXITCODE -ne 0) {
      throw "Could not read the existing whisper.cpp revision at $WhisperSource. It was left unchanged."
    }

    if ($CurrentVersion -ne $WhisperVersion -or $CurrentRevision -ne $WhisperRevision) {
      throw "Existing whisper.cpp checkout is not the expected $WhisperVersion revision. It was left unchanged. Move it aside or set WHISPER_CPP_PATH to another installation."
    }

    $LocalChanges = (& git -C $WhisperSource status --porcelain --untracked-files=all)
    if ($LASTEXITCODE -ne 0) {
      throw "Could not inspect the existing whisper.cpp checkout at $WhisperSource. It was left unchanged."
    }

    if ($null -ne $LocalChanges) {
      throw "Existing whisper.cpp checkout contains local modifications: $WhisperSource. They were left unchanged. Commit or move the checkout, or set WHISPER_CPP_PATH to another installation."
    }

    Write-Host "Using existing whisper.cpp $WhisperVersion checkout at $WhisperSource"
  } else {
    $TemporarySource = Join-Path $WhisperParent "whisper.cpp.tmp.$([guid]::NewGuid().ToString('N'))"

    try {
      & git clone --branch $WhisperVersion --depth 1 $WhisperRepository $TemporarySource

      if ($LASTEXITCODE -ne 0) {
        throw "Failed to clone whisper.cpp $WhisperVersion."
      }

      $ClonedVersion = (& git -C $TemporarySource describe --tags --exact-match 2>$null)
      if ($LASTEXITCODE -ne 0) {
        throw "Could not verify the cloned whisper.cpp version."
      }

      $ClonedRevision = (& git -C $TemporarySource rev-parse HEAD)
      if ($LASTEXITCODE -ne 0) {
        throw "Could not read the cloned whisper.cpp revision."
      }

      $ExpectedRevision = (& git -C $TemporarySource rev-list -n 1 $WhisperVersion)
      if ($LASTEXITCODE -ne 0 -or $ClonedVersion -ne $WhisperVersion -or $ClonedRevision -ne $ExpectedRevision -or $ClonedRevision -ne $WhisperRevision) {
        throw "Cloned whisper.cpp revision did not match $WhisperVersion. The final installation was left unchanged."
      }

      if (Test-Path -LiteralPath $WhisperSource) {
        throw "Refusing to overwrite path created during installation: $WhisperSource"
      }

      [System.IO.Directory]::Move($TemporarySource, $WhisperSource)
    } finally {
      if (Test-Path -LiteralPath $TemporarySource) {
        Remove-Item -LiteralPath $TemporarySource -Recurse -Force
      }
    }
  }

  & cmake -S $WhisperSource -B $WhisperBuild -G "Visual Studio 17 2022" -A $Architecture
  if ($LASTEXITCODE -ne 0) {
    throw "Failed to configure whisper.cpp."
  }

  & cmake --build $WhisperBuild --config Release --parallel
  if ($LASTEXITCODE -ne 0) {
    throw "Failed to build whisper.cpp."
  }

  $WhisperExecutable = Join-Path $WhisperBuild "bin\Release\whisper-cli.exe"

  if (-not (Test-Path -LiteralPath $WhisperExecutable -PathType Leaf)) {
    throw "Build completed but whisper-cli was not found at $WhisperExecutable"
  }
} finally {
  $InstallLock.Dispose()
}

Write-Host "whisper.cpp $WhisperVersion is ready."
Write-Host "The application will discover it automatically at:"
Write-Host $WhisperExecutable
