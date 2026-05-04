/**
 * Property unwrappers — Notion's API returns verbose property objects
 * (e.g. { type: 'rich_text', rich_text: [{ plain_text: 'foo', ... }] }).
 * These helpers extract the plain JS value the rest of the code wants.
 */

type AnyProps = Record<string, any>;

export function getTitle(props: AnyProps, key = 'Name'): string {
  const arr = props[key]?.title ?? [];
  return arr.map((t: any) => t.plain_text ?? '').join('').trim();
}

export function getRichText(props: AnyProps, key: string): string {
  const arr = props[key]?.rich_text ?? [];
  return arr.map((t: any) => t.plain_text ?? '').join('').trim();
}

export function getSelect(props: AnyProps, key: string): string | null {
  return props[key]?.select?.name ?? null;
}

export function getMultiSelect(props: AnyProps, key: string): string[] {
  return (props[key]?.multi_select ?? []).map((o: any) => o.name);
}

export function getNumber(props: AnyProps, key: string): number | null {
  return props[key]?.number ?? null;
}

export function getUrl(props: AnyProps, key: string): string | null {
  return props[key]?.url ?? null;
}

export function getDate(props: AnyProps, key: string): string | null {
  return props[key]?.date?.start ?? null;
}

export function getRelationIds(props: AnyProps, key: string): string[] {
  return (props[key]?.relation ?? []).map((r: any) => r.id);
}
