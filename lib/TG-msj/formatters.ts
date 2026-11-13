/**
 * Funciones de sanitización, formateo de fechas y escape HTML para Telegram
 */

export function escHtml(text: unknown): string {
  return String(text ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

export function htmlToPlainText(html: string): string {
  return html
    .replace(/<a href="([^"]+)">([^<]+)<\/a>/gi, '$2 ($1)')
    .replace(/<\/?(?:b|strong|i|em|code|pre|blockquote)>/gi, '')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&amp;/g, '&');
}

export function formatDateBo(iso: string | null | undefined, fallback = 'Por confirmar'): string {
  if (!iso) return fallback;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return fallback;
  return d.toLocaleDateString('es-BO', { day: '2-digit', month: '2-digit', year: 'numeric' });
}

export function parseCommand(rawText: string): { cmd: string | null; args: string } {
  const trimmed = rawText.trim();
  if (!trimmed.startsWith('/')) {
    return { cmd: null, args: trimmed };
  }
  const spaceIdx = trimmed.search(/\s/);
  const head = spaceIdx === -1 ? trimmed : trimmed.slice(0, spaceIdx);
  const args = spaceIdx === -1 ? '' : trimmed.slice(spaceIdx + 1).trim();
  const cmd = head.split('@')[0].toLowerCase();
  return { cmd, args };
}
