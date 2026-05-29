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

function getBoard(code) {
  if (code.startsWith('0') || code.startsWith('002')) return 'sz';
  if (code.startsWith('3')) return 'cyb';
  if (code.startsWith('688')) return 'kcb';
  if (code.startsWith('8') || code.startsWith('4')) return 'bj';
  return 'sh';
}

Page({
  data: {
    lastUpdateTime: '--:--:--',
    refreshInterval: 10000,
    isLoading: false,
    isRefreshing: false,
    error: null,

    activeTab: 'gainers',
    tabs: [
      { key: 'gainers', name: '涨幅榜' },
      { key: 'limit_up', name: '涨停列表' },
      { key: 'abnormal', name: '异常波动' }
    ],

    gainersList: [],
    filteredGainers: [],
    boardFilter: 'all',

    limitUpList: [],
    limitUpCount: 0,

    abnormalStocks: [],
    filteredAbnormal: [],
    abnormalTypeFilter: 'all',

    searchKeyword: '',
    searchResults: [],
    showSearch: false,

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
          activeTab: saved.activeTab || 'gainers'
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
      this.fetchStockData(),
      this.fetchAbnormalStocks()
    ])
      .then(([stockData, abnormalStocks]) => {
        const now = new Date();
        const timeStr = `${now.getHours().toString().padStart(2, '0')}:${now.getMinutes().toString().padStart(2, '0')}:${now.getSeconds().toString().padStart(2, '0')}`;

        const limitUpList = stockData.filter(item => item.isLimitUp);

        this.setData({
          lastUpdateTime: timeStr,
          gainersList: stockData,
          limitUpList: limitUpList,
          limitUpCount: limitUpList.length,
          abnormalStocks: abnormalStocks,
          isLoading: false,
          isRefreshing: false,
          error: null
        });

        this.applyGainersFilter();
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

  fetchStockData() {
    return new Promise((resolve) => {
      const stocks = [];

      const fetchGainers = new Promise((res) => {
        const url = 'https://push2.eastmoney.com/api/qt/clist/get?cb=&fid=f3&po=1&pz=100&pn=1&np=1&fltt=2&invt=2&fs=m:0+t:6,m:0+t:80,m:1+t:2,m:1+t:23,m:0+t:81+s:2048&fields=f2,f3,f4,f5,f6,f7,f8,f9,f10,f12,f14,f15,f16,f17,f18,f51';
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
                const price = parseFloat(item.f2) || 0;
                const changePercent = parseFloat(item.f3) || 0;
                const changeAmount = parseFloat(item.f4) || 0;
                const amount = parseFloat(item.f6) || 0;
                const amplitude = parseFloat(item.f7) || 0;
                const turnover = parseFloat(item.f8) || 0;
                const pe = parseFloat(item.f9) || 0;
                const volumeRatio = parseFloat(item.f10) || 0;
                const high = parseFloat(item.f15) || 0;
                const low = parseFloat(item.f16) || 0;
                const open = parseFloat(item.f17) || 0;
                const prevClose = parseFloat(item.f18) || 0;
                const limitPrice = parseFloat(item.f51) || 0;
                const board = getBoard(code);
                const limitUp = limitPrice > 0 && price > 0 && price.toFixed(2) === limitPrice.toFixed(2);

                stocks.push({
                  id: `stock_${index}`,
                  rank: index + 1,
                  stockCode: code,
                  stockName: name,
                  board: board,
                  boardName: BOARD_TYPES.find(b => b.code === board)?.name || board,
                  isLimitUp: limitUp,
                  limitPrice: limitPrice,
                  price: price.toFixed(2),
                  changePercent: parseFloat(changePercent.toFixed(2)),
                  changeAmount: parseFloat(changeAmount.toFixed(2)),
                  amount: (amount / 100000000).toFixed(2),
                  amplitude: parseFloat(amplitude.toFixed(2)),
                  turnover: parseFloat(turnover.toFixed(2)),
                  pe: pe ? parseFloat(pe.toFixed(2)) : '--',
                  volumeRatio: volumeRatio ? parseFloat(volumeRatio.toFixed(2)) : '--',
                  high: high ? high.toFixed(2) : '--',
                  low: low ? low.toFixed(2) : '--',
                  open: open ? open.toFixed(2) : '--',
                  prevClose: prevClose ? prevClose.toFixed(2) : '--'
                });
              });
            }
            res();
          },
          fail: () => res()
        });
      });

      Promise.all([fetchGainers]).then(() => {
        stocks.sort((a, b) => b.changePercent - a.changePercent);
        resolve(stocks);
      });
    });
  },

  fetchAbnormalStocks() {
    return new Promise((resolve) => {
      const abnormalList = [];

      const fetchBillboard = new Promise((res) => {
        const url = 'https://datacenter-web.eastmoney.com/api/data/v1/get?reportName=RPT_DAILYBILLBOARD_DETAILSNEW&columns=ALL&filter=&pageNumber=1&pageSize=50&sortTypes=-1&sortColumns=TRADE_DATE&source=WEB&client=WEB&_=' + Date.now();
        wx.request({
          url: url,
          method: 'GET',
          timeout: 15000,
          success: (resp) => {
            if (resp.statusCode === 200 && resp.data && resp.data.result && resp.data.result.data) {
              const records = resp.data.result.data || [];
              records.forEach((item, index) => {
                const code = item.SECURITY_CODE || '';
                const name = item.SECURITY_NAME_ABBR || item.SECURITY_NAME || '';
                const reason = item.EXPLANATION || '异常波动';
                const closePrice = item.CLOSE_PRICE || 0;
                const changeRate = item.CHANGE_RATE || 0;
                const accumAmount = item.ACCUM_AMOUNT || 0;
                const turnoverRate = item.TURNOVERRATE || 0;
                const tradeDate = item.TRADE_DATE || '';
                const board = getBoard(code);

                abnormalList.push({
                  id: `billboard_${index}`,
                  stockCode: code,
                  stockName: name,
                  board: board,
                  boardName: BOARD_TYPES.find(b => b.code === board)?.name || board,
                  reason: reason,
                  tradeDate: tradeDate ? tradeDate.split(' ')[0] || tradeDate.split('T')[0] : '',
                  price: closePrice ? closePrice.toFixed(2) : '--',
                  changePercent: changeRate ? parseFloat(changeRate.toFixed(2)) : 0,
                  amount: accumAmount ? (accumAmount / 100000000).toFixed(2) : '0',
                  turnoverRate: turnoverRate ? parseFloat(turnoverRate.toFixed(2)) : 0,
                  abnormalType: Math.abs(changeRate) > 15 ? 'severe' : 'normal',
                  abnormalTypeName: Math.abs(changeRate) > 15 ? '严重异常' : '异常波动'
                });
              });
            }
            res();
          },
          fail: () => res()
        });
      });

      Promise.all([fetchBillboard]).then(() => {
        abnormalList.sort((a, b) => Math.abs(b.changePercent) - Math.abs(a.changePercent));
        resolve(abnormalList.slice(0, 50));
      });
    });
  },

  switchTab(e) {
    const tab = e.currentTarget.dataset.tab;
    this.setData({ activeTab: tab });
    this.saveSettings();
  },

  setBoardFilter(e) {
    const board = e.currentTarget.dataset.board;
    this.setData({ boardFilter: board });
    this.applyGainersFilter();
  },

  applyGainersFilter() {
    const { gainersList, boardFilter } = this.data;

    let filtered = [...gainersList];

    if (boardFilter !== 'all') {
      filtered = filtered.filter(a => a.board === boardFilter);
    }

    this.setData({ filteredGainers: filtered });
  },

  setAbnormalTypeFilter(e) {
    const type = e.currentTarget.dataset.type;
    this.setData({ abnormalTypeFilter: type });
    this.applyAbnormalFilter();
  },

  applyAbnormalFilter() {
    const { abnormalStocks, abnormalTypeFilter } = this.data;

    let filtered = [...abnormalStocks];

    if (abnormalTypeFilter !== 'all') {
      filtered = filtered.filter(a => a.abnormalType === abnormalTypeFilter);
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

  getChangeClass(value) {
    return parseFloat(value) >= 0 ? 'up' : 'down';
  },

  getChangePrefix(value) {
    return parseFloat(value) >= 0 ? '+' : '';
  }
});
