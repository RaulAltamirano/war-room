export function clipLines(lines, max = 1024) {
  const rows = (lines || []).map((line) => String(line));
  if (!rows.length) return '';
  if (rows.join('\n').length <= max) return rows.join('\n');

  let best = '';
  for (let n = 1; n <= rows.length; n++) {
    const rest = rows.length - n;
    const note = rest > 0 ? `…y ${rest} más` : '';
    const body = rows.slice(0, n).join('\n');
    const text = note ? `${body}\n${note}` : body;
    if (text.length > max) break;
    best = text;
  }
  if (best) return best;

  const rest = rows.length - 1;
  const note = rest > 0 ? `\n…y ${rest} más` : '';
  const room = max - note.length;
  const line = rows[0];
  if (room <= 1) return `${line.slice(0, Math.max(0, max - 1))}…`.slice(0, max);
  return `${line.slice(0, room - 1)}…${note}`;
}

export function chunkContent(text, max = 2000) {
  const lines = String(text || '').split('\n');
  const chunks = [];
  let cur = '';
  const pushLong = (line) => {
    for (let i = 0; i < line.length; i += max) chunks.push(line.slice(i, i + max));
  };
  for (const line of lines) {
    if (!cur) {
      if (line.length <= max) cur = line;
      else pushLong(line);
      continue;
    }
    const piece = `${cur}\n${line}`;
    if (piece.length <= max) {
      cur = piece;
      continue;
    }
    chunks.push(cur);
    if (line.length <= max) cur = line;
    else {
      pushLong(line);
      cur = '';
    }
  }
  if (cur) chunks.push(cur);
  return chunks;
}

export async function postWebhook(fetchImpl, webhookUrl, payload) {
  try {
    const res = await fetchImpl(webhookUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    return { ok: Boolean(res?.ok), status: res?.status ?? 0 };
  } catch (err) {
    return { ok: false, status: 0, error: err?.message || String(err) };
  }
}
