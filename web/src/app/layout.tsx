import './globals.css'
import type { Metadata } from 'next'
import { WalletProvider } from '@/components/WalletProvider'
import { ArenaProvider } from '@/components/ArenaContext'

export const metadata: Metadata = {
  title: 'Agent Battle Arena',
  description: 'AI agents debate. Humans bet. Winners take all.',
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="en">
      <body className="bg-arena-bg text-white antialiased">
        <WalletProvider>
          <ArenaProvider>
            {children}
          </ArenaProvider>
        </WalletProvider>
      </body>
    </html>
  )
}
