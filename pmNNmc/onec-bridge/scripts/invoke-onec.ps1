param(
    [Parameter(Mandatory = $true)]
    [ValidateSet("list", "detail")]
    [string]$Action,

    [Parameter(Mandatory = $true)]
    [string]$InputBase64
)

$ErrorActionPreference = "Stop"
[Console]::OutputEncoding = [System.Text.UTF8Encoding]::new($false)

function Require-Environment([string]$Name) {
    $value = [Environment]::GetEnvironmentVariable($Name)
    if ([string]::IsNullOrWhiteSpace($value)) {
        throw "Missing environment variable: $Name"
    }
    return $value
}

function Escape-OneCString([string]$Value) {
    return $Value.Replace('"', '""')
}

function Convert-OneCValue($Value) {
    if ($null -eq $Value) {
        return $null
    }

    if ($Value -is [datetime]) {
        return $Value.ToString("o")
    }

    return $Value
}

function Is-SupplementalTimeType([string]$Value) {
    $normalized = $Value.Trim().ToLowerInvariant()
    if ([string]::IsNullOrWhiteSpace($normalized)) {
        return $false
    }

    return (
        $normalized.Contains("ночн") -or
        $normalized.Contains("празднич") -or
        $normalized.Contains("мерек") -or
        $normalized.Contains("сверхуроч") -or
        $normalized.Contains("дополнительн")
    )
}

function Is-DayOffType([string]$Value) {
    $normalized = $Value.Trim().ToLowerInvariant()
    return (
        $normalized.Contains("выходн") -or
        $normalized.Contains("демалыс")
    )
}

function Pick-DayValue($Candidates) {
    foreach ($candidate in $Candidates) {
        $hours = [decimal]$candidate.hours
        $timeType = [string]$candidate.timeType
        if ((-not (Is-SupplementalTimeType $timeType)) -and $hours -gt 0) {
            return [string]$hours
        }
    }

    foreach ($candidate in $Candidates) {
        $timeType = [string]$candidate.timeType
        if (
            -not [string]::IsNullOrWhiteSpace($timeType) -and
            -not (Is-SupplementalTimeType $timeType) -and
            -not (Is-DayOffType $timeType)
        ) {
            return $timeType
        }
    }

    return ""
}

$server = Escape-OneCString (Require-Environment "ONEC_SERVER")
$database = Escape-OneCString (Require-Environment "ONEC_DATABASE")
$credentialPath = [Environment]::GetEnvironmentVariable("ONEC_CREDENTIAL_PATH")
if (-not [string]::IsNullOrWhiteSpace($credentialPath)) {
    $credential = Import-Clixml -LiteralPath $credentialPath
    $user = Escape-OneCString $credential.UserName
    $pointer = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($credential.Password)
    try {
        $password = Escape-OneCString ([Runtime.InteropServices.Marshal]::PtrToStringBSTR($pointer))
    } finally {
        [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($pointer)
    }
} else {
    $user = Escape-OneCString (Require-Environment "ONEC_USER")
    $password = Escape-OneCString (Require-Environment "ONEC_PASSWORD")
}
$connectionString = 'Srvr="' + $server + '";Ref="' + $database + '";Usr="' + $user + '";Pwd="' + $password + '";'
$inputJson = [Text.Encoding]::UTF8.GetString([Convert]::FromBase64String($InputBase64))
$input = $inputJson | ConvertFrom-Json

$connector = New-Object -ComObject V83.COMConnector
$base = $connector.Connect($connectionString)

if ($Action -eq "list") {
    $limit = [Math]::Max(1, [Math]::Min([int]$input.limit, 2000))
    $query = $base.NewObject("Query")
    $where = @("Табель.Проведен = ИСТИНА")
    $hasPeriod = [int]$input.year -gt 0 -and [int]$input.month -ge 1 -and [int]$input.month -le 12
    $department = [string]$input.department

    if ($hasPeriod) {
        $dateFrom = [datetime]::new([int]$input.year, [int]$input.month, 1)
        $dateTo = $dateFrom.AddMonths(1)
        $where += "Табель.ПериодРегистрации >= &ДатаНачала"
        $where += "Табель.ПериодРегистрации < &ДатаОкончания"
    }

    if (-not [string]::IsNullOrWhiteSpace($department)) {
        $where += "Табель.Подразделение.Наименование = &Подразделение"
    }

    $query.Text = @"
ВЫБРАТЬ ПЕРВЫЕ $limit
    Табель.Дата,
    Табель.Номер,
    Табель.ПериодРегистрации,
    ПРЕДСТАВЛЕНИЕ(Табель.Организация),
    ПРЕДСТАВЛЕНИЕ(Табель.Подразделение),
    Табель.ДатаНачалаПериода,
    Табель.ДатаОкончанияПериода,
    Табель.Проведен
ИЗ
    Документ.ТабельУчетаРабочегоВремени КАК Табель
ГДЕ
    $($where -join "`n    И ")
УПОРЯДОЧИТЬ ПО
    Табель.Дата УБЫВ
"@

    if ($hasPeriod) {
        $query.SetParameter("ДатаНачала", $dateFrom)
        $query.SetParameter("ДатаОкончания", $dateTo)
    }
    if (-not [string]::IsNullOrWhiteSpace($department)) {
        $query.SetParameter("Подразделение", $department)
    }

    $selection = $query.Execute().Select()
    $items = @()
    while ($selection.Next()) {
        $items += [ordered]@{
            date = Convert-OneCValue $selection.Get(0)
            number = [string]$selection.Get(1)
            period = Convert-OneCValue $selection.Get(2)
            organization = [string]$selection.Get(3)
            department = [string]$selection.Get(4)
            dateFrom = Convert-OneCValue $selection.Get(5)
            dateTo = Convert-OneCValue $selection.Get(6)
            conducted = [bool]$selection.Get(7)
        }
    }

    ConvertTo-Json -InputObject @($items) -Depth 8 -Compress
    exit 0
}

$number = [string]$input.number
$documentDate = [datetime]::Parse([string]$input.date, [Globalization.CultureInfo]::InvariantCulture)

$metaQuery = $base.NewObject("Query")
$metaQuery.Text = @"
ВЫБРАТЬ ПЕРВЫЕ 1
    Табель.Дата,
    Табель.Номер,
    Табель.ПериодРегистрации,
    ПРЕДСТАВЛЕНИЕ(Табель.Организация),
    ПРЕДСТАВЛЕНИЕ(Табель.Подразделение),
    Табель.ДатаНачалаПериода,
    Табель.ДатаОкончанияПериода,
    Табель.Проведен
ИЗ
    Документ.ТабельУчетаРабочегоВремени КАК Табель
ГДЕ
    Табель.Номер = &Номер
    И Табель.Дата = &Дата
    И Табель.Проведен = ИСТИНА
"@
$metaQuery.SetParameter("Номер", $number)
$metaQuery.SetParameter("Дата", $documentDate)
$metaSelection = $metaQuery.Execute().Select()
if (-not $metaSelection.Next()) {
    "null"
    exit 0
}

$meta = [ordered]@{
    date = Convert-OneCValue $metaSelection.Get(0)
    number = [string]$metaSelection.Get(1)
    period = Convert-OneCValue $metaSelection.Get(2)
    organization = [string]$metaSelection.Get(3)
    department = [string]$metaSelection.Get(4)
    dateFrom = Convert-OneCValue $metaSelection.Get(5)
    dateTo = Convert-OneCValue $metaSelection.Get(6)
    conducted = [bool]$metaSelection.Get(7)
}

$fields = @(
    "Данные.НомерСтроки",
    "ПРЕДСТАВЛЕНИЕ(Данные.Сотрудник)",
    "ПРЕДСТАВЛЕНИЕ(Данные.Должность)",
    "ПРЕДСТАВЛЕНИЕ(Данные.КатегорияДолжности)"
)
for ($day = 1; $day -le 31; $day++) {
    $fields += "Данные.Часов$day"
    $fields += "ПРЕДСТАВЛЕНИЕ(Данные.ВидВремени$day)"
}

$rowsQuery = $base.NewObject("Query")
$rowsQuery.Text = @"
ВЫБРАТЬ
    $($fields -join ",`n    ")
ИЗ
    Документ.ТабельУчетаРабочегоВремени.ДанныеОВремени КАК Данные
ГДЕ
    Данные.Ссылка.Номер = &Номер
    И Данные.Ссылка.Дата = &Дата
    И Данные.Ссылка.Проведен = ИСТИНА
УПОРЯДОЧИТЬ ПО
    Данные.НомерСтроки
"@
$rowsQuery.SetParameter("Номер", $number)
$rowsQuery.SetParameter("Дата", $documentDate)
$rowSelection = $rowsQuery.Execute().Select()

$employees = [ordered]@{}
while ($rowSelection.Next()) {
    $fio = [string]$rowSelection.Get(1)
    $position = [string]$rowSelection.Get(2)
    $category = [string]$rowSelection.Get(3)
    if ([string]::IsNullOrWhiteSpace($fio)) {
        continue
    }

    $key = "$fio`n$position`n$category"
    if (-not $employees.Contains($key)) {
        $employees[$key] = [ordered]@{
            fio = $fio
            position = $position
            category = $category
            candidates = @{}
        }
        for ($day = 1; $day -le 31; $day++) {
            $employees[$key].candidates[[string]$day] = @()
        }
    }

    for ($day = 1; $day -le 31; $day++) {
        $offset = 4 + (($day - 1) * 2)
        $rawHours = $rowSelection.Get($offset)
        $hours = [decimal]0
        if ($null -ne $rawHours) {
            try {
                $hours = [decimal]$rawHours
            } catch {
                $hours = [decimal]0
            }
        }
        $employees[$key].candidates[[string]$day] += [ordered]@{
            hours = $hours
            timeType = [string]$rowSelection.Get($offset + 1)
        }
    }
}

$employeeItems = @()
foreach ($entry in $employees.GetEnumerator()) {
    $days = [ordered]@{}
    for ($day = 1; $day -le 31; $day++) {
        $days[[string]$day] = Pick-DayValue $entry.Value.candidates[[string]$day]
    }
    $employeeItems += [ordered]@{
        fio = $entry.Value.fio
        position = $entry.Value.position
        category = $entry.Value.category
        days = $days
    }
}

([ordered]@{
    timesheet = $meta
    employees = $employeeItems
}) | ConvertTo-Json -Depth 12 -Compress
