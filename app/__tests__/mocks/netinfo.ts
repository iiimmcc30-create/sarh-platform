const NetInfo = {
  addEventListener: () => () => {},
  fetch: async () => ({ isConnected: true, isInternetReachable: true }),
};

export default NetInfo;
