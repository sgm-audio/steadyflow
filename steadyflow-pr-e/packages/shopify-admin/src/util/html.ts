/**
 * HTML utilities for description word counting.
 * Strips tags and decodes common entities before tokenizing.
 */

const ENTITY_MAP: Record<string, string> = {
  '&amp;': '&',
  '&lt;': '<',
  '&gt;': '>',
  '&quot;': '"',
  '&apos;': "'",
  '&nbsp;': ' ',
  '&copy;': '(c)',
  '&reg;': '(r)',
  '&trade;': '(tm)',
  '&hellip;': '...',
  '&mdash;': '--',
  '&ndash;': '-',
  '&lsquo;': "'",
  '&rsquo;': "'",
  '&ldquo;': '"',
  '&rdquo;': '"',
};

export function decodeEntities(s: string): string {
  let out = s;
  // Named entities
  for (const [entity, char] of Object.entries(ENTITY_MAP)) {
    out = out.split(entity).join(char);
  }
  // Numeric entities: &#39;
  out = out.replace(/&#(\d+);/g, (_, dec) => String.fromCharCode(Number(dec)));
  out = out.replace(/&#x([0-9a-f]+);/gi, (_, hex: string) => String.fromCharCode(parseInt(hex, 16)));
  return out;
}

export function stripHtml(html: string): string {
  // Remove script/style blocks entirely (their content shouldn't count)
  let s = html.replace(/<(script|style)[^>]*>[\s\S]*?<\/\1>/gi, ' ');
  // Remove all tags
  s = s.replace(/<[^>]+>/g, ' ');
  // Decode entities
  s = decodeEntities(s);
  // Collapse whitespace
  s = s.replace(/\s+/g, ' ').trim();
  return s;
}

export function wordCount(text: string): number {
  if (!text) return 0;
  const tokens = text.split(/\s+/).filter((t) => t.length > 0);
  return tokens.length;
}

export function descriptionWordCount(html: string): number {
  return wordCount(stripHtml(html));
}
