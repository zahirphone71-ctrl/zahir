export interface CoordPoint {
  x: number;
  y: number;
}

export interface CoordsMap {
  network: CoordPoint;
  profile: CoordPoint;
  price: CoordPoint;
  user: CoordPoint;
  password: CoordPoint;
  qr: CoordPoint;
  time: CoordPoint;
  dataLimit: CoordPoint;
  customText1?: CoordPoint;
  customText2?: CoordPoint;
  logo?: CoordPoint;
}

export const LAYOUTS = Object.freeze({
  wide: Object.freeze({
    network:   { x: 18, y: 12 },
    profile:   { x: 50, y: 12 },
    price:     { x: 88, y: 12 },
    user:      { x: 32, y: 44 },
    password:  { x: 32, y: 68 },
    qr:        { x: 84, y: 54 },
    time:      { x: 20, y: 88 },
    dataLimit: { x: 68, y: 88 },
  }),
  narrow: Object.freeze({
    network:   { x: 15, y: 10 },
    profile:   { x: 50, y: 22 },
    price:     { x: 85, y: 10 },
    user:      { x: 30, y: 46 },
    password:  { x: 30, y: 68 },
    qr:        { x: 82, y: 54 },
    time:      { x: 18, y: 88 },
    dataLimit: { x: 65, y: 88 },
  }),
  compact: Object.freeze({
    network:   { x: 28, y: 8 },
    price:     { x: 78, y: 8 },
    profile:   { x: 28, y: 22 },
    user:      { x: 28, y: 42 },
    password:  { x: 28, y: 62 },
    qr:        { x: 78, y: 45 },
    time:      { x: 28, y: 82 },
    dataLimit: { x: 78, y: 68 },
  }),
  ultra: Object.freeze({
    network:   { x: 50, y: 6 },
    price:     { x: 50, y: 18 },
    profile:   { x: 50, y: 30 },
    user:      { x: 50, y: 46 },
    password:  { x: 50, y: 62 },
    qr:        { x: 50, y: 76 },
    time:      { x: 50, y: 88 },
    dataLimit: { x: 50, y: 96 },
  }),
});

export const DEFAULT_SMART_COORDS = Object.freeze({ ...LAYOUTS.wide });

/** إرجاع الإحداثيات الافتراضية للكرت */
export function getDefaultCoords(): CoordsMap {
  return { ...DEFAULT_SMART_COORDS };
}

const clamp = (v: number, min = 2, max = 98) => Math.max(min, Math.min(max, Math.round(v)));

export function computeSmartCoords(
  cols: number,
  showQr: boolean = true,
  authMode: 'user_pass' | 'user_only' | string = 'user_only',
  showProfile: boolean = true,
  showDataLimit: boolean = true,
  userCoords?: any,
  showNetwork: boolean = true
): CoordsMap {
  if (userCoords && typeof userCoords === 'object') {
    return {
      network:   { x: clamp(userCoords.network?.x ?? 18),   y: clamp(userCoords.network?.y ?? 12) },
      profile:   { x: clamp(userCoords.profile?.x ?? 50),   y: clamp(userCoords.profile?.y ?? 12) },
      price:     { x: clamp(userCoords.price?.x ?? 88),     y: clamp(userCoords.price?.y ?? 12) },
      user:      { x: clamp(userCoords.user?.x ?? 32),      y: clamp(userCoords.user?.y ?? 44) },
      password:  { x: clamp(userCoords.password?.x ?? 32),  y: clamp(userCoords.password?.y ?? 68) },
      qr:        { x: clamp(userCoords.qr?.x ?? 84),        y: clamp(userCoords.qr?.y ?? 54) },
      time:      { x: clamp(userCoords.time?.x ?? 20),      y: clamp(userCoords.time?.y ?? 88) },
      dataLimit: { x: clamp(userCoords.dataLimit?.x ?? 68), y: clamp(userCoords.dataLimit?.y ?? 88) },
    };
  }

  if (cols <= 3) return { ...LAYOUTS.wide };
  if (cols <= 5) return { ...LAYOUTS.narrow };
  if (cols <= 7) return { ...LAYOUTS.compact };
  return { ...LAYOUTS.ultra };
}

export function getPreviewCoords(userCoords?: CoordsMap): CoordsMap {
  if (userCoords) return userCoords;
  return { ...LAYOUTS.wide };
}
