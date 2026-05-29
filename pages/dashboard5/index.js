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
    return new Promise((resolve, reject) => {
      const alerts = [];
      const now = new Date();

      const fetchStockChanges = new Promise((res) => {
        const url = 'https://push2ex.eastmoney.com/getAllStockChanges?type=8201&pageindex=0&pagesize=50&ut=7eea3edcaed734bea9cb3c4fac7a3b4b&dession=&_=$(Date.now())';
        wx.request({
          url: url,
          method: 'GET',
          timeout: 10000,
          success: (resp) => {
            if (resp.statusCode === 200 && resp.data && resp.data.data && resp.data.data.stockchanges) {
              const changes = resp.data.data.stockchanges || [];
              changes.forEach((item, index) => {
                const code = item.stockCode || '';
                const name = item.stockName || '';
                const price = ((item.price || 0) / 1000).toFixed(2);
                const changePercent = ((item.changePercent || 0) / 100).toFixed(2);
                const changeType = item.changeType || '';
                const changeTime = item.changeTime || '';
                const volume = item.volume || 0;
                const amount = ((item.amount || 0) / 10000).toFixed(2);
                let board = 'sh';
                if (code.startsWith('0') || code.startsWith('002')) board = 'sz';
                else if (code.startsWith('3')) board = 'cyb';
                else if (code.startsWith('688')) board = 'kcb';
                else if (code.startsWith('8') || code.startsWith('4')) board = 'bj';

                let alertType = 'surge';
                let alertName = '快速拉升';
                let alertIcon = '�';
                let alertColor = '#ef4444';

                if (changeType === '8201') {
                  alertType = 'surge';
                  alertName = '火箭发射';
                  alertIcon = '🚀';
                  alertColor = '#ef4444';
                } else if (changeType === '8202') {
                  alertType = 'plunge';
                  alertName = '快速跳水';
                  alertIcon = '📉';
                  alertColor = '#10b981';
                } else if (changeType === '8207') {
                  alertType = 'big_buy';
                  alertName = '大笔买入';
                  alertIcon = '💰';
                  alertColor = '#f59e0b';
                } else if (changeType === '8208') {
                  alertType = 'big_sell';
                  alertName = '大笔卖出';
                  alertIcon = '�';
                  alertColor = '#3b82f6';
                } else if (changeType === '8203') {
                  alertType = 'limit_up';
                  alertName = '涨停';
                  alertIcon = '🔺';
                  alertColor = '#ef4444';
                } else if (changeType === '8204') {
                  alertType = 'limit_down';
                  alertName = '跌停';
                  alertIcon = '🔻';
                  alertColor = '#10b981';
                } else if (changeType === '8209') {
                  alertType = 'volume';
                  alertName = '有大买盘';
                  alertIcon = '�';
                  alertColor = '#8b5cf6';
                } else if (changeType === '8210') {
                  alertType = 'volume';
                  alertName = '有大卖盘';
                  alertIcon = '�';
                  alertColor = '#8b5cf6';
                } else if (changeType === '8211') {
                  alertType = 'new_high';
                  alertName = '竞价上涨';
                  alertIcon = '🏆';
                  alertColor = '#f59e0b';
                } else if (changeType === '8212') {
                  alertType = 'new_low';
                  alertName = '竞价下跌';
                  alertIcon = '�';
                  alertColor = '#6b7280';
                }

                alerts.push({
                  id: `change_${index}`,
                  stockCode: code,
                  stockName: name,
                  board: board,
                  alertType: alertType,
                  alertName: alertName,
                  alertIcon: alertIcon,
                  alertColor: alertColor,
                  time: changeTime || `${now.getHours().toString().padStart(2, '0')}:${now.getMinutes().toString().padStart(2, '0')}:${now.getSeconds().toString().padStart(2, '0')}`,
                  timestamp: now.getTime() - index * 1000,
                  price: price,
                  changePercent: parseFloat(changePercent),
                  volume: volume,
                  amount: amount
                });
              });
            }
            res();
          },
          fail: () => res()
        });
      });

      Promise.all([fetchStockChanges]).then(() => {
        alerts.sort((a, b) => b.timestamp - a.timestamp);
        resolve(alerts.slice(0, 50));
      });
    });
  },

  fetchAbnormalStocks() {
    return new Promise((resolve, reject) => {
      const abnormalList = [];
      const now = new Date();

      const fetchAbnormal = new Promise((res) => {
        const url = 'https://push2.eastmoney.com/api/qt/clist/get?cb=&fid=f3&po=1&pz=30&pn=1&np=1&fltt=2&invt=2&fs=m:0+t:6,m:0+t:80,m:1+t:2,m:1+t:23,m:0+t:81+s:2048&fields=f2,f3,f5,f6,f8,f12,f14,f15,f16,f17,f18';
        wx.request({
          url: url,
          method: 'GET',
          timeout: 10000,
          success: (resp) => {
            if (resp.statusCode === 200 && resp.data && resp.data.data && resp.data.data.diff) {
              const records = resp.data.data.diff || [];
              records.forEach((item, index) => {
                const code = item.f12 || '';
                const name = item.f14 || '';
                const price = (item.f2 || 0);
                const changePercent = (item.f3 || 0);
                const turnover = (item.f8 || 0);
                let board = 'sh';
                if (code.startsWith('0') || code.startsWith('002')) board = 'sz';
                else if (code.startsWith('3')) board = 'cyb';
                else if (code.startsWith('688')) board = 'kcb';
                else if (code.startsWith('8') || code.startsWith('4')) board = 'bj';

                const threshold = BOARD_THRESHOLDS[board] || { normal: 20, severe: 50 };
                const deviation = parseFloat(changePercent.toFixed(2));
                const absDeviation = Math.abs(deviation);
                const isSevere = absDeviation >= threshold.severe;
                const isNormal = absDeviation >= threshold.normal && !isSevere;

                if (isNormal || isSevere) {
                  let period = '5d';
                  let periodName = '5日';
                  let periodDays = 5;

                  if (absDeviation >= 100) {
                    period = '30d';
                    periodName = '30日';
                    periodDays = 30;
                  } else if (absDeviation >= 60) {
                    period = '10d';
                    periodName = '10日';
                    periodDays = 10;
                  }

                  abnormalList.push({
                    id: `abnormal_${index}`,
                    stockCode: code,
                    stockName: name,
                    board: board,
                    boardName: BOARD_TYPES.find(b => b.code === board)?.name || '',
                    period: period,
                    periodName: periodName,
                    periodDays: periodDays,
                    deviation: deviation,
                    absDeviation: absDeviation,
                    isSevere: isSevere,
                    isNormal: isNormal,
                    abnormalType: isSevere ? 'severe' : 'normal',
                    abnormalTypeName: isSevere ? '严重异常波动' : '异常波动',
                    price: price.toFixed(2),
                    changePercent: parseFloat(changePercent.toFixed(2)),
                    triggerCount: Math.ceil(turnover / 5),
                    announcementStatus: isSevere ? '待公告' : '已公告',
                    triggerDate: `${(now.getMonth() + 1).toString().padStart(2, '0')}-${now.getDate().toString().padStart(2, '0')}`
                  });
                }
              });
            }
            res();
          },
          fail: () => res()
        });
      });

      Promise.all([fetchAbnormal]).then(() => {
        abnormalList.sort((a, b) => b.absDeviation - a.absDeviation);
        resolve(abnormalList.slice(0, 30));
      });
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