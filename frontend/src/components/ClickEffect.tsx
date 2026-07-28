import { useEffect, useRef } from 'react'

/**
 * 全局点击水波特效。
 * 参考 XinghuisamaBlogs 的 ClickEffect：canvas 绘制扩散涟漪，靛蓝主题色，带模糊光晕。
 */

interface Ripple {
  x: number
  y: number
  r: number
  opacity: number
  velocity: number
}

export default function ClickEffect() {
  const canvasRef = useRef<HTMLCanvasElement>(null)

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return

    let ripples: Ripple[] = []
    let frameId = 0

    const resize = () => {
      canvas.width = window.innerWidth
      canvas.height = window.innerHeight
    }
    window.addEventListener('resize', resize)
    resize()

    const createRipple = (x: number, y: number): Ripple => ({
      x,
      y,
      r: 0,
      opacity: 0.6,
      velocity: 2.5,
    })

    const updateRipple = (ripple: Ripple) => {
      ripple.r += ripple.velocity
      ripple.velocity *= 0.96
      ripple.opacity -= 0.015
    }

    const drawRipple = (ripple: Ripple) => {
      ctx.beginPath()
      ctx.arc(ripple.x, ripple.y, ripple.r, 0, Math.PI * 2)
      ctx.strokeStyle = `rgba(129, 140, 248, ${ripple.opacity})`
      ctx.lineWidth = 2
      ctx.stroke()

      ctx.beginPath()
      ctx.arc(ripple.x, ripple.y, ripple.r * 0.5, 0, Math.PI * 2)
      ctx.fillStyle = `rgba(129, 140, 248, ${ripple.opacity * 0.3})`
      ctx.fill()
    }

    const handleClick = (e: MouseEvent) => {
      ripples.push(createRipple(e.clientX, e.clientY))
    }
    window.addEventListener('click', handleClick)

    const animate = () => {
      ctx.clearRect(0, 0, canvas.width, canvas.height)
      ctx.shadowBlur = 15
      ctx.shadowColor = 'rgba(129, 140, 248, 0.5)'

      for (let i = 0; i < ripples.length; i++) {
        updateRipple(ripples[i])
        drawRipple(ripples[i])
        if (ripples[i].opacity <= 0) {
          ripples.splice(i, 1)
          i--
        }
      }
      frameId = requestAnimationFrame(animate)
    }
    animate()

    return () => {
      window.removeEventListener('resize', resize)
      window.removeEventListener('click', handleClick)
      cancelAnimationFrame(frameId)
    }
  }, [])

  return <canvas ref={canvasRef} className="pointer-events-none fixed inset-0 z-[9999]" />
}
