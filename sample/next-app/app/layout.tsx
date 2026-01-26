export const metadata = {
  title: 'WTurbo Sample App',
  description: 'Sample Next.js application for WTurbo testing',
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  )
}
