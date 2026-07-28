import { useEffect, useState } from 'react'

interface WildBlade {
  id: number
  height: number
  width: number
  delay: number
  duration: number
  opacity: number
  left: string
  isLeftCurve: boolean
}

/**
 * 底部随风摇摆草地（参考 XinghuisamaBlogs WindyGrass）。
 * 白天：翠绿色草叶；黑夜：银白色草叶。
 */
export default function WindyGrass({ isDark }: { isDark: boolean }) {
  const [blades, setBlades] = useState<WildBlade[]>([])

  useEffect(() => {
    const generated: WildBlade[] = Array.from({ length: 150 }).map((_, i) => ({
      id: i,
      height: 30 + Math.random() * 50,
      width: 1 + Math.random() * 2,
      delay: Math.random() * -10,
      duration: 3 + Math.random() * 4,
      opacity: 0.2 + Math.random() * 0.4,
      left: `${(i / 150) * 100 + (Math.random() - 0.5) * 0.5}%`,
      isLeftCurve: Math.random() > 0.5,
    }))
    setBlades(generated)
  }, [])

  return (
    <div
      className="pointer-events-none fixed bottom-0 left-0 z-10 h-32 w-full overflow-hidden transition-colors duration-1000"
      aria-hidden
    >
      <style>{`@keyframes swayWildGrass { 0% { transform: rotate(-5deg); } 100% { transform: rotate(15deg); } }`}</style>
      {blades.map((blade) => (
        <div
          key={blade.id}
          className="absolute bottom-0 flex origin-bottom items-end"
          style={{
            left: blade.left,
            height: `${blade.height}px`,
            width: `${blade.width * 4}px`,
            opacity: blade.opacity,
            animation: `swayWildGrass ${blade.duration}s ease-in-out infinite alternate`,
            animationDelay: `${blade.delay}s`,
          }}
        >
          <div
            className={`h-full w-full transition-all duration-1000 ${
              isDark
                ? 'bg-gradient-to-t from-white/80 to-transparent'
                : 'bg-gradient-to-t from-emerald-500/80 to-transparent'
            }`}
            style={{
              width: `${blade.width}px`,
              borderRadius: blade.isLeftCurve ? '100% 0 0 100%' : '0 100% 100% 0',
              transform: blade.isLeftCurve ? 'translateX(50%)' : 'translateX(-50%)',
            }}
          />
        </div>
      ))}
    </div>
  )
}
