import { describe, it, expect } from 'vitest';
import { runAppStoreReadinessCheck, AppStoreInput } from './appStoreReadiness.js';

describe('appStoreReadiness (experimental)', () => {
  it('passes privacy policy when URL provided and images >=3', () => {
    const input: AppStoreInput = {
      orgId: '00000000-0000-0000-0000-000000000001',
      userId: '00000000-0000-0000-0000-000000000002',
      metadata: {
        privacyPolicyUrl: 'https://example.com/privacy',
        supportEmail: 'support@example.com',
        listingImageCount: 4,
        usesOAuthPublic: false,
      },
    };

    const report = runAppStoreReadinessCheck(input);
    const privacy = report.items.find((i) => i.requirement.id === 'privacy_policy');
    const images = report.items.find((i) => i.requirement.id === 'listing_images');
    const support = report.items.find((i) => i.requirement.id === 'support_contact');

    expect(privacy).toBeDefined();
    expect(privacy!.status).toBe('pass');

    expect(images).toBeDefined();
    expect(images!.status).toBe('pass');

    expect(support).toBeDefined();
    expect(support!.status).toBe('pass');
  });

  it('flags missing privacy policy as fail and missing images as manual_review', () => {
    const input: AppStoreInput = {
      orgId: '00000000-0000-0000-0000-000000000003',
      userId: '00000000-0000-0000-0000-000000000004',
      metadata: {
        supportEmail: undefined,
        listingImageCount: undefined,
      },
    };

    const report = runAppStoreReadinessCheck(input);
    const privacy = report.items.find((i) => i.requirement.id === 'privacy_policy');
    const images = report.items.find((i) => i.requirement.id === 'listing_images');
    const support = report.items.find((i) => i.requirement.id === 'support_contact');

    expect(privacy).toBeDefined();
    expect(privacy!.status).toBe('fail');

    expect(images).toBeDefined();
    expect(images!.status).toBe('manual_review');

    expect(support).toBeDefined();
    expect(support!.status).toBe('manual_review');
  });
});
