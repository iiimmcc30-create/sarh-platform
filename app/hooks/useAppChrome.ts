import {
  createContext,
  createElement,
  useCallback,
  useContext,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import {
  Animated,
  Easing,
  type NativeScrollEvent,
  type NativeSyntheticEvent,
} from 'react-native';
import { motion } from '@/design-system/tokens/motion';

/** Stay revealed near the top of a list. */
const TOP_REVEAL_Y = 16;
/** Ignore sub-pixel / finger jitter. */
const AXIS_NOISE = 2;
/** Accumulated delta before hide/show (hysteresis). */
const HIDE_ACCUM = 24;
const SHOW_ACCUM = 24;

type ChromeContextValue = {
  progress: Animated.Value;
  visible: boolean;
  setVisible: (visible: boolean) => void;
  /** Hide the tab bar and drop its reserved height. Not driven by scroll. */
  tabBarForceHidden: boolean;
  setTabBarForceHidden: (hidden: boolean) => void;
};

const ChromeContext = createContext<ChromeContextValue | null>(null);

const fallbackProgress = new Animated.Value(1);

export function AppChromeProvider({ children }: { children: ReactNode }) {
  const progress = useRef(new Animated.Value(1)).current;
  const hiddenRef = useRef(false);
  const animRef = useRef<Animated.CompositeAnimation | null>(null);
  const [visible, setVisibleState] = useState(true);
  const [tabBarForceHidden, setTabBarForceHidden] = useState(false);

  const setVisible = useCallback(
    (next: boolean) => {
      if (hiddenRef.current === !next) return;
      hiddenRef.current = !next;
      setVisibleState(next);
      animRef.current?.stop();
      animRef.current = Animated.timing(progress, {
        toValue: next ? 1 : 0,
        duration: motion.duration.ui,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: true,
      });
      animRef.current.start();
    },
    [progress],
  );

  const value = useMemo(
    () => ({
      progress,
      visible,
      setVisible,
      tabBarForceHidden,
      setTabBarForceHidden,
    }),
    [progress, visible, setVisible, tabBarForceHidden, setTabBarForceHidden],
  );

  return createElement(ChromeContext.Provider, { value }, children);
}

/**
 * Shared App Shell hide-on-scroll. Each screen keeps its own scroll delta so
 * switching tabs cannot jump the chrome. Visibility is shared so Header and
 * the tab bar stay in sync. Idle / momentum-end does not reveal the chrome.
 */
export function useAppChromeScroll() {
  const ctx = useContext(ChromeContext);
  const lastY = useRef(0);
  const primed = useRef(false);
  const accum = useRef(0);
  const dir = useRef(0);

  const onChromeScroll = useCallback(
    (event: NativeSyntheticEvent<NativeScrollEvent>) => {
      if (!ctx) return;
      const y = event.nativeEvent.contentOffset.y;
      if (!primed.current) {
        lastY.current = y;
        primed.current = true;
        return;
      }
      const dy = y - lastY.current;
      lastY.current = y;
      if (y <= TOP_REVEAL_Y) {
        accum.current = 0;
        dir.current = 0;
        ctx.setVisible(true);
        return;
      }
      if (Math.abs(dy) < AXIS_NOISE) return;
      const nextDir = dy > 0 ? 1 : -1;
      if (nextDir !== dir.current) {
        dir.current = nextDir;
        accum.current = 0;
      }
      accum.current += dy;
      if (accum.current >= HIDE_ACCUM) {
        ctx.setVisible(false);
        accum.current = 0;
      } else if (accum.current <= -SHOW_ACCUM) {
        ctx.setVisible(true);
        accum.current = 0;
      }
    },
    [ctx],
  );

  return {
    chromeProgress: ctx?.progress ?? fallbackProgress,
    chromeVisible: ctx?.visible ?? true,
    setChromeVisible: ctx?.setVisible ?? noopSetVisible,
    tabBarForceHidden: ctx?.tabBarForceHidden ?? false,
    setTabBarForceHidden: ctx?.setTabBarForceHidden ?? noopSetHidden,
    onChromeScroll,
  };
}

/** Compose a list/scroll `onScroll` with hide-on-scroll. No-ops outside the tab shell. */
export function useBindChromeScroll(
  onScroll?: (event: NativeSyntheticEvent<NativeScrollEvent>) => void,
) {
  const { onChromeScroll } = useAppChromeScroll();
  return useCallback(
    (event: NativeSyntheticEvent<NativeScrollEvent>) => {
      onChromeScroll(event);
      onScroll?.(event);
    },
    [onChromeScroll, onScroll],
  );
}

function noopSetVisible(_visible: boolean) {}
function noopSetHidden(_hidden: boolean) {}
