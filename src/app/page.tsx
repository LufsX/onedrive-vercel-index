import Navbar from '../components/Navbar'
import FileListing from '../components/FileListing'
import Footer from '../components/Footer'
import Breadcrumb from '../components/Breadcrumb'
import SwitchLayout from '../components/SwitchLayout'

export default function Home() {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-white dark:bg-gray-900">
      <main className="flex w-full flex-1 flex-col bg-gray-50 dark:bg-gray-800">
        <Navbar />
        <div className="mx-auto w-full max-w-5xl px-1 py-4 sm:px-4">
          <nav className="mb-4 flex items-center justify-between gap-3 sm:pl-1">
            <div className="min-w-0 flex-1">
              <Breadcrumb />
            </div>
            <div className="relative flex shrink-0 items-center gap-1">
              <div data-upload-actions className="flex items-center gap-1 empty:hidden" />
              <SwitchLayout />
            </div>
          </nav>
          <FileListing />
        </div>
      </main>

      <Footer />
    </div>
  )
}
