const MAX_SLUG_LENGTH = 200;

export function createServiceSlug(title: string): string {
  const slug = title
    .normalize('NFD')
    .replace(/[đĐ]/g, 'd')
    .replace(/\p{Diacritic}/gu, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, MAX_SLUG_LENGTH)
    .replace(/-+$/g, '');

  return slug || 'service';
}

export function addServiceSlugSuffix(base: string, suffix: string): string {
  const normalizedSuffix = suffix.toLowerCase().replace(/[^a-z0-9]/g, '');
  const prefixLength = MAX_SLUG_LENGTH - normalizedSuffix.length - 1;
  return `${base.slice(0, prefixLength).replace(/-+$/g, '')}-${normalizedSuffix}`;
}
