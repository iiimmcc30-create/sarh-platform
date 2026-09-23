export const Alert = { alert: jest.fn() };
export const Platform = { OS: 'web' };
export const Share = { share: jest.fn(async () => ({ action: 'sharedAction' })) };
export const I18nManager = {
  isRTL: true,
  allowRTL: jest.fn(),
  forceRTL: jest.fn(),
};
export const StyleSheet = {
  create: <T extends Record<string, unknown>>(styles: T) => styles,
  hairlineWidth: 1,
  absoluteFillObject: { position: 'absolute' as const, left: 0, right: 0, top: 0, bottom: 0 },
};
export default { Alert, Platform, Share, I18nManager, StyleSheet };
