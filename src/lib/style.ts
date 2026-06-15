/**
 * View-layer style helpers — small functions that produce inline `style`
 * attribute strings for the ONE legitimate case where a value is per-instance
 * and content-driven (so it can't live in a static stylesheet): passing a
 * Notion data value into CSS as a custom property.
 *
 * CSS rules consume these via `var(--industry-color)` etc.; the hex never
 * appears in a stylesheet, and every call site emits the SAME shape.
 */

/**
 * Inline style that hands an industry's brand color (a Notion data value)
 * to CSS as `--industry-color`. Optionally appends a background image.
 * Returns '' when there's no color, so callers don't emit an empty var.
 *
 *   <article style={industryVars(industry.color)}>
 *   <a style={industryVars(industry.color, { bgImage: industry.heroImage })}>
 */
export function industryVars(
  color: string | null | undefined,
  opts: { bgImage?: string | null } = {},
): string {
  const parts: string[] = [];
  if (color) parts.push(`--industry-color:${color}`);
  if (opts.bgImage) parts.push(`background-image:url('${opts.bgImage}')`);
  return parts.join(';');
}
