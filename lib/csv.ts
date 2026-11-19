// CSV as RFC 4180 has it: fields split by commas, rows by CRLF or LF, a quoted field may hold commas,
// line breaks and "" for a quote. A leading byte order mark is dropped. Blank lines come back as [""].
export function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let quoted = false;
  let i = text.charCodeAt(0) === 0xfeff ? 1 : 0;
  for (; i < text.length; i++) {
    const c = text[i];
    if (quoted) {
      if (c !== '"') field += c;
      else if (text[i + 1] === '"') field += text[++i];
      else quoted = false;
    } else if (c === '"' && field === "") quoted = true;
    else if (c === ",") {
      row.push(field);
      field = "";
    } else if (c === "\n" || c === "\r") {
      if (c === "\r" && text[i + 1] === "\n") i++;
      row.push(field);
      rows.push(row);
      row = [];
      field = "";
    } else field += c;
  }
  // The last row, unless the text ended with its line break.
  if (field !== "" || row.length > 0 || quoted) rows.push([...row, field]);
  return rows;
}

// One CSV cell. A value a spreadsheet would run as a formula starts with a quote: a leading =, @, tab or
// carriage return, and a leading + or - unless `plainAddress` and the value is a plain email address
// (letters, digits and . _ % + - only), which a mailing tool needs to read as it is.
const plain = /^[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+$/;
export function csvCell(v: string, plainAddress = false): string {
  const safe = /^[=@\t\r]/.test(v) || (/^[+-]/.test(v) && !(plainAddress && plain.test(v))) ? `'${v}` : v;
  return /[",\n\r]/.test(safe) ? `"${safe.replace(/"/g, '""')}"` : safe;
}
