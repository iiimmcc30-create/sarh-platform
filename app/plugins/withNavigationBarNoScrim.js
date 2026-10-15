// Android 10+: with edge-to-edge, `enforceNavigationBarContrast=true` makes the OS paint a
// translucent scrim behind the system navigation bar. It sits under our tab bar and stays
// visible when the tab bar hides on scroll. Keep it off so content scrolls to the edge.
const { withAndroidStyles, AndroidConfig } = require('@expo/config-plugins');

module.exports = function withNavigationBarNoScrim(config) {
  return withAndroidStyles(config, (cfg) => {
    cfg.modResults = AndroidConfig.Styles.assignStylesValue(cfg.modResults, {
      add: true,
      parent: AndroidConfig.Styles.getAppThemeGroup(),
      name: 'android:enforceNavigationBarContrast',
      value: 'false',
      targetApi: '29',
    });
    return cfg;
  });
};
