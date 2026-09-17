/**
 * Unit tests for error translation.
 *
 * The reported bug: deleting a thing and re-adding it surfaced the raw
 *   duplicate key value violates unique constraint
 *   "external_codes_household_value_uniq" (23505)
 * The database no longer orphans those rows (migration 0010), but a code
 * genuinely bound to something else still collides — and when it does the user
 * needs a sentence, not a constraint name.
 */
import {
  errorMessage,
  toError,
  isDuplicateCodeError,
  isUnstorableTextError,
} from '../errors';

describe('errorMessage', () => {
  it('reads a real Error', () => {
    expect(errorMessage(new Error('boom'))).toBe('boom');
  });

  it('reads a PostgrestError-shaped plain object and appends the code', () => {
    expect(errorMessage({ message: 'nope', code: '42501' })).toBe('nope (42501)');
  });

  it('omits the code when there isn’t one', () => {
    expect(errorMessage({ message: 'nope' })).toBe('nope');
  });

  it('passes a bare string through', () => {
    expect(errorMessage('plain')).toBe('plain');
  });

  it('falls back for anything unrecognisable', () => {
    expect(errorMessage(undefined)).toBe('Unknown error');
    expect(errorMessage({})).toBe('Unknown error');
  });
});

describe('toError', () => {
  it('returns an Error unchanged', () => {
    const e = new Error('x');
    expect(toError(e)).toBe(e);
  });

  it('wraps a non-Error', () => {
    expect(toError({ message: 'y', code: '23505' })).toBeInstanceOf(Error);
    expect(toError({ message: 'y', code: '23505' }).message).toBe('y (23505)');
  });
});

describe('isDuplicateCodeError', () => {
  it('recognises the unique-violation SQLSTATE', () => {
    expect(isDuplicateCodeError({ code: '23505' })).toBe(true);
  });

  it('recognises it by the constraint name when no code is present', () => {
    expect(
      isDuplicateCodeError(
        new Error(
          'duplicate key value violates unique constraint "external_codes_household_value_uniq"',
        ),
      ),
    ).toBe(true);
  });

  it('is false for an unrelated failure', () => {
    expect(isDuplicateCodeError(new Error('network'))).toBe(false);
    expect(isDuplicateCodeError({ code: '42501' })).toBe(false);
  });

  it('is false for nothing at all', () => {
    expect(isDuplicateCodeError(null)).toBe(false);
    expect(isDuplicateCodeError(undefined)).toBe(false);
  });

  it('does not fire on a different unique constraint', () => {
    expect(
      isDuplicateCodeError(
        new Error('duplicate key value violates unique constraint "items_qr_token_key"'),
      ),
    ).toBe(false);
  });
});

describe('isUnstorableTextError', () => {
  it('recognises the JSON escape rejection that blocked saving a scanned code', () => {
    // The exact shape the user saw: "unsupported Unicode escape sequence (22P05)"
    expect(isUnstorableTextError({ code: '22P05' })).toBe(true);
  });

  it('recognises the untranslatable-character SQLSTATE too', () => {
    expect(isUnstorableTextError({ code: '22021' })).toBe(true);
  });

  it('recognises it by message when no code is present', () => {
    expect(
      isUnstorableTextError(new Error('unsupported Unicode escape sequence')),
    ).toBe(true);
  });

  it('is false for unrelated failures', () => {
    expect(isUnstorableTextError(new Error('network'))).toBe(false);
    expect(isUnstorableTextError({ code: '23505' })).toBe(false);
    expect(isUnstorableTextError(null)).toBe(false);
    expect(isUnstorableTextError(undefined)).toBe(false);
  });
});
