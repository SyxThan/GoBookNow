import { addServiceSlugSuffix, createServiceSlug } from './service-slug.js';

describe('service slug helpers', () => {
  it('normalizes Vietnamese titles into URL-safe slugs', () => {
    expect(createServiceSlug('  Massage thư giãn 60 phút  ')).toBe(
      'massage-thu-gian-60-phut',
    );
  });

  it('uses a fallback and keeps suffixed slugs within 200 characters', () => {
    expect(createServiceSlug('---')).toBe('service');
    expect(addServiceSlugSuffix('a'.repeat(200), 'ABCD-1234')).toBe(
      `${'a'.repeat(191)}-abcd1234`,
    );
  });
});
