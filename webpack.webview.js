const path = require('path');
module.exports = {
    mode: 'production', target: 'web', entry: './src/webview.ts',
    output: { path: path.resolve(__dirname, 'dist'), filename: 'webview.js' },
    resolve: { extensions: ['.ts', '.js'] },
    module: { rules: [{ test: /\.ts$/, use: 'ts-loader', exclude: /node_modules/ }] },
    stats: 'errors-only',
};
