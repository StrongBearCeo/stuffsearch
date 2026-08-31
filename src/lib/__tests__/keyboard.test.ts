import { keyboardSpacerHeight } from '../keyboard';

describe('keyboardSpacerHeight', () => {
  it('is zero when the keyboard is closed', () => {
    expect(keyboardSpacerHeight(0, 34)).toBe(0);
  });

  it('subtracts the bottom safe-area inset the keyboard already covers', () => {
    expect(keyboardSpacerHeight(300, 34)).toBe(266);
  });

  it('never goes negative', () => {
    expect(keyboardSpacerHeight(10, 34)).toBe(0);
  });

  it('treats a missing inset as zero', () => {
    expect(keyboardSpacerHeight(300)).toBe(300);
  });
});
