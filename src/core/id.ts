// Short, sortable, collision-resistant IDs. Not cryptographic.
// Format: base36 timestamp + 6 random base36 chars.
export function uid(prefix = ''): string {
  const t = Date.now().toString(36);
  const r = Math.floor(Math.random() * 36 ** 6).toString(36).padStart(6, '0');
  return `${prefix}${t}${r}`;
}
