import Fireflies from './Fireflies'
import Sakura from './Sakura'
import WindyGrass from './WindyGrass'

/**
 * 背景特效切换：黑夜显示萤火虫，白天显示樱花，底部草地常驻。
 * 两层同时渲染，通过透明度渐变交叉淡入淡出（参考 XinghuisamaBlogs 的 BackgroundEffects）。
 */
export default function BackgroundEffects({ isDark }: { isDark: boolean }) {
  return (
    <>
      <div
        className={`transition-opacity duration-1000 ${isDark ? 'opacity-100' : 'opacity-0'}`}
        aria-hidden
      >
        <Fireflies />
      </div>
      <div
        className={`transition-opacity duration-1000 ${isDark ? 'opacity-0' : 'opacity-100'}`}
        aria-hidden
      >
        <Sakura />
      </div>

      {/* 草地常驻，内部自动切换日/夜配色 */}
      <WindyGrass isDark={isDark} />
    </>
  )
}
