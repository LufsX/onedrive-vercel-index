import { useRouter } from 'next/router'
import { getBaseUrl } from '../../utils/getBaseUrl'
import { getStoredToken } from '../../utils/protectedRouteHandler'
import DownloadButtonGroup from '../DownloadBtnGtoup'
import { DownloadBtnContainer } from './Containers'

const PDFEmbedPreview: React.FC<{ file: any }> = ({ file }) => {
  const { asPath } = useRouter()
  const hashedToken = getStoredToken(asPath)

  const pdfPath = encodeURIComponent(
    `${getBaseUrl()}/api/raw/?path=${asPath}${hashedToken ? `&odpt=${hashedToken}` : ''}`,
  )
  const url = `https://mozilla.github.io/pdf.js/web/viewer.html?file=${pdfPath}`

  return (
    <div>
      <div className="h-[90vh] w-full overflow-hidden rounded">
        <iframe src={url} className="border-none" width="100%" height="100%" title="PDF Preview"></iframe>
      </div>
      <DownloadBtnContainer>
        <DownloadButtonGroup />
      </DownloadBtnContainer>
    </div>
  )
}

export default PDFEmbedPreview
