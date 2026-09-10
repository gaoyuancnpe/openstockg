'use strict';
/* electron-builder afterPack 钩子: 把 vendor 四件套原样复制进打包产物的 resources\。
 * 不用 extraResources 的原因: 它对包含 node_modules 的目录会走依赖收集器,
 * 实测会把 app-full 整个丢掉、把 vendor-memory 剪空(缺包问题同踩坑 #21 的根因)。
 * afterPack 在 nsis 压缩之前执行,dir 与 nsis 两种产物都会带上。 */
const fs = require('fs');
const path = require('path');

const VENDOR = path.join(__dirname, 'vendor');
const TARGETS = [
  ['app-full', 'app-full'],
  ['assets', 'assets'],
  ['python', 'vendor-python'],
  ['memory', 'vendor-memory'],
];

exports.afterPack = async function afterPack(context) {
  const resourcesDir = path.join(context.appOutDir, 'resources');
  for (const [src, dst] of TARGETS) {
    const from = path.join(VENDOR, src);
    const to = path.join(resourcesDir, dst);
    if (!fs.existsSync(from)) {
      console.log(`[afterPack] 跳过 ${dst}(vendor/${src} 不存在,请先跑 tools/make_vendor.py)`);
      continue;
    }
    fs.rmSync(to, { recursive: true, force: true });
    fs.cpSync(from, to, { recursive: true });
    console.log(`[afterPack] 已复制 ${dst}`);
  }
};
