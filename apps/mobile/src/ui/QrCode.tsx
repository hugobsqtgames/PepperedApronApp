import { useMemo } from 'react';
import qrcode from 'qrcode-generator';
import Svg, { Path, Rect } from 'react-native-svg';

/** A QR code drawn on the device (no service involved), dark on white for any camera. */
export function QrCode({ value, size }: { value: string; size: number }) {
  const { path, count } = useMemo(() => {
    const qr = qrcode(0, 'L');
    qr.addData(value, 'Byte');
    qr.make();
    const n = qr.getModuleCount();
    let d = '';
    for (let y = 0; y < n; y++)
      for (let x = 0; x < n; x++) if (qr.isDark(y, x)) d += `M${x} ${y}h1v1h-1z`;
    return { path: d, count: n };
  }, [value]);
  const quiet = 4;
  const total = count + quiet * 2;
  return (
    <Svg width={size} height={size} viewBox={`${-quiet} ${-quiet} ${total} ${total}`}>
      <Rect x={-quiet} y={-quiet} width={total} height={total} fill="#FFFFFF" />
      <Path d={path} fill="#000000" />
    </Svg>
  );
}
