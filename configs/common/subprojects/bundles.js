
const reactLibs = require('./react');

const subprojects = {
  // Re-export react libs
  react: reactLibs.react,
  reactDom: reactLibs.reactDom,

  // Define bundles
  qrcodejs: {
    src: 'node_modules/qrcodejs',
    include: ['qrcode.min.js'],
    dest: 'vendor',
  },
  tablesorter: {
    src: 'node_modules/tablesorter/dist/js',
    include: ['jquery.tablesorter.min.js'],
    dest: 'vendor',
  },
  chai: {
    src: 'node_modules/chai',
    include: ['chai.js'],
    dest: 'vendor'
  },
  'chai-dom': {
    src: 'node_modules/chai-dom',
    include: ['chai-dom.js'],
    dest: 'vendor',
  },
  mocha: {
    src: 'node_modules/mocha',
    include: ['mocha.css', 'mocha.js'],
    dest: 'vendor',
  },
  'core-js': {
    src: 'node_modules/core-js/client',
    include: ['core.js'],
    dest: 'vendor',
  },
  'ua-parser-js': {
    src: 'node_modules/ua-parser-js/dist',
    include: ['ua-parser.min.js'],
    dest: 'vendor',
  },
  moment: {
    src: 'node_modules/moment/min',
    include: ['moment.min.js'],
    dest: 'vendor',
  },
  'moment-range': {
    src: 'node_modules/moment-range/dist',
    include: ['moment-range.js'],
    dest: 'vendor',
  },
  'simple-statistics': {
    src: 'node_modules/simple-statistics/dist',
    include: ['simple-statistics.min.js'],
    dest: 'vendor',
  },
  '@cliqz/adblocker': {
    src: 'node_modules/@cliqz/adblocker',
    include: [
      'adblocker.umd.js',
      'adblocker-cosmetics.umd.js',
    ],
    dest: 'vendor',
  },
  'cliqz-history': {
    src: 'node_modules/cliqz-history/dist',
    dest: 'cliqz-history'
  },
  '@cliqz-oss/dexie': {
    src: 'node_modules/@cliqz-oss/dexie/dist',
    include: ['dexie.min.js'],
    dest: 'vendor'
  },
  '@cliqz-oss/pouchdb': {
    src: 'node_modules/@cliqz-oss/pouchdb/dist',
    include: ['pouchdb.js'],
    dest: 'vendor'
  },
  jquery: {
    src: 'node_modules/jquery/dist',
    include: ['jquery.min.js'],
    dest: 'vendor'
  },
  handlebars: {
    src: 'node_modules/handlebars/dist',
    include: ['handlebars.min.js'],
    dest: 'vendor'
  },
  mathjs: {
    src: 'node_modules/mathjs/dist',
    include: ['math.min.js'],
    dest: 'vendor'
  },
  rxjs: {
    src: 'node_modules/rxjs/bundles',
    include: ['Rx.min.js'],
    dest: 'vendor'
  },
  pako: {
    src: 'node_modules/pako/dist',
    include: ['pako.min.js'],
    dest: 'vendor'
  },
  'tooltipster-js': {
    src: 'node_modules/tooltipster/dist/js',
    include: ['tooltipster.bundle.min.js'],
    dest: 'vendor'
  },
  'tooltipster-css': {
    src: 'node_modules/tooltipster/dist/css',
    include: ['tooltipster.bundle.min.css'],
    dest: 'vendor'
  },
  'tooltipster-sideTip-theme': {
    src: 'node_modules/tooltipster/dist/css/plugins/tooltipster/sideTip/themes',
    include: ['tooltipster-sideTip-shadow.min.css'],
    dest: 'vendor'
  },
  tldjs: {
    src: 'node_modules/tldjs',
    include: ['tld.min.js'],
    dest: 'vendor',
  }
};

module.exports = (modules) => {
  const result = [];
  modules.forEach((m) => {
    if (subprojects[m] === undefined) {
      throw new Error(`Could not find subproject: ${m}`);
    }
    result.push(subprojects[m]);
  });
  return result;
};
