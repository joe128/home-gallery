import t from 'tap'
import fs from 'fs/promises'
import { createReadStream } from 'fs'
import path from 'path'
import os from 'os'
import { extract } from 'tar-stream'
import { createGunzip } from 'zlib'

import { bundle, BundleOptions } from './index'
import { BundleConfig, extendConfig } from './config'

const getSimpleDate = () => new Date().toISOString().replace(/[-:]/g, '').replace('T', '-').substring(4, 15)

const baseTestDir = path.join(os.tmpdir(), 'gallery-test', 'bundle', `run-${getSimpleDate()}`)

const toBundleConfig = (testName: string, config: any): BundleConfig => extendConfig({
  targets: [{platform: process.platform, arch: process.arch, command: false}],
  output: {
    dir: path.join(baseTestDir, testName),
    name: testName,
    ...config.output
  },
  ...config
}, process.platform, process.arch)

const getBaseDir = (name: string) => path.resolve(__dirname, '..', 'test', 'bundle', name)

const listTarGzFiles = async (testName: string, platformArch = `${process.platform}-${process.arch}`, version = '1.0.0') => {
  const archiveFile = path.join(baseTestDir, testName, version, `${testName}-${version}-${platformArch}.tar.gz`)
  console.log(`Reading ${archiveFile}`)

  return new Promise<string[]>((resolve, reject) => {
    const tarStream = extract()
    const files: string[] = []
    tarStream.on('entry', (header, stream, next) => {
      files.push(header.name)
      stream.on('end', next)
      stream.resume()
    })

    tarStream.on('finish', () => resolve(files))
    tarStream.on('error', err => reject(err))

    createReadStream(archiveFile)
        .pipe(createGunzip())
        .pipe(tarStream)
  })
}

t.test('Bundle', async t => {
  await fs.mkdir(baseTestDir, {recursive: true})

  t.test('basic', async t => {
    const options: BundleOptions = {
      baseDir: getBaseDir('basic'),
      version: '1.0.0',
      bundleConfig: toBundleConfig('basic', {
        packages: ['.'],
      })
    }
    await bundle(options)
    t.same(await listTarGzFiles('basic'), [
      '.',
      'index.js',
      'package.json'
    ], 'should contain package.json')
  })

  t.test('include-exclude', async t => {
    const options: BundleOptions = {
      baseDir: getBaseDir('include-exclude'),
      version: '1.0.0',
      bundleConfig: toBundleConfig('include-exclude', {
        packages: ['.'],
        includes: ['vendor'],
        excludes: ['vendor/*-win.exe']
      })
    }
    await bundle(options)
    t.same(await listTarGzFiles('include-exclude'), [
      '.',
      'index.js',
      'package.json',
      'vendor',
      'vendor/bin-linux',
    ], 'should contain only linux bin from vendor')
  })

  t.test('map names', async t => {
    const options: BundleOptions = {
      baseDir: getBaseDir('include-exclude'),
      version: '1.0.0',
      bundleConfig: toBundleConfig('map-names', {
        packages: ['.'],
        includes: ['vendor/*'],
        map: [{'vendor': 'bin'}]
      })
    }
    await bundle(options)
    t.same(await listTarGzFiles('map-names'), [
      '.',
      'index.js',
      'package.json',
      'bin',
      'bin/bin-linux',
      'bin/bin-win.exe',
    ], 'should contain only linux bin from vendor')
  })

  t.test('platform specific', async t => {
    const options: BundleOptions = {
      baseDir: getBaseDir('platform'),
      version: '1.0.0',
      bundleConfig: toBundleConfig('linux-platform', {
        targets: [{platform: 'linux', arch: 'x64'}, {platform: 'darwin', arch: 'x64'}],
        packages: ['.'],
      })
    }
    await bundle(options)
    t.same(await listTarGzFiles('linux-platform', 'linux-x64'), [
      '.',
      'index.js',
      'node_modules',
      'package.json',
      'node_modules/a',
      'node_modules/a/package.json',
    ], 'should contain only linux dependency')
    t.same(await listTarGzFiles('linux-platform', 'darwin-x64'), [
      '.',
      'index.js',
      'node_modules',
      'package.json',
      'node_modules/b',
      'node_modules/b/package.json',
    ], 'should contain only darwin dependency')
  })

})

