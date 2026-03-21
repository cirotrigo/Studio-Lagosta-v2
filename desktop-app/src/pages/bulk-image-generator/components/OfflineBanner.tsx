import { WifiOff } from 'lucide-react'
import { motion, AnimatePresence } from 'framer-motion'

interface OfflineBannerProps {
  isOnline: boolean
}

export default function OfflineBanner({ isOnline }: OfflineBannerProps) {
  return (
    <AnimatePresence>
      {!isOnline && (
        <motion.div
          initial={{ opacity: 0, y: -20 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -20 }}
          className="flex items-center justify-center gap-2 py-2 bg-yellow-500/20 text-yellow-400 text-sm"
        >
          <WifiOff size={16} />
          <span>Voce esta offline. A fila sera retomada quando a conexao for restaurada.</span>
        </motion.div>
      )}
    </AnimatePresence>
  )
}
