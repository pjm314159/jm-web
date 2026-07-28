import { useEffect, useState } from 'react'

/**
 * 樱花飘落背景动效（白天模式）。
 * 参考 XinghuisamaBlogs 的 Sakura：40 片花瓣从顶部飘落并旋转。
 */

interface Petal {
  id: number
  left: string
  size: number
  duration: number
  delay: number
}

export default function Sakura() {
  const [petals, setPetals] = useState<Petal[]>([])

  useEffect(() => {
    const generated: Petal[] = Array.from({ length: 40 }).map((_, i) => ({
      id: i,
      left: `${Math.random() * 100}%`,
      size: 8 + Math.random() * 12,
      duration: 6 + Math.random() * 8,
      delay: Math.random() * -15,
    }))
    setPetals(generated)
  }, [])

  return (
    <div className="pointer-events-none fixed inset-0 z-0 h-full w-full overflow-hidden">
      <style>{`
        @keyframes sakuraFall {
          0% { transform: translate(0, -10vh) rotate(0deg); opacity: 0; }
          10% { opacity: 1; }
          80% { opacity: 1; }
          100% { transform: translate(15vw, 110vh) rotate(360deg); opacity: 0; }
        }
      `}</style>

      {petals.map((p) => (
        <div
          key={p.id}
          className="absolute top-0 bg-pink-300/70 shadow-[0_0_5px_rgba(255,182,193,0.6)]"
          style={{
            left: p.left,
            width: `${p.size}px`,
            height: `${p.size * 1.2}px`,
            borderRadius: '100% 0 100% 0',
            animation: `sakuraFall ${p.duration}s linear infinite`,
            animationDelay: `${p.delay}s`,
          }}
        />
      ))}
    </div>
  )
}
