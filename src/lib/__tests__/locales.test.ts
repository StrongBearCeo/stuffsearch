/**
 * Locale guardrails. AGENTS.md requires every user-facing string to exist in
 * BOTH en and vi; these tests catch a key added to one and forgotten in the
 * other, and pin down that the `{{count}}` strings actually pluralize under
 * our i18next v3-compatibility setup.
 */
import i18next from 'i18next';
import en from '../../locales/en.json';
import vi from '../../locales/vi.json';

type Tree = { [key: string]: unknown };

function flatten(obj: Tree, prefix = ''): string[] {
  return Object.entries(obj).flatMap(([k, v]) => {
    const path = prefix ? `${prefix}.${k}` : k;
    return v && typeof v === 'object' ? flatten(v as Tree, path) : [path];
  });
}

describe('locale files', () => {
  const enKeys = flatten(en as Tree).sort();
  const viKeys = flatten(vi as Tree).sort();

  it('define exactly the same keys in en and vi', () => {
    expect(viKeys.filter((k) => !enKeys.includes(k))).toEqual([]);
    expect(enKeys.filter((k) => !viKeys.includes(k))).toEqual([]);
  });

  it('has no empty strings', () => {
    for (const [name, tree] of [['en', en], ['vi', vi]] as const) {
      for (const key of flatten(tree as Tree)) {
        const value = key.split('.').reduce<unknown>((o, k) => (o as Tree)?.[k], tree);
        expect(typeof value === 'string' && value.length > 0).toBe(true);
        if (typeof value !== 'string' || !value.length) throw new Error(`${name}.${key} is empty`);
      }
    }
  });

  it('ships the keys the new features reference', () => {
    for (const key of [
      'items.count',
      'items.totalValue',
      'items.notValued',
      'items.value',
      'items.tags',
      'items.productLinks',
      'items.openPlace',
      'places.count',
      'places.tags',
      'codes.addByScan',
      'codes.generate',
      'codes.alreadyBound',
      'codes.boundElsewhere',
      'codes.appCode',
      'codes.added',
      'codes.noneHint',
      'codes.optionalHint',
      'tags.add',
      'tags.remove',
      'tags.placeholder',
      'tags.suggestions',
      'tags.clear',
      'links.add',
      'links.remove',
      'links.count',
      'photos.viewFull',
      'photos.zoomHint',
      'scanResolve.otherHousehold',
    ]) {
      expect(enKeys).toContain(key);
    }
  });
});

describe('count strings', () => {
  /** A standalone i18next matching src/lib/i18n.ts's options. */
  async function make(lng: 'en' | 'vi') {
    const inst = i18next.createInstance();
    await inst.init({
      resources: { en: { translation: en }, vi: { translation: vi } },
      lng,
      fallbackLng: 'en',
      compatibilityJSON: 'v3',
      interpolation: { escapeValue: false },
    });
    return inst;
  }

  it('pluralizes in English', async () => {
    const t = (await make('en')).t;
    expect(t('items.count', { count: 1 })).toBe('1 item');
    expect(t('items.count', { count: 24 })).toBe('24 items');
    expect(t('places.count', { count: 1 })).toBe('1 place');
    expect(t('places.count', { count: 3 })).toBe('3 places');
    expect(t('links.count', { count: 2 })).toBe('2 links');
  });

  it('interpolates the count in Vietnamese (which has no plural form)', async () => {
    const t = (await make('vi')).t;
    expect(t('items.count', { count: 1 })).toBe('1 món đồ');
    expect(t('items.count', { count: 24 })).toBe('24 món đồ');
    expect(t('places.count', { count: 3 })).toBe('3 nơi chứa');
  });
});
