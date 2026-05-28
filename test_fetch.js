const https = require('https');

const codes = 'nf_IC2606,sh000905';
const url = 'https://hq.sinajs.cn/list=' + codes;

https.get(url, { headers: { 'Referer': 'https://finance.sina.com.cn/' } }, (res) => {
  let data = '';
  res.on('data', chunk => data += chunk);
  res.on('end', () => {
    const varMatches = data.match(/var hq_str_(\w+)="([^"]*)"/g);
    if (varMatches) {
      varMatches.forEach(v => {
        const m = v.match(/var hq_str_(\w+)="([^"]*)"/);
        if (m && m[2]) {
          const code = m[1];
          const parts = m[2].split(',');
          console.log('=== ' + code + ' ===');
          console.log('字段总数:', parts.length);
          parts.forEach((p, i) => {
            if (p && p.trim()) console.log('  [' + i + '] = ' + p);
          });
        }
      });
    }
  });
}).on('error', e => console.error('Error:', e.message));
