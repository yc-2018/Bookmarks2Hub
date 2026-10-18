import { defineConfig } from 'wxt';

/**
 * Chrome 扩展公钥（base64 的 SPKI DER）。对应的私钥已删除且无备份：本项目只走 zip 分发，
 * 不打 crx、不上架，私钥没有用武之地，详见 CLAUDE.md。
 *
 * 唯一作用是把扩展 ID 钉死：ID = SHA-256(DER 公钥)[:16] 映射到 a-p。没有它时，
 * Chromium 对拖入的 zip / 加载已解压的扩展按「解压目录的绝对路径」派生 ID，
 * 而每次拖拽都会解压到 UnpackedExtensions/<包名>_<pid>_<随机数> 这个全新目录，
 * 于是每次都是新 ID —— Chrome 认为是另一个扩展，列表里多一条而不是原地覆盖，
 * 用户填过的配置也随 ID 一起丢。
 *
 * 加了 key 之后 ID 固定为 cagopejcnnfcecidchgcgobaaiikgkgb，任何路径安装都会覆盖。
 * 此值一旦发布就不能再改，改了等于换 ID，所有用户的配置都要重来。
 */
const EXTENSION_KEY = 'MIIBIjANBgkqhkiG9w0BAQEFAAOCAQ8AMIIBCgKCAQEAkPNBGAs6r59NBQ1FnX8nbgw9nMXwiVnI7X4UGvowz5vK2IXOhE5qqMSJI6T+BnQZuc6SQiBvmRHUY4FNDQFm5IwpGcQwM+TGWFaB/l7ZXGabsn8ZO/RvboF+ynLxmV2eD76lNKW60vvrRlSgZXn7VM9tXd0vycGLvN/NTDWvMkD0VCdMWkkhIZNUtejMzz7VBcLGuduIMK4vYPSMCGNN+1HUoVqgP1oIuBCU6idj2AuQjn1/4Ys+stNeOvcDSkmykxXCJ+gPKVQ8cAdCWUe5gxbiuGvg2mhey3uvBX7o9JESECKpsmInbZpCEkIpL6QIvNmY4BCLzvI3yBCCvXeeWwIDAQAB';

export default defineConfig({
  extensionApi: 'chrome',
  srcDir: 'src',
  modules: ['@wxt-dev/module-react', '@wxt-dev/auto-icons'],
  // 函数形式只为了把 key 排除在 Firefox 之外：Firefox 不认这个字段，
  // 放进 MV2 manifest 只会让 AMO 的 linter 报「未知属性」。
  manifest: (env) => ({
    name: "Bookmarks 2 Hub - 书签备份到 Git 仓库",
    description: "在不同浏览器之间同步书签，支持 GitHub Gist 与 Gitee 代码片段作为存储",
    permissions: ['storage', 'bookmarks', 'notifications'],
    host_permissions: [
      "https://*.github.com/",
      "https://*.githubusercontent.com/",
      "https://gitee.com/",
      "https://*.gitee.com/",
    ],
    optional_host_permissions: [
      "*://*/*",
    ],
    ...(env.browser === 'firefox' ? {
      // Firefox 的 storage.sync 依赖扩展 ID 定位数据：没有它时 set() 会静默失败，
      // 设置页填的值关掉再开就全没了。临时载入也不会持久，因为每次都是新的随机 ID。
      // 这个 ID 一旦发布同样不要改，否则已存的设置会读不到。
      browser_specific_settings: {
        gecko: {
          id: 'bookmarks2hub@yc-2018.github.io',
          strict_min_version: '109.0',
        },
      },
    } : { key: EXTENSION_KEY }),
  }),
  // Firefox 审核用的源码包只需要能构建出扩展的文件。默认会把仓库里
  // 已提交的发行 zip 一起打进去，导致每发一版体积翻倍累积。
  zip: {
    excludeSources: [
      '**/*.zip',
      'releases/**',
      'chrome-extension-build/**',
      'images/**',
      '.codegraph/**',
    ],
  }
});
