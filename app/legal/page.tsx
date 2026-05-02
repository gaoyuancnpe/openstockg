import Link from "next/link";

const sourceRepoUrl = "https://github.com/gaoyuancnpe/openstockg";
const upstreamRepoUrl = "https://github.com/Open-Dev-Society/OpenStock";
const licenseUrl = "https://www.gnu.org/licenses/agpl-3.0.html";

export default function LegalPage() {
  return (
    <main className="min-h-screen bg-gray-950 text-gray-100">
      <div className="mx-auto max-w-4xl px-6 py-12">
        <div className="mb-8">
          <h1 className="text-3xl font-semibold tracking-tight">法律说明与源码获取</h1>
          <p className="mt-3 max-w-3xl text-sm leading-6 text-gray-400">
            本项目保留上游许可证并在其基础上继续修改与分发。这里集中说明当前许可证、源码仓库、上游来源、无担保声明以及继续分发时需要注意的事项。
          </p>
        </div>

        <section className="rounded-2xl border border-gray-800 bg-gray-900/70 p-6">
          <h2 className="text-xl font-medium text-white">许可证</h2>
          <p className="mt-3 text-sm leading-6 text-gray-300">
            当前仓库按 <span className="font-medium text-white">AGPL-3.0-or-later</span> 分发。
            继续修改、分发，或通过网络对外提供相关版本时，应继续保留许可证并履行相应源码提供义务。
          </p>
          <div className="mt-4 flex flex-wrap gap-3 text-sm">
            <Link href={licenseUrl} target="_blank" rel="noopener noreferrer" className="text-teal-300 hover:text-teal-200">
              查看 AGPL 许可证全文
            </Link>
            <Link href={sourceRepoUrl} target="_blank" rel="noopener noreferrer" className="text-teal-300 hover:text-teal-200">
              查看当前仓库源码
            </Link>
          </div>
        </section>

        <section className="mt-6 rounded-2xl border border-gray-800 bg-gray-900/70 p-6">
          <h2 className="text-xl font-medium text-white">来源说明</h2>
          <p className="mt-3 text-sm leading-6 text-gray-300">
            本仓库基于开源项目 <span className="font-medium text-white">Open-Dev-Society/OpenStock</span> 的代码基础继续修改与扩展。
            当前仓库新增了桌面端提醒工具、命令行提醒脚本、FMP 适配以及一系列围绕提醒业务的界面与流程调整。
          </p>
          <div className="mt-4 flex flex-wrap gap-3 text-sm">
            <Link href={upstreamRepoUrl} target="_blank" rel="noopener noreferrer" className="text-teal-300 hover:text-teal-200">
              查看上游仓库
            </Link>
            <Link href={sourceRepoUrl} target="_blank" rel="noopener noreferrer" className="text-teal-300 hover:text-teal-200">
              查看当前修改版本
            </Link>
          </div>
        </section>

        <section className="mt-6 rounded-2xl border border-gray-800 bg-gray-900/70 p-6">
          <h2 className="text-xl font-medium text-white">无担保声明</h2>
          <p className="mt-3 text-sm leading-6 text-gray-300">
            本项目按“现状”提供，不提供任何明示或暗示担保。股票数据、筛选结果、提醒结果和自动化通知仅供工具用途，不构成投资建议。
          </p>
        </section>

        <section className="mt-6 rounded-2xl border border-gray-800 bg-gray-900/70 p-6">
          <h2 className="text-xl font-medium text-white">继续分发时请注意</h2>
          <ul className="mt-3 space-y-2 text-sm leading-6 text-gray-300">
            <li>保留根目录中的 LICENSE 和相关来源说明。</li>
            <li>如果你修改了代码，请显著说明你修改过哪些内容以及修改时间。</li>
            <li>如果你将相关版本作为网络服务公开提供，应向用户提供对应源码获取方式。</li>
          </ul>
        </section>

        <div className="mt-8 text-sm text-gray-400">
          <Link href="/sign-in" className="text-teal-300 hover:text-teal-200">
            返回登录页
          </Link>
        </div>
      </div>
    </main>
  );
}
