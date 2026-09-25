const path = require("path");

const babelLoaderConfig = {
  loader: "babel-loader",
  options: {
    plugins: [
      "@babel/plugin-syntax-dynamic-import",
      "@babel/plugin-proposal-class-properties",
      "@babel/plugin-proposal-object-rest-spread",
    ],
    presets: ["@babel/preset-env", "@babel/typescript"],
  },
};

module.exports = {
  entry: path.join(process.cwd(), "src/visio-main.ts"),
  mode: "production",
  devtool: "source-map",
  target: "web",
  resolve: {
    extensions: [".js", ".mjs", ".ts", ".tsx"],
  },
  externals: {
    obsidian: "commonjs obsidian",
    child_process: "commonjs child_process",
    electron: "commonjs electron",
    buffer: "commonjs buffer",
    fs: "commonjs fs",
    os: "commonjs os",
    path: "commonjs path",
    zlib: "commonjs zlib",
  },
  module: {
    rules: [
      {
        test: /\.ts(x?)$/,
        include: path.join(process.cwd(), "src"),
        use: [babelLoaderConfig],
      },
    ],
  },
  output: {
    filename: "main.js",
    path: path.join(process.cwd(), "dist-visio"),
    hashFunction: "sha256",
    libraryTarget: "commonjs2",
  },
};
