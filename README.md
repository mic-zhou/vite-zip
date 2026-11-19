# vite-zip

Vite 插件：构建（build）结束后自动把 dist 目录压缩为 zip 包，输出到 dist 的上一级目录。

## 安装

```bash
npm install vite-zip jszip -D
```

jszip 为可选 peer 依赖：只有真正打包时才会动态加载，不装 jszip 也可以安全引入本包。

## 使用

```ts
// vite.config.ts
import { pluginZip } from 'vite-zip'

export default {
  plugins: [
    pluginZip('my-app') // 构建结束 => 生成 my-app.zip
  ]
}
```

```ts
pluginZip('my-app', '/path/to/dist') // 第二个参数可指定 dist 路径，默认 process.cwd()/dist
```

打包前会自动删除 dist 内遗留的同名 zip，避免旧包被打进新包。

## License

[MIT](./LICENSE)
