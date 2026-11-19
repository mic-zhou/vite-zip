/**
 * zip.ts —— 构建后自动压缩 dist 的 vite 插件
 *
 * fs 被替换成内存文件系统（路径统一归一化大小写与分隔符），
 * 因此既能真实跑完 JSZip 的压缩流程（用 JSZip.loadAsync 反解校验包内容），
 * 又不会在仓库里产生任何 dist / zip 文件。
 */
import { describe, it, expect, vi, beforeAll, beforeEach } from 'vitest'
import path from 'path'
import JSZip from 'jszip'

vi.mock('fs', () => {
  const norm = (p: unknown) =>
    String(p)
      .split('\\')
      .join('/')
      .toLowerCase()
      .replace(/\/+$/, '')
  const dirs = new Set<string>()
  const files = new Map<string, string>()
  const removed: string[] = []
  const written: Array<{ dest: string; content: Buffer }> = []

  const readdirSync = vi.fn((dir: string) => {
    const prefix = norm(dir) + '/'
    const names = new Set<string>()
    files.forEach((_c, f) => {
      if (f.startsWith(prefix)) names.add(f.slice(prefix.length).split('/')[0])
    })
    dirs.forEach((d) => {
      if (d.startsWith(prefix)) names.add(d.slice(prefix.length).split('/')[0])
    })
    return [...names]
  })
  const statSync = vi.fn((target: string) => {
    const isDir = dirs.has(norm(target))
    return { isDirectory: () => isDir, isFile: () => !isDir }
  })
  const readFileSync = vi.fn((target: string) => Buffer.from(files.get(norm(target)) ?? '', 'utf-8'))
  const existsSync = vi.fn((target: string) => files.has(norm(target)) || dirs.has(norm(target)))
  const unlinkSync = vi.fn((target: string) => {
    const key = norm(target)
    removed.push(key)
    files.delete(key)
    dirs.delete(key)
  })
  const writeFileSync = vi.fn((target: string, data: Uint8Array) => {
    written.push({ dest: norm(target), content: Buffer.from(data) })
  })

  const mem = { dirs, files, removed, written, norm, readdirSync, statSync, unlinkSync }
  const addDir = (p: string) => dirs.add(norm(p))
  const addFile = (p: string, c: string) => files.set(norm(p), c)
  const reset = () => {
    dirs.clear()
    files.clear()
    removed.length = 0
    written.length = 0
    readdirSync.mockClear()
    statSync.mockClear()
    unlinkSync.mockClear()
    writeFileSync.mockClear()
  }
  Object.assign(mem, { addDir, addFile, reset })

  const api = { readdirSync, statSync, readFileSync, existsSync, unlinkSync, writeFileSync, mem }
  return { __esModule: true, default: api, ...api }
})

interface Mem {
  addDir: (p: string) => void
  addFile: (p: string, c: string) => void
  removed: string[]
  written: Array<{ dest: string; content: Buffer }>
  norm: (p: unknown) => string
  reset: () => void
  unlinkSync: ReturnType<typeof vi.fn>
  readdirSync: ReturnType<typeof vi.fn>
  statSync: ReturnType<typeof vi.fn>
}

/* eslint-disable @typescript-eslint/no-explicit-any */
let mem: Mem
let pluginZip: (fileName: string, output?: string) => {
  name: string
  apply: string
  closeBundle: () => void
}

beforeAll(async () => {
  const [fsModule, zipModule] = await Promise.all([import('fs') as any, import('../../src/index.js')])
  mem = fsModule.mem as Mem
  pluginZip = zipModule.pluginZip
})

beforeEach(() => {
  mem.reset()
})

/** closeBundle 内部的压缩流程是异步的，轮询直到落盘 */
const flushZip = async () => {
  for (let i = 0; i < 500 && mem.written.length === 0; i++) {
    await new Promise((resolve) => setTimeout(resolve, 0))
  }
  expect(mem.written.length).toBeGreaterThan(0)
}

/** 搭一个 dist 夹具：根文件 + 两级子目录 */
const seedDist = (dist: string) => {
  mem.addDir(dist)
  mem.addFile(path.join(dist, 'index.html'), '<html>ok</html>')
  mem.addDir(path.join(dist, 'assets'))
  mem.addFile(path.join(dist, 'assets', 'app.js'), 'console.log(1)')
  mem.addDir(path.join(dist, 'assets', 'img'))
  mem.addFile(path.join(dist, 'assets', 'img', 'logo.svg'), '<svg/>')
}

describe('zip.ts pluginZip', () => {
  it('返回仅在 build 阶段生效的 vite 插件描述', () => {
    const plugin = pluginZip('pkg', path.join(process.cwd(), 'tmp-dist'))
    expect(plugin.name).toBe('vite-plugin-auto-zip')
    expect(plugin.apply).toBe('build')
    expect(typeof plugin.closeBundle).toBe('function')
    // 仅构造插件不应触发任何文件读写
    expect(mem.readdirSync).not.toHaveBeenCalled()
    expect(mem.written).toHaveLength(0)
  })

  it('closeBundle 递归打包 dist 并写到 dist 的上一级目录', async () => {
    const dist = path.join(process.cwd(), 'tmp-dist', 'dist')
    seedDist(dist)

    pluginZip('pkg', dist).closeBundle()
    await flushZip()

    const dest = path.join(dist, '..', 'pkg.zip')
    expect(mem.written[0].dest).toBe(mem.norm(dest))

    const loaded = await JSZip.loadAsync(mem.written[0].content)
    expect(await loaded.file('index.html')!.async('string')).toBe('<html>ok</html>')
    expect(await loaded.file('assets/app.js')!.async('string')).toBe('console.log(1)')
    expect(await loaded.file('assets/img/logo.svg')!.async('string')).toBe('<svg/>')
    // 目录条目由 JSZip.folder 生成（键名以 / 结尾），文件条目保留递归后的相对路径
    expect(Object.keys(loaded.files).sort()).toEqual([
      'assets/',
      'assets/app.js',
      'assets/img/',
      'assets/img/logo.svg',
      'index.html'
    ])
  })

  it('打包前删除 dist 内遗留的同名 zip', async () => {
    const dist = path.join(process.cwd(), 'tmp-dist', 'dist')
    seedDist(dist)
    mem.addFile(path.join(dist, 'pkg.zip'), 'stale')

    pluginZip('pkg', dist).closeBundle()
    await flushZip()

    expect(mem.removed).toContain(mem.norm(path.join(dist, 'pkg.zip')))
    expect(mem.unlinkSync).toHaveBeenCalledTimes(1)
    // 遗留 zip 在遍历前就被删掉，不会被打进新包
    const loaded = await JSZip.loadAsync(mem.written[0].content)
    expect(loaded.file('pkg.zip')).toBeNull()
  })

  it('dist 内没有遗留 zip 时不执行删除', async () => {
    const dist = path.join(process.cwd(), 'tmp-dist', 'dist')
    seedDist(dist)

    pluginZip('pkg', dist).closeBundle()
    await flushZip()

    expect(mem.removed).toHaveLength(0)
    expect(mem.unlinkSync).not.toHaveBeenCalled()
  })

  it('未传 output 时默认压缩项目根目录下的 dist', async () => {
    const dist = path.join(process.cwd(), 'dist')
    seedDist(dist)

    pluginZip('app').closeBundle()
    await flushZip()

    expect(mem.written[0].dest).toBe(mem.norm(path.join(process.cwd(), 'app.zip')))
    const loaded = await JSZip.loadAsync(mem.written[0].content)
    expect(await loaded.file('assets/app.js')!.async('string')).toBe('console.log(1)')
  })
})
