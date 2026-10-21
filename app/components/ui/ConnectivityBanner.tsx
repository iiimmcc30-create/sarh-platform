import { useEffect, useState } from 'react';
import { Platform, StatusBar, StyleSheet, View } from 'react-native';
import { AppText } from '@/design-system/components';
import { isOfflineSnapshot, type ConnectivitySnapshot } from '@/lib/connectivity';

const TOP_INSET =
  Platform.OS === 'android' ? (StatusBar.currentHeight ?? 0) : Platform.OS === 'ios' ? 44 : 0;

type NetInfoModule = {
  addEventListener: (listener: (state: ConnectivitySnapshot) => void) => () => void;
};

/**
 * Thin bar while the device has no usable connection. Cached screens stay
 * mounted underneath; this only tells the reader why data may be stale.
 */
export function ConnectivityBanner() {
  const [offline, setOffline] = useState(false);

  useEffect(() => {
    let unsubscribe = () => {};
    let alive = true;
    void import('@react-native-community/netinfo')
      .then((mod) => {
        if (!alive) return;
        const net = (mod.default ?? mod) as NetInfoModule;
        unsubscribe = net.addEventListener((state) => {
          setOffline(isOfflineSnapshot(state));
        });
      })
      .catch(() => {});
    return () => {
      alive = false;
      unsubscribe();
    };
  }, []);

  if (!offline) return null;

  return (
    <View
      pointerEvents="none"
      style={[styles.bar, { paddingTop: TOP_INSET + 8 }]}
      accessibilityRole="alert"
      accessibilityLiveRegion="polite"
    >
      <AppText variant="caption" style={styles.text}>
        لا يوجد اتصال. نعرض آخر محتوى محفوظ حتى تعود الشبكة.
      </AppText>
    </View>
  );
}

const styles = StyleSheet.create({
  bar: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    zIndex: 50,
    backgroundColor: '#6B3A1F',
    paddingBottom: 8,
    paddingHorizontal: 16,
  },
  text: {
    color: '#FFF8F0',
    textAlign: 'center',
  },
});
