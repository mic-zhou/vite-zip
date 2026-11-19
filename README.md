# vite-zip

Vite 插件：构建（build）结束后自动把 dist 目录压缩为 zip 包，输出到 dist 的上一级目录。

jszip 为可选 peer 依赖：只有真正打包时才会动态加载（`import('jszip')`），不安装 jszip 也可以安全引入本包的其他能力。

## 安装

```bash
npm install vite-zip jszip -D
```

## 使用

```ts
// vite.config.ts
import { pluginZip } from 'vite-zip'

export default defineConfig({
  plugins: [
    pluginZip('my-app')
  ]
})
```

构建结束后在 dist 上一级目录生成 `my-app.zip`（DEFLATE 算法，压缩级别 9）。

## API

### pluginZip(fileName, output?)

返回一个仅 build 阶段生效的 vite 插件对象（`name: 'vite-plugin-auto-zip'`，`apply: 'build'`，钩子 `closeBundle`）。

| 参数 | 类型 | 默认值 | 说明 |
|------|------|--------|------|
| `fileName` | `string` | 必填 | zip 文件名（自动追加 `.zip`），通常传 `package.json` 的 `name` |
| `output` | `string` | `process.cwd()/dist` | 要压缩的 dist 目录路径 |

```ts
// 完整示例：用项目名做 zip 文件名
import { defineConfig } from 'vite'
import { pluginZip } from 'vite-zip'
import packageJson from './package.json'

export default defineConfig(({ mode }) => {
  const distName = `${packageJson.name}-${packageJson.version}-${mode}`
  return {
    plugins: [pluginZip(distName)]
  }
})

// 自定义 dist 路径
pluginZip('my-app', '/path/to/dist')
```

## 行为说明

- 打包前会自动删除 dist 内遗留的**同名** zip，避免旧包被打进新包
- zip 输出到 dist 的**上一级**目录（与 dist 同级），不会污染 dist 内容
- 目录结构完整保留：子目录在 zip 中以目录条目 + 相对路径文件条目呈现
- 插件只在 `vite build` 时生效，`vite dev` 不受影响

## License

[MIT](./LICENSE)
