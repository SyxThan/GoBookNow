import { addVendorSlugSuffix, createVendorSlug } from './vendor-slug.js';

describe('vendor slug helpers', () => {
  it('normalizes Vietnamese display names into URL-safe slugs', () => {
    expect(createVendorSlug('  Công ty GoBook Việt Nam  ')).toBe(
      'cong-ty-gobook-viet-nam',
    );
  });

  it('uses a safe fallback and keeps suffixed slugs within 180 characters', () => {
    expect(createVendorSlug('---')).toBe('vendor');
    expect(addVendorSlugSuffix('a'.repeat(180), 'ABCD-1234')).toBe(
      `${'a'.repeat(171)}-abcd1234`,
    );
  });
});
