const assert = require("node:assert/strict");
const { spawnSync } = require("node:child_process");
const crypto = require("node:crypto");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const test = require("node:test");

const root = path.join(__dirname, "..");
const tool = path.join(root, "scripts", "update-meals-workbook.ps1");
const workbook = path.join(root, "spec", "meals", "Meals Acceptance Checklist v1.0.xlsx");
const hash = (file) => crypto.createHash("sha256").update(fs.readFileSync(file)).digest("hex");
const update = { sheet: "Functional Acceptance", id: "NAV-001-T01",
  fields: { Status: "Ready to Test", "Tested Date": "2026-10-28", "Evidence / Build Reference": "synthetic validation fixture",
    "Defect / Notes": "Long wrapped technical evidence must preserve the existing effective row height. ".repeat(8) } };
const plan = (item) => ({ testRunId: "P0-TECH-999", updates: [item] });

test("workbook tooling rejects protected fields/statuses, formula injection, missing evidence and duplicate IDs before Excel",
  { skip: process.platform !== "win32" }, () => {
    const directory = fs.mkdtempSync(path.join(os.tmpdir(), "meals-policy-"));
    const before = hash(workbook);
    try {
      const cases = [
        { ...update, fields: { ...update.fields, "Test ID": "changed" } },
        { ...update, fields: { ...update.fields, "Expected Result": "changed" } },
        { ...update, fields: { ...update.fields, "Requirement ID": "changed" } },
        { ...update, fields: { ...update.fields, "Test Steps": "changed" } },
        { ...update, sheet: "Summary", fields: { "Final Decision": "Accepted" } },
        ...["Pass", "Fail", "Pass with Known Issue", "Accepted"].map((Status) => ({
          ...update, fields: { ...update.fields, Status },
        })),
        { ...update, fields: { ...update.fields, "Defect / Notes": "=HYPERLINK(\"unsafe\")" } },
        { ...update, fields: { ...update.fields, "Defect / Notes": "\t=HYPERLINK(\"unsafe\")" } },
        { ...update, fields: { Status: "Ready to Test" } },
      ];
      const plans = cases.map(plan).concat([{ testRunId: "P0-TECH-999", updates: [update, update] }]);
      const plansFile = path.join(directory, "cases.json");
      fs.writeFileSync(plansFile, JSON.stringify(plans));
      const runner = path.join(directory, "runner.ps1");
      fs.writeFileSync(runner, `
$ErrorActionPreference='Stop'
$cases=Get-Content -LiteralPath '${plansFile.replaceAll("'", "''")}' -Raw | ConvertFrom-Json
$index=0
foreach ($case in $cases) {
  $p=Join-Path '${directory.replaceAll("'", "''")}' 'plan.json'
  $case | ConvertTo-Json -Depth 10 | Set-Content -LiteralPath $p -Encoding UTF8
  $rejected=$false
  try { & '${tool.replaceAll("'", "''")}' -UpdatesPath $p -ExpectedSha256 '${before}' -ValidateOnly }
  catch { $rejected=$true }
  if (-not $rejected) { throw "Unsafe plan accepted: $index" }
  $index++
}
"Rejected $index unsafe plans."
`);
      const result = spawnSync("powershell", ["-NoProfile", "-ExecutionPolicy", "Bypass", "-File", runner], { encoding: "utf8", timeout: 60000 });
      assert.equal(result.status, 0, result.stdout + result.stderr);
      assert.match(result.stdout, /Rejected 13 unsafe plans/);
      assert.equal(hash(workbook), before);
    } finally { fs.rmSync(directory, { recursive: true, force: true }); }
  });

test("Excel updater preserves package integrity on an isolated workbook copy and refuses an unsafe overwrite",
  { skip: process.platform !== "win32", timeout: 180000 }, () => {
    const directory = fs.mkdtempSync(path.join(os.tmpdir(), "meals-excel-test-"));
    const originalHash = hash(workbook);
    try {
      const copy = path.join(directory, "ledger.xlsx");
      fs.copyFileSync(workbook, copy);
      // Only the disposable fixture is reset; tests must not depend on the live ledger's UAT progress.
      const prepare = path.join(directory, "prepare.ps1");
      fs.writeFileSync(prepare, `
$ErrorActionPreference='Stop'
$excel=$null
$book=$null
try {
  $excel=New-Object -ComObject Excel.Application
  $excel.Visible=$false
  $excel.DisplayAlerts=$false
  $excel.AutomationSecurity=3
  $book=$excel.Workbooks.Open('${copy.replaceAll("'", "''")}',0,$false)
  $sheet=$book.Worksheets.Item('Functional Acceptance')
  if ($sheet.Range('B2').Value2 -ne 'NAV-001-T01') { throw 'Fixture ID changed.' }
  foreach ($address in @('A2','M2','N2','O2','P2')) { $sheet.Range($address).ClearContents() | Out-Null }
  $sheet.Range('L2').Value2='Not Built'
  $book.Save()
}
finally {
  if ($book) { $book.Close($false); [void][Runtime.InteropServices.Marshal]::FinalReleaseComObject($book) }
  if ($excel) { $excel.Quit(); [void][Runtime.InteropServices.Marshal]::FinalReleaseComObject($excel) }
  [GC]::Collect()
  [GC]::WaitForPendingFinalizers()
}
`);
      const prepared = spawnSync("powershell", ["-NoProfile", "-ExecutionPolicy", "Bypass", "-File", prepare],
        { encoding: "utf8", timeout: 60000 });
      assert.equal(prepared.status, 0, prepared.stdout + prepared.stderr);
      const fixtureHash = hash(copy);
      const input = path.join(directory, "plan.json");
      fs.writeFileSync(input, JSON.stringify(plan(update)));
      const run = (expected, validateOnly = false) => spawnSync("powershell", [
        "-NoProfile", "-ExecutionPolicy", "Bypass", "-File", tool,
        "-WorkbookPath", copy, "-UpdatesPath", input, "-ExpectedSha256", expected,
        ...(validateOnly ? ["-ValidateOnly"] : []),
      ], { encoding: "utf8", timeout: 150000, maxBuffer: 1024 * 1024 });
      let result = run("0".repeat(64));
      assert.notEqual(result.status, 0);
      assert.equal(hash(copy), fixtureHash);
      result = run(fixtureHash);
      assert.equal(result.status, 0, result.stdout + result.stderr);
      assert.match(result.stdout, /"normalReopen":\s*true/);
      const changedHash = hash(copy);
      assert.notEqual(changedHash, fixtureHash);
      result = run(changedHash);
      assert.notEqual(result.status, 0);
      assert.match(result.stderr, /Existing result is protected/);
      assert.equal(hash(copy), changedHash);
      assert.equal(hash(workbook), originalHash, "Tests must never update the controlled workbook.");
    } finally { fs.rmSync(directory, { recursive: true, force: true }); }
  });
