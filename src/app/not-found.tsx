import Link from 'next/link'

export default function NotFound() {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-white dark:bg-gray-900">
      <div className="text-center">
        <h1 className="text-6xl font-bold text-gray-900 dark:text-gray-100">404</h1>
        <p className="mt-4 text-xl text-gray-600 dark:text-gray-400">Page not found</p>
        <Link href="/" className="mt-6 inline-block rounded bg-blue-600 px-4 py-2 text-white hover:bg-blue-700">
          Go home
        </Link>
      </div>
    </div>
  )
}
