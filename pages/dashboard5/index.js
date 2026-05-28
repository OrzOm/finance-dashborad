const app = getApp();

const STORAGE_KEY = 'stock_alert_settings';

const BOARD_TYPES = [
  { code: 'all', name: '全部' },
  { code: 'sh', name: '沪主板' },
  { code: 'sz', name: '深主板' },
  { code: 'cyb', name: '创业板' },
  { code: 'kcb', name: '科创板' },
  { code: 'bj', name: '北交所' }
];

const ALERT_TYPES = [
  { code: 'all', name: '全部', icon: '📊' },
  { code: 'surge', name: '快速拉升', icon: '🚀', color: '#ef4444' },
  { code: 'plunge', name: '快速跳水', icon: '📉', color: '#10b981' },
  { code: 'big_buy', name: '大单买入', icon: '💰', color: '#f59e0b' },
  { code: 'big_sell', name: '大单卖出', icon: '💸', color: '#3b82f6' },
  { code: 'limit_up', name: '涨停', icon: '🔺', color: '#ef4444' },
  { code: 'limit_down', name: '跌停', icon: '🔻', color: '#10b981' },
  { code: 'volume', name: '量比异动', icon: '📊', color: '#8b5cf6' },
  { code: 'new_high', name: '创新高', icon: '🏆', color: '#f59e0b' },
  { code: 'new_low', name: '创新低', icon: '💀', color: '#6b7280' }
];

const DEVIATION_PERIODS = [
  { code: '3d', name: '3日', days: 3 },
  { code: '5d', name: '5日', days: 5 },
  { code: '10d', name: '10日', days: 10 },
  { code: '30d', name: '30日', days: 30 },
  { code: '60d', name: '60日', days: 60 }
];

const BOARD_THRESHOLDS = {
  'sh': { normal: 20, severe: 50 },
  'sz': { normal: 20, severe: 50 },
  'cyb': { normal: 30, severe: 60 },
  'kcb': { normal: 30, severe: 60 },
  'bj': { normal: 40, severe: 80 }
};

Page({
  data: {
    lastUpdateTime: '--:--:--',
    refreshInterval: 10000,
    isLoading: false,
    isRefreshing: false,
    error: null,

    activeTab: 'realtime',
    tabs: [
      { key: 'realtime', name: '实时异动' },
      { key: 'abnormal', name: '异常波动' }
    ],

    realtimeAlerts: [],
    filteredAlerts: [],
    alertTypeFilter: 'all',
    boardFilter: 'all',

    abnormalStocks: [],
    filteredAbnormal: [],
    abnormalTypeFilter: 'all',
    abnormalBoardFilter: 'all',
    abnormalPeriodFilter: 'all',

    searchKeyword: '',
    searchResults: [],
    showSearch: false,

    realtimePage: 1,
    hasMoreRealtime: true,

    showSettings: false
  },

  refreshTimer: null,

  onLoad() {
    this.loadSettings();
    this.initData();
    this.startAutoRefresh();
  },

  onShow() {
    if (this.refreshTimer) {
      this.startAutoRefresh();
    }
  },

  onHide() {
    this.stopAutoRefresh();
  },

  onUnload() {
    this.stopAutoRefresh();
  },

  loadSettings() {
    try {
      const saved = wx.getStorageSync(STORAGE_KEY);
      if (saved) {
        this.setData({
          refreshInterval: saved.refreshInterval || 10000,
          activeTab: saved.activeTab || 'realtime'
        });
      }
    } catch (e) {
      console.error('加载设置失败:', e);
    }
  },

  saveSettings() {
    try {
      wx.setStorageSync(STORAGE_KEY, {
        refreshInterval: this.data.refreshInterval,
        activeTab: this.data.activeTab
      });
    } catch (e) {
      console.error('保存设置失败:', e);
    }
  },

  startAutoRefresh() {
    this.stopAutoRefresh();
    const { refreshInterval } = this.data;
    this.refreshTimer = setInterval(() => {
      this.refreshData();
    }, refreshInterval);
  },

  stopAutoRefresh() {
    if (this.refreshTimer) {
      clearInterval(this.refreshTimer);
      this.refreshTimer = null;
    }
  },

  initData() {
    this.fetchAllData();
  },

  refreshData() {
    this.fetchAllData();
  },

  manualRefresh() {
    this.setData({ isRefreshing: true });
    this.fetchAllData();
  },

  fetchAllData() {
    if (this.data.isLoading) return;

    this.setData({ isLoading: true, error: null });

    Promise.all([
      this.fetchRealtimeAlerts(),
      this.fetchAbnormalStocks()
    ])
      .then(([realtimeAlerts, abnormalStocks]) => {
        const now = new Date();
        const timeStr = `${now.getHours().toString().padStart(2, '0')}:${now.getMinutes().toString().padStart(2, '0')}:${now.getSeconds().toString().padStart(2, '0')}`;

        this.setData({
          lastUpdateTime: timeStr,
          realtimeAlerts: realtimeAlerts,
          abnormalStocks: abnormalStocks,
          isLoading: false,
          isRefreshing: false,
          error: null
        });

        this.applyRealtimeFilter();
        this.applyAbnormalFilter();
      })
      .catch((error) => {
        console.error('获取数据失败:', error);
        this.setData({
          error: '数据获取失败，请重试',
          isLoading: false,
          isRefreshing: false
        });
      });
  },

  fetchRealtimeAlerts() {
    return new Promise((resolve) => {
      const stocks = [
        { code: '600519', name: '贵州茅台', board: 'sh' },
        { code: '000858', name: '五粮液', board: 'sz' },
        { code: '300750', name: '宁德时代', board: 'cyb' },
        { code: '688981', name: '中芯国际', board: 'kcb' },
        { code: '002594', name: '比亚迪', board: 'sz' },
        { code: '601318', name: '中国平安', board: 'sh' },
        { code: '000001', name: '平安银行', board: 'sz' },
        { code: '600036', name: '招商银行', board: 'sh' },
        { code: '300059', name: '东方财富', board: 'cyb' },
        { code: '002475', name: '立讯精密', board: 'sz' }
      ];

      const alerts = [];
      const now = new Date();

      for (let i = 0; i < 30; i++) {
        const stock = stocks[Math.floor(Math.random() * stocks.length)];
        const alertType = ALERT_TYPES[Math.floor(Math.random() * (ALERT_TYPES.length - 1)) + 1];
        const minutesAgo = Math.floor(Math.random() * 240);
        const alertTime = new Date(now.getTime() - minutesAgo * 60000);
        const price = (100 + Math.random() * 200).toFixed(2);
        const changePercent = (Math.random() * 20 - 10).toFixed(2);
        const volume = (Math.random() * 10000 + 1000).toFixed(0);
        const amount = (Math.random() * 100000 + 10000).toFixed(0);

        alerts.push({
          id: `alert_${i}`,
          stockCode: stock.code,
          stockName: stock.name,
          board: stock.board,
          alertType: alertType.code,
          alertName: alertType.name,
          alertIcon: alertType.icon,
          alertColor: alertType.color,
          time: `${alertTime.getHours().toString().padStart(2, '0')}:${alertTime.getMinutes().toString().padStart(2, '0')}:${alertTime.getSeconds().toString().padStart(2, '0')}`,
          timestamp: alertTime.getTime(),
          price: price,
          changePercent: parseFloat(changePercent),
          volume: volume,
          amount: amount
        });
      }

      alerts.sort((a, b) => b.timestamp - a.timestamp);
      resolve(alerts);
    });
  },

  fetchAbnormalStocks() {
    return new Promise((resolve) => {
      const stocks = [
        { code: '300001', name: '特锐德', board: 'cyb' },
        { code: '688001', name: '华兴源创', board: 'kcb' },
        { code: '002001', name: '新和成', board: 'sz' },
        { code: '600001', name: '邯郸钢铁', board: 'sh' },
        { code: '300100', name: '双林股份', board: 'cyb' },
        { code: '688111', name: '金山办公', board: 'kcb' },
        { code: '000002', name: '万科A', board: 'sz' },
        { code: '600030', name: '中信证券', board: 'sh' }
      ];

      const abnormalList = [];
      const now = new Date();

      stocks.forEach(stock => {
        const periods = DEVIATION_PERIODS.filter(() => Math.random() > 0.5);
        if (periods.length === 0) periods.push(DEVIATION_PERIODS[0]);

        periods.forEach(period => {
          const threshold = BOARD_THRESHOLDS[stock.board] || { normal: 20, severe: 50 };
          const deviation = (Math.random() * 80 - 20).toFixed(2);
          const absDeviation = Math.abs(parseFloat(deviation));
          const isSevere = absDeviation >= threshold.severe;
          const isNormal = absDeviation >= threshold.normal && !isSevere;

          if (isNormal || isSevere) {
            const price = (50 + Math.random() * 200).toFixed(2);
            const changePercent = (Math.random() * 30 - 15).toFixed(2);
            const triggerCount = Math.floor(Math.random() * 3) + 1;
            const announcementStatus = Math.random() > 0.5 ? '已公告' : '待公告';

            abnormalList.push({
              id: `${stock.code}_${period.code}`,
              stockCode: stock.code,
              stockName: stock.name,
              board: stock.board,
              boardName: BOARD_TYPES.find(b => b.code === stock.board)?.name || '',
              period: period.code,
              periodName: period.name,
              periodDays: period.days,
              deviation: parseFloat(deviation),
              absDeviation: absDeviation,
              isSevere: isSevere,
              isNormal: isNormal,
              abnormalType: isSevere ? 'severe' : 'normal',
              abnormalTypeName: isSevere ? '严重异常波动' : '异常波动',
              price: price,
              changePercent: parseFloat(changePercent),
              triggerCount: triggerCount,
              announcementStatus: announcementStatus,
              triggerDate: `${(now.getMonth() + 1).toString().padStart(2, '0')}-${now.getDate().toString().padStart(2, '0')}`
            });
          }
        });
      });

      abnormalList.sort((a, b) => b.absDeviation - a.absDeviation);
      resolve(abnormalList);
    });
  },

  switchTab(e) {
    const tab = e.currentTarget.dataset.tab;
    this.setData({ activeTab: tab });
    this.saveSettings();
  },

  setAlertTypeFilter(e) {
    const type = e.currentTarget.dataset.type;
    this.setData({ alertTypeFilter: type });
    this.applyRealtimeFilter();
  },

  setBoardFilter(e) {
    const board = e.currentTarget.dataset.board;
    this.setData({ boardFilter: board });
    this.applyRealtimeFilter();
  },

  applyRealtimeFilter() {
    const { realtimeAlerts, alertTypeFilter, boardFilter } = this.data;

    let filtered = [...realtimeAlerts];

    if (alertTypeFilter !== 'all') {
      filtered = filtered.filter(a => a.alertType === alertTypeFilter);
    }

    if (boardFilter !== 'all') {
      filtered = filtered.filter(a => a.board === boardFilter);
    }

    this.setData({ filteredAlerts: filtered });
  },

  setAbnormalTypeFilter(e) {
    const type = e.currentTarget.dataset.type;
    this.setData({ abnormalTypeFilter: type });
    this.applyAbnormalFilter();
  },

  setAbnormalBoardFilter(e) {
    const board = e.currentTarget.dataset.board;
    this.setData({ abnormalBoardFilter: board });
    this.applyAbnormalFilter();
  },

  setAbnormalPeriodFilter(e) {
    const period = e.currentTarget.dataset.period;
    this.setData({ abnormalPeriodFilter: period });
    this.applyAbnormalFilter();
  },

  applyAbnormalFilter() {
    const { abnormalStocks, abnormalTypeFilter, abnormalBoardFilter, abnormalPeriodFilter } = this.data;

    let filtered = [...abnormalStocks];

    if (abnormalTypeFilter !== 'all') {
      filtered = filtered.filter(a => a.abnormalType === abnormalTypeFilter);
    }

    if (abnormalBoardFilter !== 'all') {
      filtered = filtered.filter(a => a.board === abnormalBoardFilter);
    }

    if (abnormalPeriodFilter !== 'all') {
      filtered = filtered.filter(a => a.period === abnormalPeriodFilter);
    }

    this.setData({ filteredAbnormal: filtered });
  },

  onSearchInput(e) {
    const keyword = e.detail.value;
    this.setData({ searchKeyword: keyword });

    if (keyword.length >= 2) {
      this.searchStock(keyword);
    } else {
      this.setData({ searchResults: [], showSearch: false });
    }
  },

  searchStock(keyword) {
    const { abnormalStocks } = this.data;
    const results = abnormalStocks.filter(s =>
      s.stockCode.includes(keyword) ||
      s.stockName.includes(keyword)
    );

    this.setData({
      searchResults: results,
      showSearch: true
    });
  },

  clearSearch() {
    this.setData({
      searchKeyword: '',
      searchResults: [],
      showSearch: false
    });
  },

  setRefreshInterval(e) {
    const interval = parseInt(e.currentTarget.dataset.interval) || 10000;
    this.setData({ refreshInterval: interval });
    this.startAutoRefresh();
    this.saveSettings();
  },

  toggleSettings() {
    this.setData({ showSettings: !this.data.showSettings });
  },

  loadMoreRealtime() {
    this.setData({ realtimePage: this.data.realtimePage + 1 });
  },

  getChangeClass(value) {
    return parseFloat(value) >= 0 ? 'up' : 'down';
  },

  getChangePrefix(value) {
    return parseFloat(value) >= 0 ? '+' : '';
  }
});