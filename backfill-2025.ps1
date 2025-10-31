param(
  [int]$Year = 2025,
  [switch]$SkipSundays = $true,
  [int]$MinCommitsPerDay = 1,
  [int]$MaxCommitsPerDay = 3,
  [int]$MaxFilesPerCommit = 2,
  [switch]$DryRun
)

# Backfills commits into this repo for the given year up to yesterday,
# keeping the latest commit intact (no history rewrite) and touching
# a small, random set of existing, non-sensitive doc/text files per commit.

function Assert-GitRepoClean {
  $status = git status --porcelain
  if ($status) {
    Write-Error "Working tree not clean. Commit or stash your changes first." -ErrorAction Stop
  }
}

function Get-EndDateForYear($year) {
  $today = Get-Date
  if ($today.Year -eq $year) {
    return ($today.Date).AddDays(-1)
  } else {
    return (Get-Date "$year-12-31").Date
  }
}

function Get-CandidateFiles {
  # Only use existing, non-sensitive documentation/text files
  $badNameSnippets = @('plan','progress','summary','secret','secrets','credential','creds','token','password','.env','config','private')
  $allowedExt = @('.md','.mdx','.txt','.rst','.adoc')
  $excludePathParts = @('\.git\','\node_modules\','\dist\','\build\','\out\','\vendor\','\__pycache__\','\\venv\\','\\.next\\','\\.cache\\','\\.parcel-cache\\')

  $all = @()
  # Prefer docs first
  $all += Get-ChildItem -Recurse -File -Filter '*.md'  -ErrorAction SilentlyContinue | Where-Object { $_.FullName -match '\\docs?\\' }
  $all += Get-ChildItem -Recurse -File -Filter '*.txt' -ErrorAction SilentlyContinue | Where-Object { $_.FullName -match '\\docs?\\' }
  # Common top-level docs
  $all += Get-ChildItem -Recurse -File -Filter 'README*.md'     -ErrorAction SilentlyContinue
  $all += Get-ChildItem -Recurse -File -Filter 'CHANGELOG*.md'  -ErrorAction SilentlyContinue
  $all += Get-ChildItem -Recurse -File -Filter 'CONTRIBUTING*.md' -ErrorAction SilentlyContinue
  $all += Get-ChildItem -Recurse -File -Filter 'README*.txt'    -ErrorAction SilentlyContinue

  # Fallback: any allowed ext anywhere
  $all += Get-ChildItem -Recurse -File -ErrorAction SilentlyContinue | Where-Object { $allowedExt -contains $_.Extension.ToLower() }

  $all = $all | Sort-Object FullName -Unique | Where-Object {
    $p = $_.FullName.ToLower()
    # exclude unwanted paths
    if ($excludePathParts | Where-Object { $p -match $_ }) { return $false }
    $n = $_.Name.ToLower()
    if ($badNameSnippets | Where-Object { $n -like ("*$_*") }) { return $false }
    return $true
  }

  # Do not include empty or super-short files that might be placeholders
  return $all | Where-Object { (Test-Path $_.FullName) -and ((Get-Item $_.FullName).Length -ge 1) }
}

function Get-WeightedCommitCount([int]$min,[int]$max) {
  # Heavily favor 1, sometimes 2, rarely 3 (keeps graph light)
  $bucket = @()
  switch ($max) {
    { $_ -le 1 } { $bucket = @(1); break }
    { $_ -eq 2 } { $bucket = @(1,1,1,1,2,2); break }
    default      { $bucket = @(1,1,1,1,1,2,2,2,3) }
  }
  $val = $bucket | Get-Random
  if ($val -lt $min) { return $min }
  if ($val -gt $max) { return $max }
  return $val
}

function Get-RandomCommitTimeInDay([datetime]$day) {
  # Between 09:00 and 21:59 local
  $hour   = Get-Random -Minimum 9 -Maximum 22
  $minute = Get-Random -Minimum 0 -Maximum 60
  $second = Get-Random -Minimum 0 -Maximum 60
  return (Get-Date -Year $day.Year -Month $day.Month -Day $day.Day -Hour $hour -Minute $minute -Second $second)
}

function Add-TouchLine([string]$path,[datetime]$stamp) {
  $iso = $stamp.ToString('s')
  $ext = [IO.Path]::GetExtension($path).ToLower()
  $line = switch ($ext) {
    '.md'  { "<!-- routine touch $iso -->" }
    '.mdx' { "<!-- routine touch $iso -->" }
    default { "# routine touch $iso" }
  }
  Add-Content -Path $path -Value $line
}

# Main
Assert-GitRepoClean

$startDate = Get-Date "$Year-01-01"
$endDate   = Get-EndDateForYear -year $Year
if ($endDate -lt $startDate) { Write-Error "End date is before start date" -ErrorAction Stop }

$candidates = Get-CandidateFiles
if (-not $candidates -or $candidates.Count -eq 0) {
  Write-Error "No safe doc/text files found to touch. Add README/CHANGELOG/docs files first." -ErrorAction Stop
}

Write-Host "Will add backdated commits from $($startDate.ToString('yyyy-MM-dd')) to $($endDate.ToString('yyyy-MM-dd')) (excluding Sundays: $SkipSundays)"
Write-Host "Candidates: $($candidates.Count) files"

$origAuthorDate   = $env:GIT_AUTHOR_DATE
$origCommitterDate= $env:GIT_COMMITTER_DATE

$totalDays = 0
$totalCommits = 0

$current = $startDate
while ($current -le $endDate) {
  if ($SkipSundays -and $current.DayOfWeek -eq [System.DayOfWeek]::Sunday) {
    $current = $current.AddDays(1)
    continue
  }

  $commitsToday = Get-WeightedCommitCount -min $MinCommitsPerDay -max $MaxCommitsPerDay
  $totalDays++

  for ($i = 1; $i -le $commitsToday; $i++) {
    $filesToTouchCount = [Math]::Min($MaxFilesPerCommit, $candidates.Count) # ensure caps
    $filesToTouch = $candidates | Get-Random -Count ([Math]::Min($MaxFilesPerCommit, [Math]::Max(1, [Math]::Min($candidates.Count, (Get-Random -Minimum 1 -Maximum ($MaxFilesPerCommit+1))))))

    $commitStamp = Get-RandomCommitTimeInDay -day $current
    $dateStr = $commitStamp.ToString('yyyy-MM-dd HH:mm:ss')

    if ($DryRun) {
      $names = ($filesToTouch | ForEach-Object { $_.FullName }) -join ', '
      Write-Host "DRY-RUN $($current.ToString('yyyy-MM-dd')) -> commit at $dateStr touching: $names"
      continue
    }

    foreach ($f in $filesToTouch) {
      Add-TouchLine -path $f.FullName -stamp $commitStamp
    }

    foreach ($f in $filesToTouch) { git add -- $f.FullName | Out-Null }

    $env:GIT_AUTHOR_DATE    = $dateStr
    $env:GIT_COMMITTER_DATE = $dateStr
    git commit -m "chore(docs): routine touch $($current.ToString('yyyy-MM-dd')) ($i/$commitsToday)" | Out-Null
    $totalCommits++
  }

  $current = $current.AddDays(1)
}

$env:GIT_AUTHOR_DATE    = $origAuthorDate
$env:GIT_COMMITTER_DATE = $origCommitterDate

Write-Host "Completed. Days processed: $totalDays, commits created: $totalCommits"
Write-Host "Review with 'git log --since=$Year-01-01 --until=$($endDate.ToString('yyyy-MM-dd')) --oneline'"
Write-Host "Push when ready: git push"
