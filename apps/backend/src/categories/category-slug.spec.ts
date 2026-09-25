import { addCategorySlugSuffix, createCategorySlug } from './category-slug.js';

describe('category slug helpers', () => {
  it('normalizes Vietnamese names into URL-safe slugs', () => {
    expect(createCategorySlug('  Chăm sóc sức khỏe  ')).toBe(
      'cham-soc-suc-khoe',
    );
  });

  it('uses a fallback and keeps suffixed slugs within 150 characters', () => {
    expect(createCategorySlug('---')).toBe('category');
    expect(addCategorySlugSuffix('a'.repeat(150), 'ABCD-1234')).toBe(
      `${'a'.repeat(141)}-abcd1234`,
    );
  });
});
