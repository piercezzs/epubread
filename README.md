## 环境

- Windows
- Electron
- Node.js
- Vue
- native-ui
- 其他...

## 启动

npm i
npm run dev
npm run rebuild-electron
$env:NODE_ENV="development"; npm run electron  # Windows PowerShell临时设置环境变量

## 打包

npm run build
node node_modules/electron-builder/out/cli/cli.js

## todo

1. 安装，指定路径后，补上/epubread
2. 发布者未知 代码签名证书
3. 提供卸载
