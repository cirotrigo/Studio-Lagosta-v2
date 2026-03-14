import { memo } from 'react'

/**
 * Lumina-style gradient background with subtle orange radial glow
 */
export const GradientBackground = memo(() => {
  return (
    <div className="fixed inset-0 -z-10 pointer-events-none">
      {/* Base dark background */}
      <div className="absolute inset-0 bg-[#050505]" />

      {/* Radial gradient - subtle orange glow from center-bottom */}
      <div
        className="absolute inset-0"
        style={{
          background: 'radial-gradient(ellipse 80% 50% at 50% 100%, rgba(234, 88, 12, 0.08) 0%, transparent 50%)',
        }}
      />

      {/* Secondary radial - top highlight */}
      <div
        className="absolute inset-0"
        style={{
          background: 'radial-gradient(ellipse 60% 40% at 50% 0%, rgba(255, 255, 255, 0.02) 0%, transparent 50%)',
        }}
      />

      {/* Subtle noise texture overlay */}
      <div
        className="absolute inset-0 opacity-[0.015]"
        style={{
          backgroundImage: `url("data:image/svg+xml,%3Csvg viewBox='0 0 256 256' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='noise'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='4' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23noise)'/%3E%3C/svg%3E")`,
        }}
      />

      {/* Vignette effect */}
      <div
        className="absolute inset-0"
        style={{
          background: 'radial-gradient(ellipse at center, transparent 0%, rgba(0, 0, 0, 0.3) 100%)',
        }}
      />
    </div>
  )
})

GradientBackground.displayName = 'GradientBackground'

export default GradientBackground
