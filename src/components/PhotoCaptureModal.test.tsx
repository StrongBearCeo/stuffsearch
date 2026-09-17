/**
 * Rendering tests for the burst-capture camera.
 *
 * THE GAP THIS EXISTS FOR. "Add photo → Camera" ran
 * `ImagePicker.launchCameraAsync`, which closes after ONE shot. Photographing a
 * box from four sides was four passes through the source prompt, the camera and
 * the upload — while four photos from the library was one gesture. The whole
 * value of this component is that the second, third and fourth shutter taps
 * land without the camera ever closing, so that is what these tests pin down.
 *
 * It is component-project territory rather than logic-project: `photoBurst.ts`
 * is fully tested on its own, and was already correct when the session state
 * still reset itself on every re-render. Accumulating across taps, and starting
 * empty on the NEXT open, are facts about state lifetime that only a render can
 * observe.
 *
 * (RTL v14's `render`, `rerender` and `fireEvent` are async — see
 * useRouteFilter.test.tsx.)
 */
import React from 'react';
import { render, fireEvent, waitFor } from '@testing-library/react-native';

/** Jest hoists `jest.mock` above the imports, so anything its factory closes
 *  over must be `mock`-prefixed AND only dereferenced lazily, inside a callback
 *  that runs at render time rather than in the factory body. */
let mockShotSeq = 0;
const mockTakePicture = jest.fn(async () => ({ uri: `file:///cache/shot-${++mockShotSeq}.jpg` }));
const mockRequestPermission = jest.fn();
let mockPermission: { granted: boolean; canAskAgain?: boolean } | null = { granted: true };

jest.mock('expo-camera', () => {
  // A jest.mock factory is hoisted above the imports, so it can only reach
  // modules through require().
  /* eslint-disable @typescript-eslint/no-require-imports */
  const ReactLocal = require('react');
  const { View } = require('react-native');
  /* eslint-enable @typescript-eslint/no-require-imports */
  return {
    CameraView: ReactLocal.forwardRef((props: Record<string, unknown>, ref: unknown) => {
      ReactLocal.useImperativeHandle(ref, () => ({ takePictureAsync: mockTakePicture }));
      return ReactLocal.createElement(View, { testID: 'camera-view', ...props });
    }),
    useCameraPermissions: () => [mockPermission, mockRequestPermission],
  };
});

// Insets are measured by a native module that has nothing to measure here.
jest.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
}));

// Keys, not prose: the assertions are about behaviour, and the locale files
// have their own guardrails in locales.test.ts.
jest.mock('react-i18next', () => ({ useTranslation: () => ({ t: (key: string) => key }) }));

import { PhotoCaptureModal } from './PhotoCaptureModal';

beforeEach(() => {
  mockShotSeq = 0;
  mockTakePicture.mockClear();
  mockRequestPermission.mockClear();
  mockPermission = { granted: true, canAskAgain: true };
});

/** Tap the shutter and wait for the shot to land in the strip. */
async function shoot(getByTestId: (id: string) => unknown, expected: number) {
  await fireEvent.press(getByTestId('photo-capture-shutter') as never);
  await waitFor(() =>
    expect(getByTestId('photo-capture-count')).toHaveTextContent(String(expected)),
  );
}

describe('PhotoCaptureModal', () => {
  it('ACCUMULATES shots without closing — three taps, three photos, one trip', async () => {
    const onDone = jest.fn();
    const { getByTestId } = await render(
      <PhotoCaptureModal visible onDone={onDone} onClose={jest.fn()} />,
    );

    await shoot(getByTestId, 1);
    await shoot(getByTestId, 2);
    await shoot(getByTestId, 3);

    await fireEvent.press(getByTestId('photo-capture-done'));

    expect(onDone).toHaveBeenCalledTimes(1);
    expect(onDone).toHaveBeenCalledWith([
      'file:///cache/shot-1.jpg',
      'file:///cache/shot-2.jpg',
      'file:///cache/shot-3.jpg',
    ]);
  });

  it('hands back the shots in capture order — the first is the cover photo', async () => {
    const onDone = jest.fn();
    const { getByTestId } = await render(
      <PhotoCaptureModal visible onDone={onDone} onClose={jest.fn()} />,
    );
    await shoot(getByTestId, 1);
    await shoot(getByTestId, 2);
    await fireEvent.press(getByTestId('photo-capture-done'));

    const [urls] = onDone.mock.calls[0] as [string[]];
    expect(urls[0]).toBe('file:///cache/shot-1.jpg');
    expect(urls[1]).toBe('file:///cache/shot-2.jpg');
  });

  it('confirms nothing when the session is cancelled — a cancelled burst uploads nothing', async () => {
    const onDone = jest.fn();
    const onClose = jest.fn();
    const { getByTestId } = await render(
      <PhotoCaptureModal visible onDone={onDone} onClose={onClose} />,
    );
    await shoot(getByTestId, 1);
    await shoot(getByTestId, 2);

    await fireEvent.press(getByTestId('photo-capture-cancel'));

    expect(onClose).toHaveBeenCalledTimes(1);
    expect(onDone).not.toHaveBeenCalled();
  });

  it('undoes only the last shot', async () => {
    const onDone = jest.fn();
    const { getByTestId } = await render(
      <PhotoCaptureModal visible onDone={onDone} onClose={jest.fn()} />,
    );
    await shoot(getByTestId, 1);
    await shoot(getByTestId, 2);

    await fireEvent.press(getByTestId('photo-capture-undo'));
    await waitFor(() => expect(getByTestId('photo-capture-count')).toHaveTextContent('1'));

    await fireEvent.press(getByTestId('photo-capture-done'));
    expect(onDone).toHaveBeenCalledWith(['file:///cache/shot-1.jpg']);
  });

  it('will not confirm an empty session', async () => {
    const onDone = jest.fn();
    const { getByTestId, queryByTestId } = await render(
      <PhotoCaptureModal visible onDone={onDone} onClose={jest.fn()} />,
    );
    expect(queryByTestId('photo-capture-undo')).toBeNull();

    await fireEvent.press(getByTestId('photo-capture-done'));
    expect(onDone).not.toHaveBeenCalled();
  });

  it('stops taking shots at the cap', async () => {
    const onDone = jest.fn();
    const { getByTestId } = await render(
      <PhotoCaptureModal visible onDone={onDone} onClose={jest.fn()} limit={2} />,
    );
    await shoot(getByTestId, 1);
    await shoot(getByTestId, 2);

    await fireEvent.press(getByTestId('photo-capture-shutter'));
    expect(getByTestId('photo-capture-count')).toHaveTextContent('2');
    expect(mockTakePicture).toHaveBeenCalledTimes(2);
  });

  // NOT tested here: two taps landing in the SAME frame. Expressing that needs
  // two overlapping `fireEvent.press` calls, and RTL v14 wraps each in its own
  // act() scope — overlapping them corrupts the scope for the rest of the file
  // ("You seem to have overlapping act() calls"). The shutter is guarded by
  // `createSubmitGuard`, whose same-frame drop is covered in submit.test.ts.

  it('starts the NEXT session empty — a burst must not inherit the last one', async () => {
    const onDone = jest.fn();
    const { getByTestId, rerender } = await render(
      <PhotoCaptureModal visible onDone={onDone} onClose={jest.fn()} />,
    );
    await shoot(getByTestId, 1);
    await shoot(getByTestId, 2);
    await fireEvent.press(getByTestId('photo-capture-done'));

    await rerender(<PhotoCaptureModal visible={false} onDone={onDone} onClose={jest.fn()} />);
    await rerender(<PhotoCaptureModal visible onDone={onDone} onClose={jest.fn()} />);

    await waitFor(() => expect(getByTestId('photo-capture-count')).toHaveTextContent('0'));
    await shoot(getByTestId, 1);
    await fireEvent.press(getByTestId('photo-capture-done'));

    expect(onDone).toHaveBeenLastCalledWith(['file:///cache/shot-3.jpg']);
  });

  it('tears the camera down while hidden — a live preview left attached comes back black', async () => {
    const { queryByTestId, rerender } = await render(
      <PhotoCaptureModal visible={false} onDone={jest.fn()} onClose={jest.fn()} />,
    );
    expect(queryByTestId('camera-view')).toBeNull();

    await rerender(<PhotoCaptureModal visible onDone={jest.fn()} onClose={jest.fn()} />);
    expect(queryByTestId('camera-view')).not.toBeNull();
  });

  it('asks for camera permission on open, the way the old picker did', async () => {
    mockPermission = { granted: false, canAskAgain: true };
    const { queryByTestId } = await render(
      <PhotoCaptureModal visible onDone={jest.fn()} onClose={jest.fn()} />,
    );
    await waitFor(() => expect(mockRequestPermission).toHaveBeenCalledTimes(1));
    expect(queryByTestId('camera-view')).toBeNull();
  });

  it('offers a grant card instead of a dead preview once the OS stops asking', async () => {
    mockPermission = { granted: false, canAskAgain: false };
    const { getByTestId, queryByTestId } = await render(
      <PhotoCaptureModal visible onDone={jest.fn()} onClose={jest.fn()} />,
    );
    expect(queryByTestId('camera-view')).toBeNull();
    expect(mockRequestPermission).not.toHaveBeenCalled();

    await fireEvent.press(getByTestId('photo-capture-grant'));
    expect(mockRequestPermission).toHaveBeenCalledTimes(1);
  });

  it('waits for the permission answer rather than flashing the denied card', async () => {
    mockPermission = null;
    const { queryByTestId } = await render(
      <PhotoCaptureModal visible onDone={jest.fn()} onClose={jest.fn()} />,
    );
    expect(queryByTestId('photo-capture-grant')).toBeNull();
    expect(queryByTestId('camera-view')).toBeNull();
  });
});
