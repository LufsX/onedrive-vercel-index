'use client'

import { usePathname } from 'next/navigation'
import { useTranslations } from '../ClientProviders'

import Loading from '../Loading'
import DownloadButtonGroup from '../DownloadBtnGtoup'
import useTablePreview from '../../utils/useTablePreview'
import { DELIMITED_TEXT_ROW_LIMIT } from '../../utils/delimitedText'
import { DownloadBtnContainer, PreviewContainer } from './Containers'

const TablePreview = () => {
  const pathname = usePathname()
  const t = useTranslations()
  const { data, error, validating, retry } = useTablePreview(pathname)
  const { rows = [], truncated, truncation, malformed } = data ?? {}

  return (
    <div>
      <PreviewContainer>
        {error || malformed ? (
          <div className="p-3 text-sm">
            <p role="alert">{error ? t(error) : t('Invalid CSV/TSV format.')}</p>
            <button type="button" onClick={retry} className="mt-2 underline">
              {t('Retry')}
            </button>
          </div>
        ) : validating ? (
          <Loading loadingText={t('Loading file content...')} />
        ) : rows.length === 0 && !truncated ? (
          <p className="p-3 text-sm">{t('File is empty.')}</p>
        ) : (
          <>
            {truncated && (
              <p role="status" className="mb-3 text-sm text-gray-500 dark:text-gray-400">
                {truncation === 'rows'
                  ? t('Preview truncated to the first {{count}} rows. Download the file to view all rows.', {
                      count: DELIMITED_TEXT_ROW_LIMIT,
                    })
                  : t(
                      'Preview stopped at the size or complexity limit; only complete rows are shown. Download the file to view all rows.',
                    )}
              </p>
            )}
            {rows.length > 0 && (
              <div className="overflow-x-auto">
                <table className="w-full border-collapse text-left text-sm">
                  <tbody>
                    {rows.map((row, rowIndex) => (
                      <tr key={rowIndex}>
                        {row.map((cell, cellIndex) => (
                          <td
                            key={cellIndex}
                            className="border border-gray-200 px-3 py-1 align-top whitespace-pre dark:border-gray-700"
                          >
                            {cell}
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </>
        )}
      </PreviewContainer>
      <DownloadBtnContainer>
        <DownloadButtonGroup />
      </DownloadBtnContainer>
    </div>
  )
}

export default TablePreview
