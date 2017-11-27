const path = require('path');

module.exports = {
  entry: "./src/main.js",
  externals: {
    // CDN and non bundled js files go here
  },
  output: {
    filename: 'bundle.js',
    path: path.resolve(__dirname, 'app'),
    library: 'app',
    libraryTarget: 'var'
  },
  resolve: {
    alias: {
      // Otherwise we get a nasty confused recursive dependency
      linkedlist: 'linkedlist/lib/linkedlist.js'
    }
  },
  devtool: "source-map"
};