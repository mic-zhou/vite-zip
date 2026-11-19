/**
 * vite-zip —— 构建结束后把 dist 压缩为 zip 的 vite 插件
 *
 * jszip 为可选 peer 依赖：仅在 closeBundle 真正打包时动态加载，
 * 不安装 jszip 的项目可以在不触发本插件的前提下正常引入其他模块。
 */

import path from 'path'
import fs from 'fs'

export const pluginZip = function (fileName: string, output?: string) {
  // 默认压缩项目根目录下的 dist（以执行 vite 命令时的 cwd 为准）
  if (!output) output = path.resolve(process.cwd(), './dist')
  fileName += '.zip'

  const makeZip = async () => {
    const { default: JSZip } = await import('jszip')
    const zip = new JSZip()
    const distPath = path.resolve(output!)
    const readDir = function (zipFile: any, dirPath: string) {
      // 读取 dist 下的根文件目录
      const files = fs.readdirSync(dirPath)
      files.forEach(fileItem => {
        const fillPath = path.join(dirPath, './', fileItem)
        const file = fs.statSync(fillPath)
        // 如果是文件夹的话需要递归遍历下面的子文件
        if (file.isDirectory()) {
          const dirZip = zipFile.folder(fileItem)
          readDir(dirZip, fillPath)
        } else {
          // 读取每个文件为 buffer 存到 zip 中
          zipFile.file(fileItem, fs.readFileSync(fillPath))
        }
      })
    }
    const removeExistedZip = () => {
      const dest = path.join(distPath, './' + fileName)
      if (fs.existsSync(dest)) {
        fs.unlinkSync(dest)
      }
    }

    removeExistedZip()
    readDir(zip, distPath)
    const content = await zip.generateAsync({
      type: 'nodebuffer', // 压缩类型
      compression: 'DEFLATE', // 压缩算法
      compressionOptions: {
        // 压缩级别
        level: 9
      }
    })
    removeExistedZip()
    fs.writeFileSync(path.join(distPath, '../' + fileName), content)
  }

  return {
    name: 'vite-plugin-auto-zip',
    apply: 'build' as const,
    async closeBundle() {
      await makeZip()
    }
  }
}
