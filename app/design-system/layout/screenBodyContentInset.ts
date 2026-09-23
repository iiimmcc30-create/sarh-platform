import { createContext, useContext } from 'react';

/**
 * Extra `paddingBottom` for a nested list hosted by `scroll={false}` ScreenBody.
 * Overlay chrome (the tab bar) must not be reserved as wrapper layout — that
 * paints a dead `screenRoot` band after the bar hides.
 */
export const ScreenBodyContentInsetContext = createContext(0);

export function useScreenBodyContentInset() {
  return useContext(ScreenBodyContentInsetContext);
}
