param(
    [Parameter(Mandatory=$true)][string]$UpdatesPath,
    [Parameter(Mandatory=$true)][string]$ExpectedSha256,
    [string]$WorkbookPath = (Join-Path $PSScriptRoot '..\spec\meals\Meals Acceptance Checklist v1.0.xlsx'),
    [switch]$ValidateOnly
)
$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.IO.Compression.FileSystem
. (Join-Path $PSScriptRoot 'meals-workbook-layout.ps1')

function Read-UpdatePlan {
    $plan = Get-Content -LiteralPath $UpdatesPath -Raw | ConvertFrom-Json
    if (@($plan.PSObject.Properties.Name | Where-Object { $_ -notin @('testRunId','updates') }).Count) {
        throw 'Unknown plan property.'
    }
    if ($plan.testRunId -notmatch '^P[0-3]-TECH-\d{3}$' -or @($plan.updates).Count -eq 0) {
        throw 'A technical Test Run ID and nonempty updates are required.'
    }
    $seen = @{}
    foreach ($update in $plan.updates) {
        if (@($update.PSObject.Properties.Name | Where-Object { $_ -notin @('sheet','id','fields') }).Count) {
            throw 'Unknown update property.'
        }
        if ($update.sheet -notin @('Functional Acceptance','Security Acceptance','Database Verification','End-to-End Tests')) {
            throw 'Only acceptance ledgers may be updated; Summary/Sign-Off/Coverage are protected.'
        }
        if (-not $update.id -or $seen.ContainsKey("$($update.sheet):$($update.id)")) { throw 'Missing or duplicate stable ID.' }
        $seen["$($update.sheet):$($update.id)"] = $true
        $allowed = @('Status','Tested Date','Defect ID','Evidence / Build Reference','Defect / Notes')
        if ($update.sheet -eq 'Security Acceptance') { $allowed += @('Execution Owner','Environment') }
        if ($update.sheet -eq 'Database Verification') {
            $allowed = @('Status','Verification Date','Evidence / Export','Notes','Git Commit / Branch')
        }
        if ($update.sheet -eq 'End-to-End Tests') { $allowed = @('Status','Tested Date','Defect ID','Evidence / Build Reference','Notes') }
        if (-not $update.fields -or @($update.fields.PSObject.Properties).Count -eq 0) { throw 'Empty technical fields.' }
        foreach ($field in $update.fields.PSObject.Properties) {
            if ($field.Name -notin $allowed) { throw "Protected field: $($field.Name)" }
            if ($field.Value -isnot [string] -or -not $field.Value.Trim() -or $field.Value -match '^\s*[=+@-]') {
                throw "Unsafe or empty literal: $($field.Name)"
            }
            if ($field.Name -eq 'Status' -and $field.Value -notin @('Ready to Test','Pass','Fail','Blocked','N/A')) {
                throw 'Owner-only or unsupported status.'
            }
            if ($field.Name -eq 'Status' -and $update.sheet -in @('Functional Acceptance','End-to-End Tests') -and $field.Value -ne 'Ready to Test') {
                throw 'Owner-UAT rows may only move to Ready to Test.'
            }
            if ($field.Name -eq 'Execution Owner' -and $field.Value -ne 'COPILOT') { throw 'Technical execution owner must be COPILOT.' }
            if ($field.Name -eq 'Environment' -and $field.Value -notin @('Local/Test','Source/Build Inspection')) { throw 'No production claim permitted by this tool.' }
            if ($field.Name -in @('Tested Date','Verification Date')) {
                [void][datetime]::ParseExact($field.Value,'yyyy-MM-dd',[cultureinfo]::InvariantCulture)
            }
            if ($field.Name -eq 'Defect ID' -and $field.Value -notmatch '^MEALS-DEF-\d{3}$') { throw 'Invalid Defect ID.' }
        }
        if (-not $update.fields.Status) { throw 'Each update requires an explicit status.' }
        $evidence = $update.fields.'Evidence / Build Reference'
        if ($update.sheet -eq 'Database Verification') { $evidence = $update.fields.'Evidence / Export' }
        if (-not $evidence) { throw 'Each technical update requires evidence.' }
    }
    return $plan
}

function Get-PackageSnapshot([string]$Path) {
    $archive = [IO.Compression.ZipFile]::OpenRead($Path)
    try {
        function Read-Xml([string]$Name) {
            $entry = $archive.GetEntry($Name)
            if (-not $entry) { throw "Missing workbook part: $Name" }
            $reader = [IO.StreamReader]::new($entry.Open())
            try { return [xml]$reader.ReadToEnd() } finally { $reader.Dispose() }
        }
        $strings = @()
        $shared = Read-Xml 'xl/sharedStrings.xml'
        foreach ($item in $shared.DocumentElement.ChildNodes) { $strings += $item.InnerText }
        $snapshot = @{ cells=@{}; structure=@{}; rowHeights=@{} }
        $workbook = Read-Xml 'xl/workbook.xml'
        $snapshot.structure['workbookSheets'] = $workbook.workbook.sheets.OuterXml
        $snapshot.structure['definedNames'] = [string]$workbook.workbook.definedNames.OuterXml
        foreach ($entry in $archive.Entries) {
            if ($entry.FullName -match '^xl/worksheets/sheet\d+\.xml$') {
                $xml = Read-Xml $entry.FullName
                $ns = [Xml.XmlNamespaceManager]::new($xml.NameTable)
                $ns.AddNamespace('m','http://schemas.openxmlformats.org/spreadsheetml/2006/main')
                foreach ($cell in $xml.SelectNodes('//m:sheetData/m:row/m:c',$ns)) {
                    if ($cell.t -eq 'e') { throw "Formula error in workbook package: $($cell.r)" }
                    $value = [string]$cell.v
                    if ($cell.t -eq 's') { $value = $strings[[int]$value] }
                    if ($cell.t -eq 'inlineStr') { $value = $cell.is.InnerText }
                    $formula = [string]$cell.f
                    if ($formula) { $value='' }
                    $snapshot.cells["$($entry.FullName)!$($cell.r)"] = @([string]$cell.s,$formula,$value) | ConvertTo-Json -Compress
                }
                foreach ($tag in @('cols','pane','dataValidation','conditionalFormatting','mergeCell','sheetFormatPr')) {
                    $nodes = @($xml.SelectNodes("//m:$tag",$ns) | ForEach-Object { $_.OuterXml })
                    $snapshot.structure["$($entry.FullName):$tag"] = $nodes | ConvertTo-Json -Compress
                }
                $defaultHeight=[double]::Parse($xml.worksheet.sheetFormatPr.defaultRowHeight,[cultureinfo]::InvariantCulture)
                $sheetIndex=[int]([regex]::Match($entry.FullName,'sheet(\d+)').Groups[1].Value)
                $heights=@{}
                $snapshot.structure["$($entry.FullName):rowLayout"] = @(
                    $xml.SelectNodes('//m:sheetData/m:row',$ns) | ForEach-Object {
                        $height=$defaultHeight
                        if ($_.HasAttribute('ht')) { $height=[double]::Parse($_.GetAttribute('ht'),[cultureinfo]::InvariantCulture) }
                        $heights[[int]$_.r]=$height
                        "$($_.r):$(Get-EffectiveRowLayout $_ $defaultHeight)"
                    }
                ) | ConvertTo-Json -Compress
                $snapshot.rowHeights[$sheetIndex]=$heights
            }
            if ($entry.FullName -match '^xl/(styles\.xml|tables/.*\.xml)$') {
                $snapshot.structure[$entry.FullName] = (Read-Xml $entry.FullName).OuterXml
            }
        }
        return $snapshot
    }
    finally { $archive.Dispose() }
}

function Assert-Preserved($Before,$After,$Allowed) {
    foreach ($key in $Before.structure.Keys) {
        if ($Before.structure[$key] -ne $After.structure[$key]) { throw "Workbook structure changed: $key" }
    }
    if ($Before.structure.Count -ne $After.structure.Count) { throw 'Workbook structure inventory changed.' }
    foreach ($key in $Before.cells.Keys) {
        if ($Allowed.ContainsKey($key)) { continue }
        if ($Before.cells[$key] -ne $After.cells[$key]) { throw "Protected cell changed: $key" }
    }
    foreach ($key in $After.cells.Keys) {
        if (-not $Before.cells.ContainsKey($key) -and -not $Allowed.ContainsKey($key)) {
            $cell = $After.cells[$key] | ConvertFrom-Json
            if ($cell[1] -or $cell[2]) { throw "Unexpected new content: $key" }
        }
    }
    foreach ($key in $Allowed.Keys) {
        $current = $After.cells[$key] | ConvertFrom-Json
        if ($current[1] -or $current[2] -ne $Allowed[$key]) { throw "Update did not persist correctly: $key" }
        if ($Before.cells.ContainsKey($key)) {
            $old = $Before.cells[$key] | ConvertFrom-Json
            if ($old[0] -ne $current[0] -or $old[1]) { throw "Updated cell formatting/formula changed: $key" }
        }
    }
}

function Assert-CoveragePointers($Snapshot) {
    $lookups=@{}
    foreach ($pair in @(@('Functional Acceptance',3),@('Security Acceptance',4),@('Database Verification',5),@('End-to-End Tests',6))) {
        $ids=@{}
        foreach ($key in $Snapshot.cells.Keys) {
            if ($key -match "^xl/worksheets/sheet$($pair[1])\.xml!B\d+$") {
                $value=($Snapshot.cells[$key] | ConvertFrom-Json)[2]
                if ($value) { $ids[$value]=$true }
            }
        }
        $lookups[$pair[0]]=$ids
    }
    foreach ($key in $Snapshot.cells.Keys) {
        if ($key -match '^xl/worksheets/sheet7\.xml!H(\d+)$') {
            $row=$Matches[1]
            $location=($Snapshot.cells[$key] | ConvertFrom-Json)[2]
            if ($lookups.ContainsKey($location)) {
                $pointer=($Snapshot.cells["xl/worksheets/sheet7.xml!I$row"] | ConvertFrom-Json)[2]
                if ($pointer -and -not $lookups[$location].ContainsKey($pointer)) { throw "Unresolved Coverage pointer: $pointer" }
            }
        }
    }
}

$plan = Read-UpdatePlan
if ($ExpectedSha256 -notmatch '^[a-fA-F0-9]{64}$') { throw 'Expected SHA-256 is required.' }
if ($ValidateOnly) { 'Technical update plan validation: PASS'; return }
$path = (Resolve-Path -LiteralPath $WorkbookPath).Path
if ((Get-FileHash -LiteralPath $path -Algorithm SHA256).Hash -ne $ExpectedSha256) { throw 'Workbook hash mismatch.' }
$before = Get-PackageSnapshot $path
Assert-CoveragePointers $before
$backup = Join-Path ([IO.Path]::GetTempPath()) ("meals-ledger-" + [guid]::NewGuid() + '.xlsx')
[IO.File]::Copy($path,$backup,$false)
$excel=$null
$book=$null
$saved=$false
$verified=$false
$allowed=@{}
$report=@()
try {
    $excel=New-Object -ComObject Excel.Application
    $excel.Visible=$false
    $excel.DisplayAlerts=$false
    $excel.AutomationSecurity=3
    $excel.AskToUpdateLinks=$false
    $book=$excel.Workbooks.Open($path,0,$false)
    if ($book.ReadOnly -or $book.Worksheets.Count -ne 7) { throw 'Workbook is locked or schema differs.' }
    foreach ($update in $plan.updates) {
        $sheet=$book.Worksheets.Item($update.sheet)
        if ($sheet.ListObjects.Count -ne 1) { throw 'Expected one controlled ledger table.' }
        $table=$sheet.ListObjects.Item(1)
        $headers=@{}
        for ($c=1; $c -le $table.Range.Columns.Count; $c++) {
            $header=[string]$sheet.Cells.Item(1,$c).Value2
            if ($headers.ContainsKey($header)) { throw 'Duplicate header.' }
            $headers[$header]=$c
        }
        $idHeader='Test ID'
        if ($update.sheet -eq 'Database Verification') { $idHeader='Check ID' }
        if ($update.sheet -eq 'End-to-End Tests') { $idHeader='Scenario ID' }
        if (-not $headers.ContainsKey($idHeader)) { throw 'Stable ID header missing.' }
        $matches=@()
        for ($r=2; $r -le $table.Range.Rows.Count; $r++) {
            if ($sheet.Cells.Item($r,$headers[$idHeader]).Value2 -eq $update.id) { $matches+=$r }
        }
        if ($matches.Count -ne 1) { throw "Stable ID must resolve exactly once: $($update.id)" }
        $row=$matches[0]
        if ($sheet.Cells.Item($row,$headers.Status).Value2 -ne 'Not Built') {
            throw "Existing result is protected; requires a separately reviewed retest: $($update.id)"
        }
        $fields=@{'Test Run ID'=$plan.testRunId}
        foreach ($field in $update.fields.PSObject.Properties) { $fields[$field.Name]=$field.Value }
        foreach ($header in $fields.Keys) {
            if (-not $headers.ContainsKey($header)) { throw "Header missing: $header" }
            $cell=$sheet.Cells.Item($row,$headers[$header])
            if ($cell.HasFormula) { throw 'Formula cells cannot be updated.' }
            $old=[string]$cell.Value2
            $value=$fields[$header]
            if ($old -eq $value) { continue }
            if ($header -ne 'Status' -and $old) { throw "Existing technical content is protected: $($update.id) / $header" }
            if ($header -in @('Tested Date','Verification Date')) {
                $serial=([datetime]::ParseExact($value,'yyyy-MM-dd',[cultureinfo]::InvariantCulture)).ToOADate()
                $cell.GetType().InvokeMember('Value2',[Reflection.BindingFlags]::SetProperty,$null,$cell,@($serial))
                $value=([double]$cell.Value2).ToString([cultureinfo]::InvariantCulture)
            }
            else { $cell.Value2=$value }
            $sheetIndex=$sheet.Index
            $allowed["xl/worksheets/sheet${sheetIndex}.xml!$($cell.Address($false,$false))"]=[string]$value
            $report+=@{sheet=$sheet.Name; id=$update.id; row=$row; cell=$cell.Address($false,$false); field=$header; old=$old; new=$value}
        }
    }
    $excel.CalculateFullRebuild()
    $reopenHeights=Restore-WorkbookRowHeights $book $before.rowHeights
    foreach ($sheet in $book.Worksheets) {
        foreach ($cell in $sheet.UsedRange.Cells) {
            if ($cell.Text -match '^#(REF!|VALUE!|DIV/0!|NAME\?|N/A$|NUM!|SPILL!|CALC!|NULL!)') {
                throw "Formula error: $($sheet.Name)!$($cell.Address())"
            }
        }
    }
    $book.Worksheets.Item('Read Me').Activate()
    $saved=$true
    $book.Save()
    $book.Close($false)
    [void][Runtime.InteropServices.Marshal]::FinalReleaseComObject($book)
    $book=$null
    $after=Get-PackageSnapshot $path
    Assert-Preserved $before $after $allowed
    Assert-CoveragePointers $after
    $book=$excel.Workbooks.Open($path,0,$true)
    if (-not $book.ReadOnly -or $book.Worksheets.Count -ne 7) { throw 'Normal reopen verification failed.' }
    $excel.CalculateFullRebuild()
    Assert-WorkbookRowHeights $book $reopenHeights
    $verified=$true
    @{beforeSha256=$ExpectedSha256; afterSha256=(Get-FileHash -LiteralPath $path -Algorithm SHA256).Hash; changes=$report; normalReopen=$true} | ConvertTo-Json -Depth 8
}
finally {
    if ($book) { $book.Close($false); [void][Runtime.InteropServices.Marshal]::FinalReleaseComObject($book) }
    if ($excel) { $excel.Quit(); [void][Runtime.InteropServices.Marshal]::FinalReleaseComObject($excel) }
    [GC]::Collect()
    [GC]::WaitForPendingFinalizers()
    if ($saved -and -not $verified) {
        [IO.File]::Copy($backup,$path,$true)
        if ((Get-FileHash -LiteralPath $path -Algorithm SHA256).Hash -ne $ExpectedSha256) { throw "RESTORE FAILED. Original recovery copy: $backup" }
        Write-Warning 'Verification failed. Original workbook bytes restored; no update accepted.'
    }
    if ((-not $saved) -or $verified -or (Get-FileHash -LiteralPath $path -Algorithm SHA256).Hash -eq $ExpectedSha256) {
        Remove-Item -LiteralPath $backup
    }
}
