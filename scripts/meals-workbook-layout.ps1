function Get-EffectiveRowLayout($Row,[double]$DefaultHeight) {
    $attributes=@{}
    foreach ($attribute in $Row.Attributes) {
        if ($attribute.Name -notin @('r','ht','customHeight')) { $attributes[$attribute.Name]=$attribute.Value }
    }
    $height=$DefaultHeight
    if ($Row.HasAttribute('ht')) { $height=[double]::Parse($Row.GetAttribute('ht'),[cultureinfo]::InvariantCulture) }
    $attributes['effectiveHeight']=$height.ToString('R',[cultureinfo]::InvariantCulture)
    return ($attributes.GetEnumerator() | Sort-Object Name | ForEach-Object { "$($_.Name)=$($_.Value)" }) -join ';'
}

function Restore-WorkbookRowHeights($Book,$Heights) {
    $effective=@{}
    foreach ($sheetIndex in $Heights.Keys) {
        $sheet=$Book.Worksheets.Item([int]$sheetIndex)
        $effective[$sheetIndex]=@{}
        foreach ($row in $Heights[$sheetIndex].Keys) {
            # Always pin, even when equal: an automatic wrapped row can grow on reopen.
            $sheet.Rows.Item([int]$row).RowHeight=$Heights[$sheetIndex][$row]
            $effective[$sheetIndex][$row]=$sheet.Rows.Item([int]$row).RowHeight
        }
    }
    return $effective
}

function Assert-WorkbookRowHeights($Book,$Heights) {
    foreach ($sheetIndex in $Heights.Keys) {
        $sheet=$Book.Worksheets.Item([int]$sheetIndex)
        foreach ($row in $Heights[$sheetIndex].Keys) {
            $expected=$Heights[$sheetIndex][$row]
            $actual=$sheet.Rows.Item([int]$row).RowHeight
            if ($actual -ne $expected) {
                throw "Effective row height changed: $($sheet.Name)!$row expected=$expected actual=$actual"
            }
        }
    }
}
