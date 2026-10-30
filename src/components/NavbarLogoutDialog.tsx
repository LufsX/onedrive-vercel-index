'use client'

import { useClientConfig } from './ClientConfigProvider'

import { Fragment, useState } from 'react'
import { useRouter } from 'next/navigation'
import { Dialog, DialogPanel, DialogTitle, Transition, TransitionChild } from '@headlessui/react'
import { KeyRound, Trash2 } from 'lucide-react'
import toast from 'react-hot-toast'

import { useTranslations } from './ClientProviders'

export default function NavbarLogoutDialog({ onClose }: { onClose: () => void }) {
  const { siteConfig } = useClientConfig()
  const [isOpen, setIsOpen] = useState(true)
  const router = useRouter()
  const t = useTranslations()

  const clearTokens = () => {
    setIsOpen(false)

    siteConfig.protectedRoutes.forEach(r => {
      localStorage.removeItem(r)
    })

    toast.success(t('Cleared all tokens'))
    setTimeout(() => {
      router.refresh()
    }, 1000)
  }

  return (
    <Transition appear show={isOpen} as={Fragment} afterLeave={onClose}>
      <Dialog as="div" className="fixed inset-0 z-10 overflow-y-auto" open={isOpen} onClose={() => setIsOpen(false)}>
        <div className="min-h-screen px-4 text-center">
          <TransitionChild
            as={Fragment}
            enter="ease-out duration-100"
            enterFrom="opacity-0"
            enterTo="opacity-100"
            leave="ease-in duration-50"
            leaveFrom="opacity-100"
            leaveTo="opacity-0"
          >
            <div className="fixed inset-0 cursor-pointer bg-gray-50 dark:bg-gray-800" />
          </TransitionChild>

          {/* This element is to trick the browser into centering the modal contents. */}
          <span className="inline-block h-screen align-middle" aria-hidden="true">
            &#8203;
          </span>
          <TransitionChild
            as={Fragment}
            enter="ease-out duration-100"
            enterFrom="opacity-0 scale-95"
            enterTo="opacity-100 scale-100"
            leave="ease-in duration-50"
            leaveFrom="opacity-100 scale-100"
            leaveTo="opacity-0 scale-95"
          >
            <DialogPanel className="relative z-10 my-8 inline-block w-full max-w-md transform overflow-hidden rounded-lg bg-white p-6 text-left align-middle transition-all dark:bg-gray-900">
              <DialogTitle className="text-lg font-bold text-gray-900 dark:text-gray-100">
                {t('Clear all tokens?')}
              </DialogTitle>
              <div className="mt-2">
                <p className="text-sm text-gray-500">
                  {t('These tokens are used to authenticate yourself into password protected folders, ') +
                    t('clearing them means that you will need to re-enter the passwords again.')}
                </p>
              </div>

              <div className="mt-4 max-h-32 overflow-y-scroll font-mono text-sm dark:text-gray-100">
                {siteConfig.protectedRoutes.map((r, i) => (
                  <div key={i} className="flex items-center gap-1">
                    <KeyRound className="h-4 w-4" />
                    <span className="truncate">{r}</span>
                  </div>
                ))}
              </div>

              <div className="mt-8 flex items-center justify-end">
                <button
                  className="mr-3 inline-flex items-center justify-center gap-2 rounded bg-blue-500 px-4 py-2 text-white hover:bg-blue-400 focus:ring focus:ring-blue-300 focus:outline-hidden"
                  onClick={() => setIsOpen(false)}
                >
                  {t('Cancel')}
                </button>
                <button
                  className="inline-flex items-center justify-center gap-2 rounded bg-red-500 px-4 py-2 text-white hover:bg-red-400 focus:ring focus:ring-red-300 focus:outline-hidden"
                  onClick={() => clearTokens()}
                >
                  <Trash2 className="h-4 w-4" />
                  <span>{t('Clear all')}</span>
                </button>
              </div>
            </DialogPanel>
          </TransitionChild>
        </div>
      </Dialog>
    </Transition>
  )
}
