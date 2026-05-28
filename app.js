App({
  onLaunch() {
    // 小程序初始化
    console.log('小程序初始化');
    // 这里可以添加初始化逻辑，如获取用户信息、初始化数据等
  },

  onShow(options) {
    // 小程序启动或从后台进入前台显示
    console.log('小程序显示', options);
  },

  onHide() {
    // 小程序从前台进入后台
    console.log('小程序隐藏');
  },

  onError(error) {
    // 小程序发生错误
    console.error('小程序错误:', error);
  },

  // 全局数据
  globalData: {
    userInfo: null,
    // 可以添加其他全局数据
  },

  // 全局方法
  getGlobalData() {
    return this.globalData;
  }
});