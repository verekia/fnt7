import dynamic from 'next/dynamic'
import Head from 'next/head'

const TestApp = dynamic(() => import('../src/TestApp').then(m => m.TestApp), { ssr: false })

export default function TestPage() {
  return (
    <>
      <Head>
        <title>FNT7 — font inspector</title>
      </Head>
      <TestApp />
    </>
  )
}
