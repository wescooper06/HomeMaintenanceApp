export async function tripResult(query, operation) {
  const { data, error } = await query;
  if (error) throw new Error(`${operation}: ${error.message}`, { cause: error });
  return data;
}

export async function tripRows(client, table, order) {
  const rows = [];
  for (;;) {
    let query = client.from(table).select("*");
    for (const column of order) query = query.order(column);
    const page = await tripResult(query.range(rows.length, rows.length + 499), `Load ${table}`);
    if (!page.length) return rows;
    rows.push(...page);
  }
}

export function tripUuid(value) {
  const id = String(value ?? "").trim();
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id)) {
    throw new Error("Trip ID must be a UUID referenced by workflow metadata trip_id.");
  }
  return id;
}

export function tripFields(values, mapping) {
  const row = {};
  for (const [field, value] of Object.entries(values)) {
    if (!Object.hasOwn(mapping, field)) throw new Error(`Unsupported field: ${field}`);
    row[mapping[field]] = value;
  }
  return row;
}
