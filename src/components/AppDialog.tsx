'use client'

import { Fragment, type ReactNode, type RefObject } from 'react'
import { Dialog, DialogPanel, DialogTitle, Transition, TransitionChild } from '@headlessui/react'
import { X } from 'lucide-react'

import { useTranslations } from './ClientProviders'
import { uiIconButton, uiPanel } from './uiStyles'

type AppDialogProps = {
  open: boolean
  onClose: () => void
  title: ReactNode
  children: ReactNode
  footer?: ReactNode
  className?: string
  size?: 'sm' | 'md' | 'lg'
  initialFocus?: RefObject<HTMLElement | null>
  closeDisabled?: boolean
  afterLeave?: () => void
}

const sizes = { sm: 'max-w-sm', md: 'max-w-md', lg: 'max-w-3xl' }

export default function AppDialog({
  open,
  onClose,
  title,
  children,
  footer,
  className = '',
  size = 'md',
  initialFocus,
  closeDisabled = false,
  afterLeave,
}: AppDialogProps) {
  const t = useTranslations()
  const close = () => {
    if (!closeDisabled) onClose()
  }

  return (
    <Transition appear show={open} as={Fragment} afterLeave={afterLeave}>
      <Dialog as="div" className="fixed inset-0 z-[200]" onClose={close} initialFocus={initialFocus}>
        <TransitionChild
          as={Fragment}
          enter="transition-opacity duration-[130ms] ease-out motion-reduce:transition-none motion-reduce:duration-0"
          enterFrom="opacity-0"
          enterTo="opacity-100"
          leave="transition-opacity duration-[90ms] ease-in motion-reduce:transition-none motion-reduce:duration-0"
          leaveFrom="opacity-100"
          leaveTo="opacity-0"
        >
          <div aria-hidden="true" className="fixed inset-0 bg-gray-900/30 backdrop-blur-xs dark:bg-gray-900/70" />
        </TransitionChild>

        <div className="fixed inset-0 overflow-y-auto">
          <div className="flex min-h-full items-center justify-center p-4">
            <TransitionChild
              as={Fragment}
              enter="transition duration-[130ms] ease-out motion-reduce:transition-none motion-reduce:duration-0"
              enterFrom="opacity-0 scale-95 motion-reduce:transform-none"
              enterTo="opacity-100 scale-100"
              leave="transition duration-[90ms] ease-in motion-reduce:transition-none motion-reduce:duration-0"
              leaveFrom="opacity-100 scale-100"
              leaveTo="opacity-0 scale-95 motion-reduce:transform-none"
            >
              <DialogPanel
                className={`${uiPanel} relative flex max-h-[calc(100dvh-2rem)] w-full flex-col overflow-hidden text-left text-sm shadow-2xl ring-1 ring-black/5 ${sizes[size]} ${className}`}
              >
                <div className="flex shrink-0 items-center justify-between gap-3 border-b border-gray-400/30 bg-gray-50 px-4 py-2 dark:bg-gray-800">
                  <DialogTitle as="h3" className="min-w-0 text-sm font-semibold text-gray-900 dark:text-gray-100">
                    {title}
                  </DialogTitle>
                  <button
                    type="button"
                    className={uiIconButton}
                    aria-label={t('Close')}
                    onClick={close}
                    disabled={closeDisabled}
                  >
                    <X className="h-4 w-4" />
                  </button>
                </div>
                <div className="min-h-0 overflow-x-hidden overflow-y-auto px-4 py-3">{children}</div>
                {footer && (
                  <div className="flex shrink-0 items-center justify-end gap-2 border-t border-gray-400/30 bg-gray-50 px-4 py-2 dark:bg-gray-800">
                    {footer}
                  </div>
                )}
              </DialogPanel>
            </TransitionChild>
          </div>
        </div>
      </Dialog>
    </Transition>
  )
}
